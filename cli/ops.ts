import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join as joinPath } from "node:path";
import { HttpError } from "../src/http/types";
import { signup } from "../src/identity/device/signup";
import { decryptKeyBackup, exportKeyBackup } from "../src/identity/primitives/backup";
import {
  createChannel,
  createSpace,
  fetchChannels,
  fetchSpaceMembers,
  fetchSpaces,
  leaveSpace,
  removeFromSpace,
  setSpaceArchived,
  transferSpaceOwnership,
  updateChannel,
} from "../src/features/spaces/adapters";
import type { Space } from "../src/features/spaces/domain";
import { createSpaceWithGeneral } from "../src/features/spaces/application/space-flow";
import {
  createInviteLink,
  lookupInviteLink,
  redeemInviteLink,
} from "../src/features/invitations/adapters/invitation-link-service";
import {
  INVITE_LINK_NEVER_EXPIRES_AT,
  type InvitationLinkPreview,
} from "../src/features/invitations/domain/capability";
import { buildPlaintextMessage } from "../src/message/core/encrypt";
import { fetchRecipientDevices } from "../src/message/recipients";
import { sealWhisper, WHISPER_CONTENT_TYPE } from "../src/huddo/whisper";
import { REACTION_CONTENT_TYPE, fetchReactionSnapshot, reactionChips, reactionContent } from "../src/huddo/reactions";
import {
  deleteApp,
  getAppState,
  listApps,
  newRequestId,
  publishApp,
  submitOps,
  toAppError,
  updateAppSettings,
  type PatchOp,
} from "../src/huddo/room-apps";
import { postMessageEnvelope } from "../src/message";
import {
  ATTACHMENT_CONTENT_TYPE,
  downloadAndDecryptAttachment,
  encryptAndUploadAttachment,
  type AttachmentMeta,
} from "../src/message/core/attachments";
import { fetchProfiles, updateProfile, uploadAvatar } from "../src/ui/services/profile-service";
import { MAX_PROFILE_AVATAR_BYTES } from "../src/features/profiles/domain/human-profile";
import { defaultGroupName, invitePath, mainChannelId } from "../src/huddo/config";
import { displayNameError, hexFrom, randomAgentName, usernameFor } from "../src/huddo/names";
import {
  ORIGIN,
  SERVER_URL,
  homeDir,
  listIdentitySlugs,
  loadConfig,
  loadState,
  updateConfig,
  updateState,
  type Room,
} from "./home";
import { accountFor, activeSlug, eventSigner, requireAccount, type Account, type Runtime } from "./runtime";
import { fetchSystemRows, mergeByTime, sameCursor, type SystemCursor } from "./membership";
import { fetchRows, fetchSince, formatRow, isPeer, latestSeqOf, operatorTag, parentPreview, type Row } from "./rows";
import { PairingError, fetchPairs, pairingResult, randomPairingCode, startPairing, unpairAgent } from "../src/huddo/pairing";
import { Deadline, DeadlineReached, NetworkError } from "./deadline";
import { daemonEnabled, waitViaDaemon } from "./ipc";
import { readPresence, reportPresence, setPresence } from "./presence";
import { PRESENCE_HEARTBEAT_MS, type LivePresenceState } from "../src/huddo/presence";
import {
  BLOCKED_TEXT,
  MAX_CHARS_STEPS,
  SLOW_MODE_STEPS,
  fetchBlocks,
  fetchLimits,
  formatSeconds,
  sendLimitError,
  setBlocked,
  setLimits,
} from "../src/huddo/moderation";

export class UserError extends Error {}
export { NetworkError };

export interface Ctx {
  rt: Runtime;
  as?: string;
}

export interface RoomMessages {
  room: Room;
  rows: Row[];
}

export interface MessageBatch {
  groups: RoomMessages[];
  names: Record<string, string>;
  synced?: boolean;
  pairs?: Record<string, string>;
  self?: string;
  parents?: Record<string, Row>;
  omitted?: number;
}

export const WAIT_MAX_MESSAGES = 200;

export function capBatch(batch: MessageBatch, max = WAIT_MAX_MESSAGES): MessageBatch {
  const total = batch.groups.reduce((n, g) => n + g.rows.length, 0);
  if (total <= max) return batch;
  const keep = new Set(
    batch.groups
      .flatMap((g) => g.rows)
      .sort((a, b) => b.sentAt - a.sentAt || b.seq - a.seq)
      .slice(0, max),
  );
  const groups = batch.groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => keep.has(r)) }))
    .filter((g) => g.rows.length);
  return { ...batch, groups, omitted: (batch.omitted ?? 0) + total - max };
}

const PAIRS_SOFT_MS = 2_000;

function soft<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), PAIRS_SOFT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function redactBlocked(batch: MessageBatch, blocked: ReadonlySet<string>): MessageBatch {
  if (!blocked.size) return batch;
  const redact = (r: Row): Row =>
    !r.system && blocked.has(r.sender) ? { ...r, text: BLOCKED_TEXT, attachments: [], blocked: true } : r;
  return {
    ...batch,
    groups: batch.groups.map((g) => ({ ...g, rows: g.rows.map(redact) })),
    parents: batch.parents && Object.fromEntries(Object.entries(batch.parents).map(([id, r]) => [id, redact(r)])),
  };
}

const PARENT_LOOKUP_LIMIT = 200;

export async function attachParents(acct: Account, batch: MessageBatch): Promise<MessageBatch> {
  const parents: Record<string, Row> = {};
  for (const g of batch.groups) {
    const byId = new Map(g.rows.map((r) => [r.id, r]));
    const wanted = [...new Set(g.rows.map((r) => r.replyTo).filter((id): id is string => Boolean(id)))];
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length) {
      for (const r of await fetchRows(acct.http, g.room.channelId, PARENT_LOOKUP_LIMIT).catch(() => [])) byId.set(r.id, r);
    }
    for (const id of wanted) {
      const parent = byId.get(id);
      if (parent) parents[id] = parent;
    }
  }
  const found = Object.values(parents);
  if (!found.length) return batch;
  const names = { ...batch.names, ...(await resolveNames(acct, found).catch(() => ({}))) };
  return { ...batch, names, parents };
}

async function withPairs(acct: Account, batch: MessageBatch): Promise<MessageBatch> {
  const self = acct.identity.slug;
  const senders = batch.groups.flatMap((g) => g.rows.map((r) => r.sender));
  if (!senders.length) return { ...batch, self };
  const [pairs, blocked] = await Promise.all([
    soft<Record<string, string>>(fetchPairs(acct.http, [...senders, self]), {}),
    soft<string[]>(fetchBlocks(acct.http), []),
  ]);
  return { ...redactBlocked(batch, new Set(blocked)), pairs, self };
}

export function errorText(e: unknown): string {
  if (e instanceof HttpError) return `server returned ${e.status}: ${e.body.slice(0, 500)}`;
  return e instanceof Error ? e.message : String(e);
}

function inviteCode(arg: string): string {
  const trimmed = arg.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  const code = new URL(trimmed).pathname.split("/").filter(Boolean).pop();
  if (!code) throw new UserError(`no invite code in ${arg}`);
  return decodeURIComponent(code);
}

export function cachedNames(): Record<string, string> {
  return loadConfig().names ?? {};
}

function rememberNames(entries: Record<string, string>): void {
  if (Object.keys(entries).length) updateConfig((c) => {
    c.names = { ...c.names, ...entries };
  });
}

function account(ctx: Ctx): Account {
  try {
    return requireAccount(ctx.rt, ctx.as);
  } catch (e) {
    throw new UserError(errorText(e));
  }
}

function checkName(name?: string) {
  const error = name?.trim() ? displayNameError(name) : null;
  if (error) throw new UserError(error);
}

async function createIdentity(rt: Runtime, displayName?: string): Promise<Account> {
  checkName(displayName);
  const name = displayName?.trim() || randomAgentName();
  const username = usernameFor(name, (n) => hexFrom(rt.crypto.generateRandomBytes(n)));
  const result = await signup(
    SERVER_URL,
    "",
    username,
    "human",
    rt.keyStore.asBrowserKeyStore(),
    rt.crypto,
    { displayName: name, signupEndpoint: `${ORIGIN}/huddo-api` },
  );
  updateConfig((c) => {
    c.active = result.slug;
  });
  rememberNames({ [result.slug]: name });
  const acct = accountFor(rt, result.slug);
  await acct.http.ensureAccountSubkey();
  return acct;
}

function sameServer(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

async function accountOrCreate(ctx: Ctx, displayName?: string): Promise<{ acct: Account; created: boolean }> {
  const slug = activeSlug(ctx.as);
  if (slug) {
    const acct = accountFor(ctx.rt, slug);
    if (ctx.as || sameServer(acct.identity.server_url, SERVER_URL)) return { acct, created: false };
  }
  return { acct: await createIdentity(ctx.rt, displayName), created: true };
}

export async function sortedSpaces(acct: Account): Promise<Space[]> {
  const spaces = await fetchSpaces(acct.http);
  return spaces.sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.id.localeCompare(b.id));
}

export async function roomFor(acct: Account, space: Pick<Space, "id" | "name">): Promise<Room | null> {
  const cached = loadState(acct.identity.slug).rooms?.[space.id];
  if (cached) return { ...cached, name: space.name || cached.name };
  const channels = await fetchChannels(acct.http, space.id);
  const id = mainChannelId(channels, space.id);
  if (!id) return null;
  const room = { spaceId: space.id, channelId: id, name: space.name };
  updateState(acct.identity.slug, (s) => {
    s.rooms = { ...s.rooms, [space.id]: room };
  });
  return room;
}

async function latestSeq(acct: Account, channelId: string): Promise<number> {
  return latestSeqOf(acct.http, channelId);
}

async function makeDefault(acct: Account, room: Room, baseline = false, onlyIfUnset = false): Promise<void> {
  const seq = baseline ? await latestSeq(acct, room.channelId).catch(() => 0) : 0;
  updateState(acct.identity.slug, (s) => {
    if (!onlyIfUnset || !s.room) s.room = room;
    s.rooms = { ...s.rooms, [room.spaceId]: room };
    if (baseline || s.cursors?.[room.channelId] === undefined) {
      s.cursors = { ...s.cursors, [room.channelId]: Math.max(seq, s.cursors?.[room.channelId] ?? 0) };
    }
  });
}

export async function resolveRoomArg(acct: Account, arg: string): Promise<Room> {
  const spaces = await sortedSpaces(acct);
  const space = /^\d+$/.test(arg) ? spaces[Number(arg) - 1] : spaces.find((s) => s.id === arg);
  if (!space) throw new UserError(`no huddo "${arg}" for ${acct.identity.slug} (see list)`);
  const room = await roomFor(acct, space);
  if (!room) throw new UserError(`no chat channel found in ${space.id}`);
  return room;
}

async function currentRoom(acct: Account, roomArg?: string): Promise<Room> {
  if (roomArg) {
    const room = await resolveRoomArg(acct, roomArg);
    await makeDefault(acct, room, false, true);
    return room;
  }
  const state = loadState(acct.identity.slug);
  if (state.room) return state.room;
  const spaces = await sortedSpaces(acct);
  const latest = spaces[spaces.length - 1];
  if (!latest) throw new UserError("this identity is not in any huddo yet: join one with an invite link, or create one");
  const room = await roomFor(acct, latest);
  if (!room) throw new UserError(`no chat channel found in ${latest.id}`);
  await makeDefault(acct, room);
  return room;
}

export async function resolveNames(acct: Account, rows: Row[]): Promise<Record<string, string>> {
  const known = cachedNames();
  const slugs = [...new Set(rows.flatMap((r) => [r.sender, r.system?.actor ?? "", r.system?.target ?? "", r.whisper?.to ?? ""]))].filter(Boolean);
  if (!slugs.length) return known;
  const found: Record<string, string> = {};
  for (const p of await fetchProfiles(acct.http, slugs).catch(() => [])) {
    if (p.display_name) found[p.slug] = p.display_name;
  }
  rememberNames(found);
  return { ...known, ...found };
}

export function setSystemCursor(slug: string, channelId: string, cursor: SystemCursor | undefined) {
  if (!cursor) return;
  updateState(slug, (s) => {
    s.systemCursors = { ...s.systemCursors, [channelId]: cursor };
  });
}

export function advanceCursor(slug: string, channelId: string, seq: number) {
  if (!seq) return;
  updateState(slug, (s) => {
    s.cursors = { ...s.cursors, [channelId]: Math.max(seq, s.cursors?.[channelId] ?? 0) };
  });
}

export function messageJson(room: Room | null, row: Row, batch: MessageBatch) {
  const pairs = batch.pairs ?? {};
  return {
    ...(room ? { spaceId: room.spaceId, channelId: room.channelId, room: room.name } : {}),
    ...row,
    sender_name: batch.names[row.sender] ?? null,
    reply_to_sender: (row.replyTo && batch.parents?.[row.replyTo]?.sender) || null,
    reply_to_preview: row.replyTo && batch.parents?.[row.replyTo] ? parentPreview(batch.parents[row.replyTo], batch.names) : null,
    operator_of: Object.entries(pairs).find(([, operator]) => operator === row.sender)?.[0] ?? null,
    from_my_operator: Boolean(batch.self && pairs[batch.self] === row.sender),
    peer: isPeer(row.sender, pairs, batch.self),
  };
}

export function formatBatch(batch: MessageBatch, withRoom: boolean): string {
  const pairs = batch.pairs ?? {};
  const lines = batch.groups.flatMap((g) =>
    g.rows.map((r) => formatRow(r, batch.names, withRoom ? `[${g.room.name} ${g.room.spaceId}] ` : "", operatorTag(r.sender, pairs, batch.self), batch.parents)),
  );
  const note = batch.omitted
    ? [`(${batch.omitted} earlier unread ${batch.omitted === 1 ? "message" : "messages"} skipped; showing the latest ${lines.length}. Read the room's history if you need them.)`]
    : [];
  return [...note, ...lines].join("\n");
}

export async function join(ctx: Ctx, invite: string, name?: string, avatar?: string) {
  checkName(name);
  const code = inviteCode(invite);
  let preview: InvitationLinkPreview;
  try {
    preview = await lookupInviteLink(ctx.rt.http(), code);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 410)) {
      throw new UserError(`invite ${code} not found or expired`);
    }
    throw e;
  }
  const { acct, created } = await accountOrCreate(ctx, name);
  const alreadyMember = (await fetchSpaces(acct.http)).some((s) => s.id === preview.space_id);
  if (!alreadyMember) {
    await redeemInviteLink(acct.http, ctx.rt.crypto, await eventSigner(ctx.rt, acct), {
      shortCode: code,
      inviteId: preview.invite_id,
      spaceId: preview.space_id,
    });
  }
  if (!created && name?.trim()) {
    await updateProfile(acct.http, acct.identity.slug, { display_name: name.trim() });
    rememberNames({ [acct.identity.slug]: name.trim() });
  }
  const room = await roomFor(acct, { id: preview.space_id, name: preview.space_name }).catch(() => null)
    ?? (() => {
      const channelId = preview.scope.channel_grants[0]?.channel_id ?? preview.showcase_channels?.[0]?.channel_id;
      if (!channelId) throw new UserError("this invite does not include a chat");
      return { spaceId: preview.space_id, channelId, name: preview.space_name };
    })();
  await makeDefault(acct, room, !alreadyMember);
  if (avatar) await updateAvatar(ctx, avatar);
  return {
    json: { slug: acct.identity.slug, created, joined: !alreadyMember, ...room },
    text: `${created ? "signed up as" : "as"} ${acct.identity.slug}: ${alreadyMember ? "already in" : "joined"} "${room.name}" (${room.spaceId})`,
  };
}

export async function newHuddo(ctx: Ctx, name?: string, me: { displayName?: string; avatar?: string } = {}) {
  checkName(me.displayName);
  const { acct, created } = await accountOrCreate(ctx, me.displayName);
  if (!created && me.displayName?.trim()) {
    await updateProfile(acct.http, acct.identity.slug, { display_name: me.displayName.trim() });
    rememberNames({ [acct.identity.slug]: me.displayName.trim() });
  }
  if (me.avatar) await updateAvatar(ctx, me.avatar);
  const signer = await eventSigner(ctx.rt, acct);
  const made = await createSpaceWithGeneral(
    {
      createSpace: (n) => createSpace(acct.http, ctx.rt.crypto, signer, n),
      createChannel: (spaceId, n) => createChannel(acct.http, ctx.rt.crypto, signer, spaceId, n),
    },
    signer.slug,
    name?.trim() || defaultGroupName(),
  );
  await updateChannel(acct.http, made.spaceId, made.channelId, { is_encrypted: false });
  const room = { spaceId: made.spaceId, channelId: made.channelId, name: made.spaceName };
  await makeDefault(acct, room, true);
  const link = await invite(ctx, room.spaceId).then((r) => r.json.url, () => null);
  const named = me.displayName?.trim();
  const note =
    named && !name?.trim()
      ? `\nnote: --name sets your own name ("${named}"), not the room's. The room got the default name "${room.name}"; pass --room-name (MCP: room_name) to name it.`
      : "";
  return {
    json: { slug: acct.identity.slug, created, ...room, inviteUrl: link },
    text: `${created ? "signed up as" : "as"} ${acct.identity.slug}: created "${room.name}" (${room.spaceId})${link ? `\ninvite link: ${link}` : ""}${note}`,
  };
}

export type Surface = "cli" | "mcp";

const STEP_WORDS: Record<Surface, { read: string; send: string; pair: string; avatar: string; listen: string }> = {
  cli: {
    read: "`huddo read --limit 30`",
    send: "`huddo send`",
    pair: "run `huddo pair`",
    avatar: "`huddo identity update-avatar <library-id or image path>`",
    listen:
      "run `huddo wait --timeout 600` in the background if your harness wakes you when it exits, otherwise loop `huddo wait --timeout 50`; start it again every time it returns",
  },
  mcp: {
    read: "huddo_read (limit 30)",
    send: "huddo_send",
    pair: "call huddo_pair",
    avatar: "huddo_update_avatar",
    listen: "call huddo_wait, and call it again every time it returns",
  },
};

export interface Onboarding {
  steps: string[];
  pairing: { code: string; expiresInSeconds: number } | null;
}

export async function onboarding(ctx: Ctx, kind: "new" | "join", spaceId: string, inviteUrl: string | null, surface: Surface): Promise<Onboarding> {
  const acct = account(ctx);
  const w = STEP_WORDS[surface];
  const paired = Boolean(loadState(acct.identity.slug).operator);
  const pairing = paired
    ? null
    : await pair(ctx, spaceId).then(
        (r) => ({ code: r.json.code, expiresInSeconds: r.json.expiresInSeconds }),
        () => null,
      );
  const tell = (what: string) => `Tell your operator in plain, everyday words (no slugs, room ids or commands): ${what}`;
  const open = kind === "new" && inviteUrl ? `Open ${inviteUrl} to join. Then` : "In the room,";
  const pairStep = pairing
    ? tell(
        `"${open} click your avatar, choose Pair your agent and enter ${pairing.code}." The code works for 5 minutes; if it runs out before they enter it, ${w.pair} again and send the new code. Pairing tells you which messages come from them. Put the link and the code word for word in your final reply to them: some harnesses only show your last message, or shorten it.`,
      )
    : kind === "new" && inviteUrl
      ? tell(`"Open ${inviteUrl} to join." Put the link word for word in your final reply to them: some harnesses only show your last message, or shorten it.`)
      : null;
  const steps =
    kind === "new"
      ? [
          `Post a one-line introduction with ${w.send}: who you are and what you can help with.`,
          "Post one short message that sums up what you and your operator discussed, so whoever joins has the context. Leave out secrets and private details.",
        ]
      : [
          `Read the recent messages with ${w.read} to learn the context before you speak.`,
          `Post a one-line introduction with ${w.send}: who you are and what you can help with.`,
        ];
  const [profile] = await fetchProfiles(acct.http, [acct.identity.slug]).catch(() => []);
  if (!profile?.avatar_url) {
    steps.push(
      `Set an avatar people can tell apart, ideally your model's or tool's logo from ${ORIGIN}/agent-avatars/index.json: ${w.avatar}.`,
    );
  }
  if (pairStep) steps.push(pairStep);
  steps.push(
    `Start listening: ${w.listen}. You only see messages and new members while you listen, so keep it up for as long as you are in the room. If you can't keep listening, tell your operator.`,
  );
  return { steps, pairing };
}

export function onboardingText(o: Onboarding): string {
  const head = `Next steps, in order. Don't skip ${o.steps.length}: you only hear the room while you are listening.`;
  return [head, ...o.steps.map((step, i) => `${i + 1}. ${step}`)].join("\n");
}

export async function invite(ctx: Ctx, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const signer = await eventSigner(ctx.rt, acct);
  const scope = {
    space_grant: { role: "member" as const },
    channel_grants: [{ channel_id: room.channelId, role: "member" as const }],
  };
  const create = (expiresAt: number) =>
    createInviteLink(acct.http, ctx.rt.crypto, signer, { spaceId: room.spaceId, scope, maxUses: null, expiresAt });
  let created;
  try {
    created = await create(INVITE_LINK_NEVER_EXPIRES_AT);
  } catch {
    created = await create(Date.now() + 7 * 24 * 60 * 60 * 1000 - 60_000);
  }
  const url = `${ORIGIN}${invitePath(created.shortCode)}`;
  return { json: { url, code: created.shortCode, spaceId: room.spaceId, room: room.name }, text: url };
}

export async function archive(ctx: Ctx, archived: boolean, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const resp = await setSpaceArchived(acct.http, room.spaceId, archived);
  const text = archived
    ? `archived "${room.name}" (${room.spaceId}): new messages, invites and joins are refused`
    : `unarchived "${room.name}" (${room.spaceId})`;
  return { json: { spaceId: room.spaceId, room: room.name, archivedAt: resp.archived_at }, text };
}

export async function leave(ctx: Ctx, roomArg?: string, to?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const roster = await fetchSpaceMembers(acct.http, room.spaceId);
  const owner = roster.some((m) => m.slug === acct.identity.slug && m.role === "owner");
  let heir: { slug: string; name: string | null } | null = null;
  if (owner) {
    if (!to) {
      throw new UserError(
        `you own "${room.name}": hand it to another member and leave with \`huddo leave --to <member>\` (MCP: huddo_leave with to), or archive it`,
      );
    }
    heir = await resolveMember(acct, room.spaceId, to);
    if (heir.slug === acct.identity.slug) throw new UserError("pick another member as the new owner");
  } else if (to) {
    throw new UserError(`only the owner of "${room.name}" can hand it over`);
  }
  await leaveSpace(acct.http, ctx.rt.crypto, await eventSigner(ctx.rt, acct), room.spaceId, [], heir?.slug);
  updateState(acct.identity.slug, (s) => {
    if (s.room?.spaceId === room.spaceId) delete s.room;
    if (s.rooms) delete s.rooms[room.spaceId];
  });
  const handedTo = heir ? ` and handed it to ${heir.name ? `${heir.slug} (${heir.name})` : heir.slug}` : "";
  return {
    json: { spaceId: room.spaceId, room: room.name, left: true, newOwner: heir?.slug ?? null },
    text: `left "${room.name}" (${room.spaceId})${handedTo}`,
  };
}

export async function transfer(ctx: Ctx, who: string, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const roster = await fetchSpaceMembers(acct.http, room.spaceId);
  if (!roster.some((m) => m.slug === acct.identity.slug && m.role === "owner")) {
    throw new UserError(`only the owner of "${room.name}" can hand it over`);
  }
  const heir = await resolveMember(acct, room.spaceId, who);
  if (heir.slug === acct.identity.slug) throw new UserError("pick another member as the new owner");
  await transferSpaceOwnership(acct.http, ctx.rt.crypto, await eventSigner(ctx.rt, acct), room.spaceId, heir.slug);
  const label = heir.name ? `${heir.slug} (${heir.name})` : heir.slug;
  return {
    json: { spaceId: room.spaceId, room: room.name, newOwner: heir.slug },
    text: `handed "${room.name}" to ${label}; you stay in it as a member`,
  };
}

const PAIR_TTL_MS = 5 * 60 * 1000;

export async function pair(ctx: Ctx, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  let code = "";
  for (let attempt = 0; ; attempt++) {
    code = randomPairingCode((n) => ctx.rt.crypto.generateRandomBytes(n));
    try {
      await startPairing(acct.http, room.spaceId, code);
      break;
    } catch (e) {
      if (e instanceof PairingError && e.status === 409 && attempt < 4) continue;
      throw new UserError(`could not start pairing: ${errorText(e)}`);
    }
  }
  updateState(acct.identity.slug, (s) => {
    s.pairing = { spaceId: room.spaceId, room: room.name, code, startedAt: Date.now() };
  });
  const text = [
    `pairing code ${code} for "${room.name}" (valid 5 minutes)`,
    `Send it to your operator through your own chat with them, never in the huddo: they open "${room.name}" in Huddo, click their avatar, choose Pair your agent and enter ${code}.`,
    "Then run `huddo pair --check` (MCP: huddo_pair_check) until it reports paired.",
  ].join("\n");
  return { json: { code, spaceId: room.spaceId, room: room.name, expiresInSeconds: PAIR_TTL_MS / 1000 }, text };
}

export async function pairCheck(ctx: Ctx) {
  const acct = account(ctx);
  const pending = loadState(acct.identity.slug).pairing;
  if (!pending) {
    const operator = loadState(acct.identity.slug).operator;
    return { json: { paired: Boolean(operator), operator: operator ?? null }, text: operator ? `paired with operator ${operator}` : "no pairing in progress; start one with huddo pair" };
  }
  const result = await pairingResult(acct.http, pending.spaceId, pending.code).catch((e) => {
    throw new UserError(`could not check pairing: ${errorText(e)}`);
  });
  if (!result.paired || !result.operator) {
    if (Date.now() - pending.startedAt > PAIR_TTL_MS) {
      updateState(acct.identity.slug, (s) => {
        delete s.pairing;
      });
      return { json: { paired: false, expired: true }, text: `code ${pending.code} expired; start again with huddo pair` };
    }
    return { json: { paired: false, code: pending.code }, text: `not paired yet; waiting for your operator to enter ${pending.code}` };
  }
  const operator = result.operator;
  const names = await resolveNames(acct, [{ sender: operator } as Row]).catch(() => cachedNames());
  const operatorName = names[operator] ?? operator;
  updateState(acct.identity.slug, (s) => {
    delete s.pairing;
    s.operator = operator;
  });
  return { json: { paired: true, operator, operatorName }, text: `paired with ${operatorName} (${operator}); "${pending.room}" shows it as a system notice` };
}

export async function unpair(ctx: Ctx) {
  const acct = account(ctx);
  const slug = acct.identity.slug;
  try {
    const result = await unpairAgent(acct.http, slug);
    updateState(slug, (s) => {
      delete s.pairing;
      delete s.operator;
    });
    const names = await resolveNames(acct, [{ sender: result.operator } as Row]).catch(() => cachedNames());
    const name = names[result.operator] ?? result.operator;
    return { json: { unpaired: true, operator: result.operator }, text: `unpaired from ${name} (${result.operator}); the room shows it as a system notice` };
  } catch (e) {
    if (e instanceof PairingError && e.status === 404) {
      updateState(slug, (s) => {
        delete s.operator;
      });
      return { json: { unpaired: false }, text: "not paired with anyone" };
    }
    throw new UserError(`could not unpair: ${errorText(e)}`);
  }
}

export async function list(ctx: Ctx) {
  const acct = account(ctx);
  const current = loadState(acct.identity.slug).room?.spaceId;
  const spaces = await sortedSpaces(acct);
  const rooms = await Promise.all(spaces.map(async (s, i) => {
    const room = await roomFor(acct, s).catch(() => null);
    const last = room ? (await fetchRows(acct.http, room.channelId, 1).catch(() => [])).at(-1) : undefined;
    return {
      index: i + 1,
      spaceId: s.id,
      name: s.name,
      channelId: room?.channelId ?? null,
      lastMessageAt: last ? new Date(last.sentAt).toISOString() : null,
      default: s.id === current,
    };
  }));
  return {
    json: rooms,
    text: rooms.map((r) => `${r.default ? "*" : " "} ${r.index}. ${r.name}  ${r.spaceId}  ${r.channelId ?? "-"}  last: ${r.lastMessageAt ?? "-"}`).join("\n")
      || "(not in any huddo yet)",
  };
}

export async function use(ctx: Ctx, roomArg: string) {
  const acct = account(ctx);
  const room = await resolveRoomArg(acct, roomArg);
  await makeDefault(acct, room);
  return { json: room, text: `default room: "${room.name}" (${room.spaceId})` };
}

async function withReactions(acct: Account, room: Room, rows: Row[]): Promise<Row[]> {
  const ids = rows.filter((r) => !r.system && !r.whisper).map((r) => r.id);
  if (ids.length === 0) return rows;
  const snapshot = await fetchReactionSnapshot(acct.http, room.spaceId, room.channelId, ids).catch(() => null);
  if (!snapshot) return rows;
  return rows.map((r) => {
    const chips = reactionChips(snapshot.state, r.id, acct.identity.slug);
    return chips.length ? { ...r, reactions: chips.map((c) => ({ emoji: c.emoji, by: c.slugs })) } : r;
  });
}

export async function read(ctx: Ctx, opts: { room?: string; limit?: number }): Promise<MessageBatch> {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 20)));
  const messages = (await fetchRows(acct.http, room.channelId, limit)).slice(-limit);
  const events = await fetchSystemRows(acct.http, room).catch(() => ({ rows: [], cursor: undefined }));
  const from = messages.length >= limit ? (messages[0]?.sentAt ?? 0) : 0;
  const rows = await withReactions(acct, room, mergeByTime(messages, events.rows.filter((r) => r.sentAt >= from)));
  const names = await resolveNames(acct, rows);
  advanceCursor(acct.identity.slug, room.channelId, messages.reduce((m, r) => Math.max(m, r.seq), 0));
  setSystemCursor(acct.identity.slug, room.channelId, events.cursor);
  return withPairs(acct, await attachParents(acct, { groups: [{ room, rows }], names }));
}

const WAIT_CYCLE_MS = 3000;
const WAIT_SPACE_REFRESH_MS = 30_000;

export interface WaitOptions {
  deadline: number;
  room?: string;
  since?: number;
  signal?: AbortSignal;
}

export function emptyBatch(synced = true): MessageBatch {
  return { groups: [], names: {}, synced };
}

export async function wait(ctx: Ctx, opts: WaitOptions): Promise<MessageBatch> {
  const acct = account(ctx);
  if (opts.since === undefined && daemonEnabled() && acct.identity.slug === activeSlug()) {
    const viaDaemon = await waitViaDaemon(acct.identity.slug, opts);
    if (viaDaemon) return withPairs(acct, capBatch(viaDaemon));
  }
  return withPairs(acct, capBatch(await waitDirect(ctx, opts)));
}

export async function waitDirect(ctx: Ctx, opts: WaitOptions): Promise<MessageBatch> {
  const dl = new Deadline(opts.deadline, opts.signal);
  const acct = account(ctx);
  const slug = acct.identity.slug;
  let everOk = false;
  let synced = false;
  let lastFailed = false;
  let lastError: unknown = null;
  let failedCycles = 0;

  const attempt = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    try {
      const value = await dl.race(work());
      everOk = true;
      lastFailed = false;
      return value;
    } catch (e) {
      if (e instanceof DeadlineReached || e instanceof UserError) throw e;
      lastFailed = true;
      lastError = e;
      return undefined;
    }
  };
  const networkError = () =>
    new NetworkError(lastError ? `cannot reach the Huddo server: ${errorText(lastError)}` : "cannot reach the Huddo server before the deadline");

  const cursors = new Map<string, number>();
  const systemCursors = new Map<string, SystemCursor>();
  let rooms: Room[] = [];
  let refreshedAt = 0;
  let narrowed: Room | null = null;

  const refreshRooms = async (): Promise<boolean> => {
    if (opts.room) {
      narrowed ??= (await attempt(() => resolveRoomArg(acct, opts.room!))) ?? null;
      if (!narrowed) return false;
      rooms = [narrowed];
    } else {
      const spaces = await attempt(() => sortedSpaces(acct));
      if (!spaces) return false;
      const found = await Promise.all(spaces.map((s) => attempt(() => roomFor(acct, s))));
      rooms = found.filter((r): r is Room => !!r);
    }
    refreshedAt = Date.now();
    const saved = loadState(slug).cursors ?? {};
    for (const room of rooms) {
      if (cursors.has(room.channelId)) continue;
      const known = opts.since ?? saved[room.channelId];
      const cursor = known ?? await attempt(() => latestSeqOf(acct.http, room.channelId));
      if (cursor === undefined) continue;
      cursors.set(room.channelId, cursor);
      if (saved[room.channelId] === undefined) advanceCursor(slug, room.channelId, cursor);
    }
    const savedSystem = loadState(slug).systemCursors ?? {};
    for (const room of rooms) {
      if (systemCursors.has(room.channelId)) continue;
      const known = savedSystem[room.channelId];
      if (known !== undefined) {
        systemCursors.set(room.channelId, known);
        continue;
      }
      const baseline = await attempt(() => fetchSystemRows(acct.http, room));
      if (!baseline) continue;
      systemCursors.set(room.channelId, baseline.cursor);
      setSystemCursor(slug, room.channelId, baseline.cursor);
    }
    return true;
  };

  const heartbeat = setInterval(() => void reportPresence(acct, "online"), PRESENCE_HEARTBEAT_MS);
  void dl.soft(reportPresence(acct, "online"), undefined);
  try {
    for (;;) {
      if (!refreshedAt || Date.now() - refreshedAt > WAIT_SPACE_REFRESH_MS) await refreshRooms();
      const groups: RoomMessages[] = [];
      let failures = 0;
      let polled = 0;
      for (const room of rooms) {
        const cursor = cursors.get(room.channelId);
        if (cursor === undefined) continue;
        polled += 1;
        const got = await attempt(() => fetchSince(acct.http, room.channelId, cursor));
        let fresh: Row[] = [];
        if (!got) {
          failures += 1;
        } else if (got.maxSeq > cursor) {
          cursors.set(room.channelId, got.maxSeq);
          advanceCursor(slug, room.channelId, got.maxSeq);
          fresh = got.rows.filter((r) => r.sender !== slug && !r.system);
        }
        const systemCursor = systemCursors.get(room.channelId);
        let joined: Row[] = [];
        if (systemCursor !== undefined) {
          const events = await attempt(() => fetchSystemRows(acct.http, room, systemCursor));
          if (events && !sameCursor(events.cursor, systemCursor)) {
            systemCursors.set(room.channelId, events.cursor);
            setSystemCursor(slug, room.channelId, events.cursor);
            joined = events.rows.filter((r) => r.sender !== slug);
          }
        }
        if (fresh.length || joined.length) groups.push({ room, rows: mergeByTime(fresh, joined) });
        if (!groups.length) await dl.sleep(WAIT_CYCLE_MS / Math.max(1, rooms.length));
      }
      if (groups.length) {
        clearInterval(heartbeat);
        const names = await dl.soft(resolveNames(acct, groups.flatMap((g) => g.rows)), cachedNames());
        await dl.soft(reportPresence(acct, "busy"), undefined);
        const batch: MessageBatch = { groups, names, synced: true };
        return dl.soft(attachParents(acct, batch), batch);
      }
      if (polled > 0 && failures === 0 && polled === rooms.length) synced = true;
      const cycleFailed = lastFailed && (polled === 0 || failures === polled);
      failedCycles = cycleFailed ? failedCycles + 1 : 0;
      if (failedCycles >= 2) throw networkError();
      if (!polled) await dl.sleep(WAIT_CYCLE_MS);
      if (dl.expired()) throw new DeadlineReached();
    }
  } catch (e) {
    if (e instanceof DeadlineReached) {
      if (lastFailed && !everOk) throw networkError();
      return emptyBatch(synced);
    }
    throw e;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function status(ctx: Ctx, state: string, note?: string) {
  if (state !== "online" && state !== "busy") throw new UserError("state must be online or busy");
  const acct = account(ctx);
  const trimmed = note?.trim() || null;
  try {
    await setPresence(acct, state as LivePresenceState, trimmed);
  } catch (e) {
    throw new UserError(`presence service unavailable: ${errorText(e)}`);
  }
  return {
    json: { slug: acct.identity.slug, state, note: trimmed },
    text: `${acct.identity.slug} is ${state}${trimmed ? ` · ${trimmed}` : ""}`,
  };
}

export async function members(ctx: Ctx, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const roster = await fetchSpaceMembers(acct.http, room.spaceId);
  const slugs = roster.map((m) => m.slug);
  const [presence, names] = await Promise.all([
    readPresence(acct, slugs).catch(() => null),
    (async () => {
      const found: Record<string, string> = {};
      for (const p of await fetchProfiles(acct.http, slugs).catch(() => [])) if (p.display_name) found[p.slug] = p.display_name;
      rememberNames(found);
      return { ...cachedNames(), ...found };
    })(),
  ]);
  const items = roster.map((m) => {
    const p = presence?.[m.slug];
    return {
      slug: m.slug,
      name: names[m.slug] ?? null,
      identity_type: m.identity_type ?? null,
      role: m.role,
      state: p?.state ?? "unknown",
      note: p?.note ?? null,
      self: m.slug === acct.identity.slug,
    };
  });
  return {
    json: items,
    text: items
      .map((i) => `${i.slug}${i.name ? ` (${i.name})` : ""} [${i.identity_type ?? "?"},${i.role}] ${i.state}${i.note ? ` · ${i.note}` : ""}${i.self ? " (you)" : ""}`)
      .join("\n"),
  };
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".json": "application/json",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

function readFileArg(path: string): Uint8Array<ArrayBuffer> {
  if (!existsSync(path)) throw new UserError(`file not found: ${path}`);
  return Uint8Array.from(readFileSync(path));
}

export function splitTrailingReplyTo(text: string): { text: string; replyTo?: string } {
  const m = /\s*--reply[-_]to[=\s]+(msg_[\w-]+)\s*$/.exec(text);
  return m ? { text: text.slice(0, m.index), replyTo: m[1] } : { text };
}

export async function send(ctx: Ctx, opts: { text?: string; room?: string; replyTo?: string; files?: string[]; extra?: Record<string, unknown> }) {
  if (!opts.replyTo && opts.text) opts = { ...opts, ...splitTrailingReplyTo(opts.text) };
  const files = opts.files ?? [];
  if (!opts.text?.length && files.length === 0) throw new UserError("nothing to send: give text and/or files");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const attachments: AttachmentMeta[] = [];
  for (const path of files) {
    const bytes = readFileArg(path);
    const file = new File([bytes], basename(path), { type: MIME[extname(path).toLowerCase()] ?? "application/octet-stream" });
    const meta = await encryptAndUploadAttachment(ctx.rt.crypto, acct.http, file);
    await downloadAndDecryptAttachment(ctx.rt.crypto, acct.http, meta);
    attachments.push(meta);
  }
  const signer = await eventSigner(ctx.rt, acct);
  const body = opts.text ?? "";
  const envelope = buildPlaintextMessage(ctx.rt.crypto, signer.subkeySecretKey, {
    envelope_kind: "channel",
    sender_slug: signer.slug,
    sender_subkey_id: signer.subkeyId,
    space_id: room.spaceId,
    channel_id: room.channelId,
    content_type: attachments.length ? ATTACHMENT_CONTENT_TYPE : "text/plain",
    content: attachments.length ? { text: body, attachments, ...opts.extra } : opts.extra ? { text: body, ...opts.extra } : body,
    recipients: [],
    reply_to_id: opts.replyTo || undefined,
  });
  const posted = await postWithLimits(acct, envelope);
  return {
    json: {
      id: envelope.envelope_id,
      seq: posted.seq ?? null,
      spaceId: room.spaceId,
      channelId: room.channelId,
      room: room.name,
      attachments: attachments.map((a) => a.filename),
    },
    text: `sent ${envelope.envelope_id}${posted.seq ? ` (#${posted.seq})` : ""} to "${room.name}" (${room.spaceId})`,
  };
}

const SLOW_MODE_AUTO_WAIT_MS = 10_000;

async function postWithLimits(acct: Account, envelope: Parameters<typeof postMessageEnvelope>[1]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postMessageEnvelope(acct.http, envelope);
    } catch (e) {
      if (e instanceof HttpError && e.status === 400 && e.body.toLowerCase().includes("is encrypted")) {
        throw new UserError("this channel is end-to-end encrypted; huddo only posts to plaintext (Huddo) channels");
      }
      const limit = sendLimitError(e);
      if (limit?.kind === "slow_mode" && attempt < 2 && limit.retryAfterMs <= SLOW_MODE_AUTO_WAIT_MS) {
        await new Promise((r) => setTimeout(r, limit.retryAfterMs + 50));
        continue;
      }
      if (limit) throw new UserError(limit.message);
      throw e;
    }
  }
}

export async function react(ctx: Ctx, opts: { message?: string; emoji?: string; remove?: boolean; room?: string }) {
  const message = opts.message?.trim() ?? "";
  const emoji = opts.emoji?.trim() ?? "";
  if (!message) throw new UserError("react needs the message id (msg_...)");
  if (!emoji || /\s/.test(emoji)) throw new UserError("react needs one emoji, e.g. 👍");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const signer = await eventSigner(ctx.rt, acct);
  const envelope = buildPlaintextMessage(ctx.rt.crypto, signer.subkeySecretKey, {
    envelope_kind: "channel",
    sender_slug: signer.slug,
    sender_subkey_id: signer.subkeyId,
    space_id: room.spaceId,
    channel_id: room.channelId,
    content_type: REACTION_CONTENT_TYPE,
    content: reactionContent(message, emoji, !opts.remove),
    recipients: [],
  });
  const posted = await postWithLimits(acct, envelope);
  return {
    json: { id: envelope.envelope_id, seq: posted.seq ?? null, spaceId: room.spaceId, channelId: room.channelId, room: room.name, message, emoji, removed: Boolean(opts.remove) },
    text: `${opts.remove ? "removed" : "reacted"} ${emoji} ${opts.remove ? "from" : "to"} ${message} in "${room.name}" (${room.spaceId})`,
  };
}

function appFail(err: unknown): never {
  const e = toAppError(err);
  throw new UserError(`${e.code}: ${e.message}`);
}

function parseOnOff(flag: string, value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "on") return true;
  if (value === "off") return false;
  throw new UserError(`${flag} must be on or off`);
}

function parseWrite(value: string | undefined): "members" | "owner" | undefined {
  if (value === undefined) return undefined;
  if (value !== "members" && value !== "owner") throw new UserError("--write must be members or owner");
  return value;
}

function readJsonArg(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new UserError(`${what} is not valid JSON`);
  }
}

export async function publish(
  ctx: Ctx,
  opts: {
    app?: string;
    file?: string;
    name?: string;
    description?: string;
    guide?: string;
    guideFile?: string;
    stateFile?: string;
    schema?: string;
    writeAccess?: string;
    banner?: string;
    enabled?: boolean;
    reset?: boolean;
    room?: string;
  },
) {
  const appId = opts.app?.trim() ?? "";
  if (!appId) throw new UserError("app publish needs an app id, e.g. tasks");
  if (!opts.file) throw new UserError("app publish needs --file app.html (one self-contained HTML file)");
  const schema = Number(opts.schema ?? "1");
  if (!Number.isInteger(schema) || schema < 1) throw new UserError("--schema must be a whole number from 1");
  const decode = (path: string) => new TextDecoder().decode(readFileArg(path));
  const guide = opts.guideFile ? decode(opts.guideFile) : opts.guide;
  const initial = opts.stateFile ? readJsonArg(decode(opts.stateFile), "--state-file") : undefined;
  if (initial !== undefined && (!initial || typeof initial !== "object" || Array.isArray(initial))) throw new UserError("--state-file must hold a JSON object");
  const writeAccess = parseWrite(opts.writeAccess);
  const banner = parseOnOff("--banner", opts.banner);
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  try {
    const meta = await publishApp(acct.http, room.spaceId, appId, {
      name: opts.name ?? appId,
      schema_version: schema,
      code: decode(opts.file),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      ...(guide !== undefined ? { guide } : {}),
      ...(initial !== undefined ? { initial_state: initial as Record<string, unknown> } : {}),
      ...(writeAccess ? { write_access: writeAccess } : {}),
      ...(banner !== undefined ? { banner } : {}),
      ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
      ...(opts.reset ? { reset_state: true } : {}),
    });
    return {
      json: { spaceId: room.spaceId, ...meta },
      text: `published ${meta.app_id} v${meta.version} (schema ${meta.schema_version}, revision ${meta.revision}, ${meta.enabled ? "on" : "off"}${meta.banner ? ", banner" : ""}) in "${room.name}"`,
    };
  } catch (err) {
    appFail(err);
  }
}

export async function apps(ctx: Ctx, opts: { app?: string; room?: string }) {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  try {
    if (opts.app) {
      const [snap, list] = await Promise.all([getAppState(acct.http, room.spaceId, opts.app), listApps(acct.http, room.spaceId)]);
      const meta = list.find((a) => a.app_id === opts.app);
      const head = meta
        ? `${meta.name} (${meta.app_id}) v${snap.version} schema ${snap.schema_version} revision ${snap.revision}${meta.description ? `\n${meta.description}` : ""}`
        : `${opts.app} revision ${snap.revision}`;
      const guide = meta?.guide ? `\n\nguide:\n${meta.guide}` : "";
      return {
        json: { spaceId: room.spaceId, ...snap, name: meta?.name ?? null, description: meta?.description ?? "", guide: meta?.guide ?? "" },
        text: `${head}${guide}\n\nstate:\n${JSON.stringify(snap.state, null, 2)}`,
      };
    }
    const list = await listApps(acct.http, room.spaceId);
    return {
      json: { spaceId: room.spaceId, apps: list },
      text: list.length
        ? list
            .map((a) => `${a.app_id}  ${a.name}  v${a.version}  revision ${a.revision}  ${a.enabled ? "on" : "off"}${a.banner ? "  banner" : ""}  write: ${a.write_access}${a.description ? `\n    ${a.description}` : ""}`)
            .join("\n")
        : `"${room.name}" has no apps`,
    };
  } catch (err) {
    appFail(err);
  }
}

export async function appSubmit(ctx: Ctx, opts: { app?: string; ops?: string; expect?: string; requestId?: string; room?: string }) {
  const appId = opts.app?.trim() ?? "";
  if (!appId) throw new UserError("app submit needs an app id");
  if (!opts.ops) throw new UserError("app submit needs --ops '<JSON Patch array>'");
  const ops = readJsonArg(opts.ops, "--ops");
  if (!Array.isArray(ops) || ops.length === 0) throw new UserError("--ops must be a non-empty JSON array of patch operations");
  const expected = opts.expect === undefined ? undefined : Number(opts.expect);
  if (expected !== undefined && !Number.isInteger(expected)) throw new UserError("--expect must be a revision number");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  try {
    const snap = await getAppState(acct.http, room.spaceId, appId);
    const out = await submitOps(acct.http, room.spaceId, appId, {
      request_id: opts.requestId ?? newRequestId(),
      schema_version: snap.schema_version,
      app_version: snap.version,
      ...(expected !== undefined ? { expected_revision: expected } : {}),
      ops: ops as PatchOp[],
    });
    return {
      json: { spaceId: room.spaceId, app_id: appId, ...out },
      text: `${out.replayed ? "already applied" : "applied"} ${ops.length} op${ops.length === 1 ? "" : "s"} to ${appId}: revision ${out.revision} in "${room.name}"`,
    };
  } catch (err) {
    appFail(err);
  }
}

export async function appSettings(ctx: Ctx, opts: { app?: string; enabled?: boolean; banner?: string; writeAccess?: string; room?: string }) {
  const appId = opts.app?.trim() ?? "";
  if (!appId) throw new UserError("app set needs an app id");
  const banner = parseOnOff("--banner", opts.banner);
  const writeAccess = parseWrite(opts.writeAccess);
  if (opts.enabled === undefined && banner === undefined && !writeAccess) throw new UserError("app set needs --on, --off, --banner on|off or --write members|owner");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  try {
    const meta = await updateAppSettings(acct.http, room.spaceId, appId, {
      ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
      ...(banner !== undefined ? { banner } : {}),
      ...(writeAccess ? { write_access: writeAccess } : {}),
    });
    return {
      json: { spaceId: room.spaceId, ...meta },
      text: `${meta.app_id}: ${meta.enabled ? "on" : "off"}, banner ${meta.banner ? "on" : "off"}, write: ${meta.write_access} in "${room.name}"`,
    };
  } catch (err) {
    appFail(err);
  }
}

export async function appDelete(ctx: Ctx, opts: { app?: string; room?: string }) {
  const appId = opts.app?.trim() ?? "";
  if (!appId) throw new UserError("app delete needs an app id");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  try {
    await deleteApp(acct.http, room.spaceId, appId);
    return { json: { spaceId: room.spaceId, app_id: appId, deleted: true }, text: `deleted ${appId} and its shared data from "${room.name}"` };
  } catch (err) {
    appFail(err);
  }
}

export async function whisper(ctx: Ctx, opts: { text?: string; to?: string; room?: string; replyTo?: string }) {
  const text = opts.text?.trim() ?? "";
  if (!text) throw new UserError("nothing to whisper: give the text");
  if (!opts.to) throw new UserError("whisper needs --to <slug or name>");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const member = await resolveMember(acct, room.spaceId, opts.to);
  if (member.slug === acct.identity.slug) throw new UserError("you cannot whisper to yourself");
  const { max_message_chars: maxChars } = await fetchLimits(acct.http, room.spaceId);
  const chars = [...text].length;
  if (chars > maxChars) throw new UserError(`message is ${chars} characters; this huddo allows at most ${maxChars}`);
  const devices = await fetchRecipientDevices(acct.http, ctx.rt.crypto, [member.slug, acct.identity.slug]);
  if (!devices.some((d) => d.slug === member.slug)) throw new UserError(`${opts.to} has no active device to whisper to`);
  const signer = await eventSigner(ctx.rt, acct);
  const content = sealWhisper(
    ctx.rt.crypto,
    { spaceId: room.spaceId, channelId: room.channelId, sender: signer.slug, to: member.slug },
    text,
    devices,
  );
  const envelope = buildPlaintextMessage(ctx.rt.crypto, signer.subkeySecretKey, {
    envelope_kind: "channel",
    sender_slug: signer.slug,
    sender_subkey_id: signer.subkeyId,
    space_id: room.spaceId,
    channel_id: room.channelId,
    content_type: WHISPER_CONTENT_TYPE,
    content,
    recipients: [],
    reply_to_id: opts.replyTo || undefined,
  });
  const posted = await postWithLimits(acct, envelope);
  const label = member.name ? `${member.slug} (${member.name})` : member.slug;
  return {
    json: { id: envelope.envelope_id, seq: posted.seq ?? null, spaceId: room.spaceId, channelId: room.channelId, room: room.name, to: member.slug },
    text: `whispered ${envelope.envelope_id}${posted.seq ? ` (#${posted.seq})` : ""} to ${label} in "${room.name}" (${room.spaceId})`,
  };
}

async function resolveMember(acct: Account, spaceId: string, who: string) {
  const roster = await fetchSpaceMembers(acct.http, spaceId);
  const needle = who.replace(/^@/, "");
  const bySlug = roster.find((m) => m.slug === needle);
  if (bySlug) return { slug: bySlug.slug, name: cachedNames()[bySlug.slug] ?? null };
  const profiles = await fetchProfiles(acct.http, roster.map((m) => m.slug)).catch(() => []);
  const matches = profiles.filter((p) => p.display_name?.toLowerCase() === needle.toLowerCase());
  if (matches.length > 1) throw new UserError(`more than one member is named "${who}"; use the slug (see huddo members)`);
  const hit = matches[0];
  if (!hit) throw new UserError(`no member "${who}" in this huddo (see huddo members)`);
  return { slug: hit.slug, name: hit.display_name ?? null };
}

export async function kick(ctx: Ctx, who: string, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const member = await resolveMember(acct, room.spaceId, who);
  if (member.slug === acct.identity.slug) throw new UserError("you cannot remove yourself; an owner archives the huddo instead");
  try {
    await removeFromSpace(acct.http, ctx.rt.crypto, await eventSigner(ctx.rt, acct), room.spaceId, member.slug);
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) throw new UserError(`only the owner of "${room.name}" can remove members`);
    throw e;
  }
  const label = member.name ? `${member.slug} (${member.name})` : member.slug;
  return { json: { spaceId: room.spaceId, room: room.name, removed: member.slug }, text: `removed ${label} from "${room.name}"` };
}

export async function block(ctx: Ctx, who: string, blocked: boolean, roomArg?: string) {
  const acct = account(ctx);
  const needle = who.replace(/^@/, "");
  const known = blocked ? null : (await fetchBlocks(acct.http)).find((s) => s === needle);
  const slug = known ?? (await resolveMember(acct, (await currentRoom(acct, roomArg)).spaceId, who)).slug;
  if (slug === acct.identity.slug) throw new UserError("you cannot block yourself");
  const list = await setBlocked(acct.http, slug, blocked);
  return {
    json: { slug, blocked, blocks: list },
    text: blocked ? `blocked ${slug}: their messages now show as "${BLOCKED_TEXT}" for you` : `unblocked ${slug}`,
  };
}

export async function blocks(ctx: Ctx) {
  const acct = account(ctx);
  const list = await fetchBlocks(acct.http);
  const names = cachedNames();
  return {
    json: list,
    text: list.length ? list.map((s) => (names[s] ? `${s} (${names[s]})` : s)).join("\n") : "you have not blocked anyone",
  };
}

function step(raw: string | undefined, steps: readonly number[], flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!steps.includes(n)) throw new UserError(`${flag} must be one of ${steps.join(", ")}`);
  return n;
}

export async function limits(ctx: Ctx, opts: { slow?: string; maxChars?: string; room?: string }) {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const slow = step(opts.slow, SLOW_MODE_STEPS, "--slow");
  const maxChars = step(opts.maxChars, MAX_CHARS_STEPS, "--max-chars");
  let current;
  if (slow === undefined && maxChars === undefined) {
    current = await fetchLimits(acct.http, room.spaceId);
  } else {
    try {
      current = await setLimits(acct.http, room.spaceId, {
        ...(slow !== undefined ? { slow_mode_s: slow } : {}),
        ...(maxChars !== undefined ? { max_message_chars: maxChars } : {}),
      });
    } catch (e) {
      if (e instanceof HttpError && e.status === 403) throw new UserError(`only the owner of "${room.name}" can change its limits`);
      throw e;
    }
  }
  return {
    json: { spaceId: room.spaceId, room: room.name, ...current },
    text: `"${room.name}": slow mode 1 message per ${formatSeconds(current.slow_mode_s)} per member (owner exempt); messages up to ${current.max_message_chars} characters`,
  };
}

function writeNewFile(dir: string, name: string, bytes: Uint8Array): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 0; ; n++) {
    const path = joinPath(dir, n === 0 ? name : `${stem}-${n}${ext}`);
    try {
      writeFileSync(path, bytes, { flag: "wx" });
      return path;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST" || n >= 999) throw e;
    }
  }
}

export async function download(ctx: Ctx, id: string, opts: { room?: string; outDir?: string }) {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const row = (await fetchRows(acct.http, room.channelId, 200)).find((r) => r.id === id);
  if (!row) throw new UserError(`message ${id} not found in the recent history of "${room.name}"`);
  if (!row.attachments.length) throw new UserError(`message ${id} has no attachments`);
  const dir = opts.outDir ?? joinPath(homeDir(), "downloads");
  mkdirSync(dir, { recursive: true });
  const saved: string[] = [];
  for (const a of row.attachments) {
    const bytes = await downloadAndDecryptAttachment(ctx.rt.crypto, acct.http, a);
    saved.push(writeNewFile(dir, basename(a.filename || a.blob_id), bytes));
  }
  return { json: saved, text: saved.join("\n") };
}

export async function whoami(ctx: Ctx) {
  const acct = account(ctx);
  const [profile] = await fetchProfiles(acct.http, [acct.identity.slug]).catch(() => []);
  if (profile?.display_name) rememberNames({ [profile.slug]: profile.display_name });
  const room = loadState(acct.identity.slug).room ?? null;
  return {
    json: {
      slug: acct.identity.slug,
      device_id: acct.identity.device_id,
      server_url: acct.identity.server_url,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      room,
    },
    text: [
      `slug:    ${acct.identity.slug}`,
      `name:    ${profile?.display_name ?? "-"}`,
      `avatar:  ${profile?.avatar_url ?? "-"}`,
      `device:  ${acct.identity.device_id}`,
      `server:  ${acct.identity.server_url}`,
      `room:    ${room ? `${room.name} (${room.spaceId})` : "-"}`,
    ].join("\n"),
  };
}

export async function identityList() {
  const active = activeSlug();
  const names = cachedNames();
  const items = listIdentitySlugs().map((slug) => ({
    slug,
    name: names[slug] ?? null,
    active: slug === active,
    room: loadState(slug).room?.name ?? null,
  }));
  return {
    json: items,
    text: items.map((i) => `${i.active ? "*" : " "} ${i.slug}  ${i.name ?? "-"}  room: ${i.room ?? "-"}`).join("\n") || "(no identities)",
  };
}

export async function identityNew(ctx: Ctx, name?: string) {
  const acct = await createIdentity(ctx.rt, name);
  return { json: { slug: acct.identity.slug, active: true }, text: `created ${acct.identity.slug} (now active)` };
}

export async function identityUse(slug: string) {
  if (!listIdentitySlugs().includes(slug)) throw new UserError(`no identity ${slug} in this HUDDO_HOME (see identity list)`);
  updateConfig((c) => {
    c.active = slug;
  });
  return { json: { slug, active: true }, text: `active identity: ${slug}` };
}

async function profileTarget(acct: Account, forOperator: boolean | undefined): Promise<{ slug: string; whose: string }> {
  if (!forOperator) return { slug: acct.identity.slug, whose: "" };
  const operator = (await fetchPairs(acct.http, [acct.identity.slug]))[acct.identity.slug];
  if (!operator) throw new UserError("you are not paired with an operator; run `huddo pair` first");
  return { slug: operator, whose: "your operator's " };
}

async function saveProfile(acct: Account, slug: string, patch: { display_name?: string; avatar_url?: string }) {
  try {
    await updateProfile(acct.http, slug, patch);
  } catch (e) {
    if (e instanceof HttpError && e.status === 403 && slug !== acct.identity.slug) {
      throw new UserError("the server says you are no longer paired with this operator; run `huddo pair` again");
    }
    throw e;
  }
}

export async function updateName(ctx: Ctx, name: string, forOperator?: boolean) {
  const trimmed = name.trim();
  const error = displayNameError(trimmed);
  if (error) throw new UserError(error);
  const acct = account(ctx);
  const target = await profileTarget(acct, forOperator);
  await saveProfile(acct, target.slug, { display_name: trimmed });
  rememberNames({ [target.slug]: trimmed });
  return { json: { slug: target.slug, display_name: trimmed }, text: `${target.whose}display name set to "${trimmed}"` };
}

function framedSvg(svg: string): Uint8Array {
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="256" viewBox="0 0 256 256">`
      + `<rect width="256" height="256" fill="#ffffff"/>`
      + `<image x="49" y="49" width="158" height="158" href="${data}" xlink:href="${data}"/></svg>`,
  );
}

async function avatarBytes(arg: string): Promise<{ bytes: Uint8Array; label: string }> {
  if (existsSync(arg)) {
    if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extname(arg).toLowerCase())) {
      throw new UserError("avatar must be a .png, .jpg, .gif, .webp or .svg file");
    }
    return { bytes: readFileArg(arg), label: basename(arg) };
  }
  const res = await fetch(`${ORIGIN}/agent-avatars/index.json`);
  if (!res.ok) throw new UserError(`avatar library unavailable (HTTP ${res.status})`);
  const library = (await res.json()) as { id: string; label: string; path: string }[];
  const entry = library.find((e) => e.id === arg);
  if (!entry) {
    throw new UserError(`"${arg}" is neither a file nor a library avatar; library ids: ${library.map((e) => e.id).join(", ")}`);
  }
  const svg = await fetch(`${ORIGIN}${entry.path}`);
  if (!svg.ok) throw new UserError(`avatar ${arg} unavailable (HTTP ${svg.status})`);
  return { bytes: framedSvg(await svg.text()), label: entry.label };
}

export async function updateAvatar(ctx: Ctx, arg: string, forOperator?: boolean) {
  const acct = account(ctx);
  const target = await profileTarget(acct, forOperator);
  const { bytes, label } = await avatarBytes(arg);
  if (bytes.length > MAX_PROFILE_AVATAR_BYTES) throw new UserError("avatar image is larger than 4 MiB");
  const avatarUrl = await uploadAvatar(acct.http, acct.identity.server_url, bytes, ctx.rt.crypto);
  await saveProfile(acct, target.slug, { avatar_url: avatarUrl });
  return { json: { slug: target.slug, avatar_url: avatarUrl }, text: `${target.whose}avatar set to ${label} (${avatarUrl})` };
}

export async function exportIdentity(ctx: Ctx, opts: { passphrase?: string; out?: string }) {
  const acct = account(ctx);
  const passphrase = opts.passphrase ?? Buffer.from(ctx.rt.crypto.generateRandomBytes(12)).toString("base64url");
  const bundle = await (await exportKeyBackup(acct.identity, passphrase)).text();
  if (opts.out) {
    writeFileSync(opts.out, bundle, { mode: 0o600 });
    return {
      json: { slug: acct.identity.slug, file: opts.out, passphrase },
      text: `bundle for ${acct.identity.slug} written to ${opts.out}\npassphrase: ${passphrase}`,
    };
  }
  return { json: { slug: acct.identity.slug, bundle, passphrase }, text: `${bundle}\npassphrase: ${passphrase}` };
}

export async function importIdentity(ctx: Ctx, file: string, passphrase: string) {
  const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  const identity = await decryptKeyBackup(new Blob([text]), passphrase);
  await ctx.rt.keyStore.saveIdentity(identity);
  updateConfig((c) => {
    c.active = identity.slug;
  });
  await accountFor(ctx.rt, identity.slug).http.ensureAccountSubkey();
  return { json: { slug: identity.slug, active: true }, text: `imported ${identity.slug} (now active)` };
}
