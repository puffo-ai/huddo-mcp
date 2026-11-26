import type { PuffoHttpClient } from "../src/http/client";
import { CHOICE_CLOSE_CONTENT_TYPE, closeContent, type OptionInput } from "../src/huddo/choices";
import { answerContent, richContent, type AnswerInput } from "./choice-params";
export type { OptionInput } from "../src/huddo/choices";
import { linkPreview } from "./link-preview";
import { EARLIER_KEYS_WORK, OWNER_CONTEXT } from "../src/huddo/agent-guide";
import { CLI_WORDS, enterRoom } from "./room-steps";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join as joinPath } from "node:path";
import { HttpError } from "../src/http/types";
import { signup } from "../src/identity/device/signup";
import { decryptKeyBackup, exportKeyBackup } from "../src/identity/primitives/backup";
import { registerNewDevice } from "../src/identity/device/register-device";
import { BackupKeyError, keepKeyHintFor, backupStatus, createBackup, openBackup, removeBackup } from "./identity-backup";
import { BackupImportError } from "../src/identity/primitives/backup";
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
  updateSpace,
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
import { fetchRecipientDevices } from "../src/message/recipients";
import { sealWhisper, WHISPER_CONTENT_TYPE } from "../src/huddo/whisper";
import { REACTION_CONTENT_TYPE, fetchReactionSnapshot, reactionChips, reactionContent } from "../src/huddo/reactions";
import {
  EDIT_CONTENT_TYPE,
  UNSEND_CONTENT_TYPE,
  editContent,
  revisionError,
  unsendContent,
  whisperEditContent,
} from "../src/huddo/revisions";
import {
  deleteApp,
  getAppState,
  listApps,
  newRequestId,
  submitOps,
  toAppError,
  type PatchOp,
} from "../src/huddo/room-apps";
import { awaitCoreMessageSender } from "../src/application/runtime/core-message-sender-port";
import { awaitCoreSpaceEvents } from "../src/application/runtime/core-space-port";
import { coreSpaceCommands, leaveEvents, nonceFrom, removeEvent, transferEvent } from "../src/huddo/core-space-commands";
import { attachCore } from "./core";
import type { MessageQuote } from "../src/huddo/message-quotes";
import { buildQuote, type QuoteInput } from "./quotes";
import { QUOTE_NEEDS_TEXT } from "../src/huddo/quote-input";
import {
  ATTACHMENT_CONTENT_TYPE,
  downloadAndDecryptAttachment,
  encryptAndUploadAttachment,
  type AttachmentMeta,
} from "../src/message/core/attachments";
import { MAX_ATTACHMENTS_PER_MESSAGE, isStreamedAttachment } from "../src/features/attachments/domain/attachment";
import { saveStreamedAttachment, uploadFileArg } from "./attachment-files";
import { fetchProfiles, updateProfile, uploadAvatar } from "../src/ui/services/profile-service";
import { MAX_PROFILE_AVATAR_BYTES } from "../src/features/profiles/domain/human-profile";
import { defaultGroupName, invitePath, mainChannelId } from "../src/huddo/config";
import { displayNameError, hexFrom, randomAgentName, usernameFor } from "../src/huddo/names";
import { newRoomNameError, roomRenameError } from "../src/huddo/room-name";
import { normalizeRoomCode, ROOM_CODE_FORMAT, roomCodeRefusal } from "../src/huddo/room-code";
import { roomTerms } from "../src/huddo/room-terms";
export { NEW_ROOM_NAME_LIMIT, ROOM_RENAME_LIMIT } from "../src/huddo/room-name";
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
import { listenerState } from "./listener";
import { recentRows, formatBytes, formatRow, isPeer, operatorTag, parentPreview, type Row } from "./rows";
import { locate } from "./message-links";
import { PairingError, fetchPairs, pairingResult, randomPairingCode, startPairing, unpairAgent } from "../src/huddo/pairing";
import { neutralizeTags, oneLine, safeLine } from "../src/huddo/projection";
import { aboutLines, getAbout, getHome } from "../src/huddo/room-info-api";
import { NetworkError } from "./deadline";
import { cacheFile, cachedFile, extendBack, loadMeta, matches, mergeRevisions, storedRows, syncRoom, type SearchQuery } from "./store";
import { daemonEnabled, request as requestDaemon } from "./ipc";
import { deviceRejectionText } from "./device-check";
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

export { UserError, decodeNewlines, messageText, splitTrailingReplyTo, parseWhen } from "./text-args";
import { UserError, splitTrailingReplyTo, parseWhen } from "./text-args";

export { NetworkError };
export { read } from "./read-cmd";
export { wait } from "./wait-cmd";

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
  pairs?: Record<string, string>;
  self?: string;
  parents?: Record<string, Row>;
  /** Printed before the messages: how much is still unread. */
  header?: string;
  hint?: string;
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
      for (const r of await recentRows(g.room.channelId, PARENT_LOOKUP_LIMIT).catch(() => [])) byId.set(r.id, r);
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

export async function withPairs(acct: Account, batch: MessageBatch): Promise<MessageBatch> {
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
  if (e instanceof HttpError) return deviceRejectionText(e) ?? roomTerms(`server returned ${e.status}: ${e.body.slice(0, 500)}`);
  return roomTerms(e instanceof Error ? e.message : String(e));
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

export function rememberNames(entries: Record<string, string>): void {
  if (Object.keys(entries).length) updateConfig((c) => {
    c.names = { ...c.names, ...entries };
  });
}

export function account(ctx: Ctx): Account {
  try {
    return requireAccount(ctx.rt, ctx.as);
  } catch (e) {
    throw new UserError(errorText(e));
  }
}

export function checkName(name?: string) {
  const error = name?.trim() ? displayNameError(name) : null;
  if (error) throw new UserError(error);
}

async function createIdentity(rt: Runtime, displayName?: string): Promise<{ acct: Account; backup: SignupBackup }> {
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
    { displayName: name, signupEndpoint: `${ORIGIN}/huddo-api`, backup: true },
  );
  const backup = backupResult(result.backupKey);
  signupBackup = backup;
  updateConfig((c) => {
    c.active = result.slug;
  });
  rememberNames({ [result.slug]: name });
  const acct = accountFor(rt, result.slug);
  await acct.http.ensureAccountSubkey();
  await attachCore(rt, result.slug);
  return { acct, backup };
}

function sameServer(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

async function accountOrCreate(
  ctx: Ctx,
  displayName?: string,
): Promise<{ acct: Account; created: boolean; backup: SignupBackup | typeof NO_BACKUP }> {
  const slug = activeSlug(ctx.as);
  if (slug) {
    const acct = accountFor(ctx.rt, slug);
    if (ctx.as || sameServer(acct.identity.server_url, SERVER_URL)) return { acct, created: false, backup: NO_BACKUP };
  }
  return { ...(await createIdentity(ctx.rt, displayName)), created: true };
}

export async function sortedSpaces(acct: Account): Promise<Space[]> {
  const spaces = await fetchSpaces(acct.http);
  return spaces.sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.id.localeCompare(b.id));
}

export async function roomFor(acct: Account, space: Pick<Space, "id" | "name">): Promise<Room | null> {
  const cached = loadState(acct.identity.slug).rooms?.[space.id];
  if (cached) return { ...cached, name: safeLine(space.name || cached.name) };
  const channels = await fetchChannels(acct.http, space.id);
  const id = mainChannelId(channels, space.id);
  if (!id) return null;
  const room = { spaceId: space.id, channelId: id, name: safeLine(space.name) };
  updateState(acct.identity.slug, (s) => {
    s.rooms = { ...s.rooms, [space.id]: room };
  });
  return room;
}

export async function makeDefault(acct: Account, room: Room, onlyIfUnset = false): Promise<void> {
  updateState(acct.identity.slug, (s) => {
    if (!onlyIfUnset || !s.room) s.room = room;
    s.rooms = { ...s.rooms, [room.spaceId]: room };
  });
}

export async function resolveRoomArg(acct: Account, arg: string): Promise<Room> {
  if (arg.includes(",")) throw new UserError(`"${arg}" is a list of rooms; only wait takes a comma-separated list, other commands take one room`);
  const spaces = await sortedSpaces(acct);
  const space = /^\d+$/.test(arg) ? spaces[Number(arg) - 1] : spaces.find((s) => s.id === arg);
  if (!space) throw new UserError(`no huddo "${arg}" for ${acct.identity.slug} (see list)`);
  const room = await roomFor(acct, space);
  if (!room) throw new UserError(`cannot open room ${space.id}: it has no chat`);
  return room;
}

export async function currentRoom(acct: Account, roomArg?: string): Promise<Room> {
  if (roomArg) {
    const room = await resolveRoomArg(acct, roomArg);
    await makeDefault(acct, room, true);
    return room;
  }
  const state = loadState(acct.identity.slug);
  if (state.room) return state.room;
  const spaces = await sortedSpaces(acct);
  const latest = spaces[spaces.length - 1];
  if (!latest) throw new UserError("this identity is not in any room yet: join one with an invite link, or create one");
  const room = await roomFor(acct, latest);
  if (!room) throw new UserError(`cannot open room ${latest.id}: it has no chat`);
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

export function ackRows(http: PuffoHttpClient, rows: Row[], self: string): void {
  const ids = rows.filter((r) => r.sender !== self && !r.system && r.id.startsWith("msg_")).map((r) => r.id);
  if (ids.length) void http.post("/messages/ack", { envelope_ids: ids }).catch(() => undefined);
}

export function messageJson(room: Room | null, row: Row, batch: MessageBatch) {
  const pairs = batch.pairs ?? {};
  return {
    ...(room ? { spaceId: room.spaceId, room: room.name } : {}),
    ...row,
    sender_name: batch.names[row.sender] ?? null,
    reply_to_sender: (row.replyTo && batch.parents?.[row.replyTo]?.sender) || null,
    reply_to_preview: row.replyTo && batch.parents?.[row.replyTo] ? parentPreview(batch.parents[row.replyTo], batch.names) : null,
    paired_with: Object.entries(pairs).find(([, operator]) => operator === row.sender)?.[0] ?? null,
    from_paired: Boolean(batch.self && pairs[batch.self] === row.sender),
    peer: isPeer(row.sender, pairs, batch.self),
  };
}

export function formatBatch(batch: MessageBatch, withRoom: boolean): string {
  const pairs = batch.pairs ?? {};
  const lines = batch.groups.flatMap((g) =>
    g.rows.map((r) => {
      const tag = [operatorTag(r.sender, pairs, batch.self), r.new ? "[new]" : ""].filter(Boolean).join(" ");
      return formatRow(r, batch.names, withRoom ? `[${g.room.name} ${g.room.spaceId}] ` : "", tag, batch.parents);
    }),
  );
  const header = batch.header ? [`(${safeLine(batch.header)})`] : [];
  return [...header, ...lines, ...(batch.hint ? [`(${safeLine(batch.hint)})`] : [])].join("\n");
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
  const picked = avatar ? await avatarBytes(avatar) : null;
  const { acct, created, backup } = await accountOrCreate(ctx, name);
  if (!created && name?.trim()) {
    await updateProfile(acct.http, acct.identity.slug, { display_name: name.trim() });
    rememberNames({ [acct.identity.slug]: name.trim() });
  }
  if (picked) await setAvatar(ctx, picked);
  const alreadyMember = (await fetchSpaces(acct.http)).some((s) => s.id === preview.space_id);
  if (!alreadyMember) {
    await redeemInviteLink(acct.http, ctx.rt.crypto, await coreSigner(), {
      shortCode: code,
      inviteId: preview.invite_id,
      spaceId: preview.space_id,
    });
  }
  const room = await roomFor(acct, { id: preview.space_id, name: preview.space_name }).catch(() => null)
    ?? (() => {
      const channelId = preview.scope.channel_grants[0]?.channel_id ?? preview.showcase_channels?.[0]?.channel_id;
      if (!channelId) throw new UserError("this invite does not include a chat");
      return { spaceId: preview.space_id, channelId, name: preview.space_name };
    })();
  await makeDefault(acct, room);
  return withBackup(backup, {
    json: { slug: acct.identity.slug, created, joined: !alreadyMember, spaceId: room.spaceId, name: room.name },
    text: `${created ? "signed up as" : "as"} ${nameAndSlug(await ownName(acct, name), acct.identity.slug)}: ${alreadyMember ? "already in" : "joined"} "${room.name}" (${room.spaceId})`,
  });
}

export async function newHuddo(
  ctx: Ctx,
  name?: string,
  me: { displayName?: string; avatar?: string; inviteCode?: string } = {},
) {
  checkName(me.displayName);
  // Before the identity is made, as for the display name, so a refused name leaves nothing behind.
  const nameError = name?.trim() ? newRoomNameError(name) : null;
  if (nameError) throw new UserError(nameError);
  const given = me.inviteCode?.trim() ? normalizeRoomCode(me.inviteCode) : undefined;
  if (given === null) throw new UserError(ROOM_CODE_FORMAT);
  const inviteCode = given ?? loadConfig().inviteCode;
  const picked = me.avatar ? await avatarBytes(me.avatar) : null;
  const { acct, created, backup } = await accountOrCreate(ctx, me.displayName);
  if (!created && me.displayName?.trim()) {
    await updateProfile(acct.http, acct.identity.slug, { display_name: me.displayName.trim() });
    rememberNames({ [acct.identity.slug]: me.displayName.trim() });
  }
  if (picked) await setAvatar(ctx, picked);
  const made = await createSpaceWithGeneral(
    coreSpaceCommands(await awaitCoreSpaceEvents(), ctx.rt.crypto, inviteCode),
    acct.identity.slug,
    name?.trim() || defaultGroupName(),
  ).catch((error: unknown) => {
    const refusal = roomCodeRefusal(error, CLI_WORDS, ORIGIN);
    throw refusal ? new UserError(refusal) : error;
  });
  if (given) updateConfig((c) => {
    c.inviteCode = given;
  });
  const room = { spaceId: made.spaceId, channelId: made.channelId, name: made.spaceName };
  await makeDefault(acct, room);
  const link = await invite(ctx, room.spaceId).then((r) => r.json.url, () => null);
  const named = me.displayName?.trim();
  const note =
    named && !name?.trim()
      ? `\nnote: --name sets your own name ("${named}"), not the room's. The room got the default name "${room.name}"; pass --room-name (MCP: room_name) to name it.`
      : "";
  return withBackup(backup, {
    json: { slug: acct.identity.slug, created, spaceId: room.spaceId, name: room.name, inviteUrl: link },
    text: `${created ? "signed up as" : "as"} ${nameAndSlug(await ownName(acct, me.displayName), acct.identity.slug)}: created "${room.name}" (${room.spaceId})${link ? `\ninvite link: ${link}` : ""}${note}`,
  });
}

export const nameAndSlug = (name: string | null | undefined, slug: string) => (name?.trim() ? `${safeLine(name.trim())} @${slug}` : `@${slug}`);

/** What `new` and `join` print after their result: for a join, the room owner's context, then the one next step. */
export interface Onboarding {
  step: string;
  about?: string[];
}

async function syncOperator(acct: Account): Promise<string | null> {
  const slug = acct.identity.slug;
  const pairs = await fetchPairs(acct.http, [slug]).catch(() => null);
  if (!pairs) return loadState(slug).operator ?? null;
  const operator = pairs[slug] ?? null;
  updateState(slug, (s) => {
    if (operator) s.operator = operator;
    else delete s.operator;
  });
  return operator;
}

/** `room` is the result of `new` or `join`. Starts the steps of the room (`room-steps.ts`). */
export async function onboarding(
  ctx: Ctx,
  kind: "new" | "join",
  room: { spaceId: string; inviteUrl?: string | null; joined?: boolean; backup_key?: string | null },
): Promise<Onboarding> {
  const acct = account(ctx);
  await syncOperator(acct);
  const hint = enterRoom(acct.identity.slug, room.spaceId, {
    created: kind === "new",
    alreadyMember: room.joined === false,
    recoveryCode: room.backup_key,
    inviteUrl: room.inviteUrl,
  });
  return { step: hint.next, about: kind === "join" ? await roomAbout(acct, room.spaceId) : undefined };
}

async function roomAbout(acct: Account, spaceId: string): Promise<string[]> {
  const [welcome, home] = await Promise.all([
    getAbout(acct.http, spaceId).then((a) => a.welcome ?? "", () => undefined),
    getHome(acct.http, spaceId).catch(() => undefined),
  ]);
  return aboutLines(welcome, home);
}

/** The lines before the next step: the welcome message and the home of a joined room, and whose words they are. */
export function onboardingAbout(o: Onboarding): string[] {
  return o.about ? [...o.about, OWNER_CONTEXT] : [];
}

export async function invite(ctx: Ctx, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const signer = await coreSigner();
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

export async function rename(ctx: Ctx, name: string, roomArg?: string) {
  const next = name.trim();
  if (!next) throw new UserError("usage: huddo rename <new room name>");
  const nameError = roomRenameError(next);
  if (nameError) throw new UserError(nameError);
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  await updateSpace(acct.http, room.spaceId, { name: next });
  updateState(acct.identity.slug, (s) => {
    if (s.room?.spaceId === room.spaceId) s.room = { ...s.room, name: next };
    const cached = s.rooms?.[room.spaceId];
    if (cached) s.rooms![room.spaceId] = { ...cached, name: next };
  });
  return {
    json: { spaceId: room.spaceId, from: room.name, room: next },
    text: `renamed "${room.name}" to "${next}" (${room.spaceId})`,
  };
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
  await (await awaitCoreSpaceEvents()).submit(leaveEvents(room.spaceId, [], heir?.slug, nonceFrom(ctx.rt.crypto)));
  updateState(acct.identity.slug, (s) => {
    if (s.room?.spaceId === room.spaceId) delete s.room;
    if (s.rooms) delete s.rooms[room.spaceId];
  });
  const handedTo = heir ? ` and handed it to ${nameAndSlug(heir.name, heir.slug)}` : "";
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
  await (await awaitCoreSpaceEvents()).submit([transferEvent(room.spaceId, heir.slug, nonceFrom(ctx.rt.crypto))]);
  const label = nameAndSlug(heir.name, heir.slug);
  return {
    json: { spaceId: room.spaceId, room: room.name, newOwner: heir.slug },
    text: `handed "${room.name}" to ${label}; you stay in it as a member`,
  };
}

const PAIR_TTL_MS = 5 * 60 * 1000;

export async function pair(ctx: Ctx, roomArg?: string, next = "Then run `huddo pair --check` until it reports paired.") {
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
    `Send it in your original chat, never in the room: the person there opens "${room.name}" in Huddo, clicks their avatar and enters ${code} under Pair your agent.`,
    next,
  ].join("\n");
  return { json: { code, spaceId: room.spaceId, room: room.name, expiresInSeconds: PAIR_TTL_MS / 1000 }, text };
}

export async function pairCheck(ctx: Ctx) {
  const acct = account(ctx);
  const pending = loadState(acct.identity.slug).pairing;
  if (!pending) {
    const operator = await syncOperator(acct);
    return { json: { paired: Boolean(operator), paired_with: operator ?? null }, text: operator ? `paired with ${operator}` : "no pairing in progress; start one with huddo pair" };
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
    return { json: { paired: false, code: pending.code }, text: `not paired yet; waiting for the person in your original chat to enter ${pending.code}` };
  }
  const operator = result.operator;
  const names = await resolveNames(acct, [{ sender: operator } as Row]).catch(() => cachedNames());
  const operatorName = names[operator] ?? operator;
  updateState(acct.identity.slug, (s) => {
    delete s.pairing;
    s.operator = operator;
  });
  return { json: { paired: true, paired_with: operator, paired_with_name: operatorName }, text: `paired with ${safeLine(operatorName)} (${operator}); "${pending.room}" shows it as a system notice` };
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
    return { json: { unpaired: true, paired_with: result.operator }, text: `unpaired from ${name} (${result.operator}); the room shows it as a system notice` };
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
    const last = room ? (await recentRows(room.channelId, 1).catch(() => [])).at(-1) : undefined;
    return {
      index: i + 1,
      spaceId: s.id,
      name: safeLine(s.name),
      lastMessageAt: last ? new Date(last.sentAt).toISOString() : null,
      default: s.id === current,
    };
  }));
  return {
    json: rooms,
    text: rooms.map((r) => `${r.default ? "*" : " "} ${r.index}. ${r.name}  ${r.spaceId}  last: ${r.lastMessageAt ?? "-"}`).join("\n")
      || "(not in any room yet)",
  };
}

export async function use(ctx: Ctx, roomArg: string) {
  const acct = account(ctx);
  const room = await resolveRoomArg(acct, roomArg);
  await makeDefault(acct, room);
  return { json: room, text: `default room: "${room.name}" (${room.spaceId})` };
}

export async function withReactions(acct: Account, room: Room, rows: Row[]): Promise<Row[]> {
  const ids = rows.filter((r) => !r.system && !r.whisper && !r.revision).map((r) => r.id);
  if (ids.length === 0) return rows;
  const snapshot = await fetchReactionSnapshot(acct.http, room.spaceId, room.channelId, ids).catch(() => null);
  if (!snapshot) return rows;
  return rows.map((r) => {
    const chips = reactionChips(snapshot.state, r.id, acct.identity.slug);
    return chips.length ? { ...r, reactions: chips.map((c) => ({ emoji: c.emoji, by: c.slugs })) } : r;
  });
}

export const HISTORY_MAX = 500;

function clampInt(value: number | undefined, fallback: number, max: number): number {
  return Math.max(1, Math.min(max, Math.floor(value ?? fallback)));
}

export const FIND_PAGES = 10;

export async function storedUntil(
  acct: Account,
  room: Room,
  enough: (rows: Row[]) => boolean,
  maxPages = Infinity,
  failures?: unknown[],
): Promise<Row[]> {
  let complete = false;
  try {
    complete = (await syncRoom(room.channelId)).complete;
  } catch (e) {
    if (!(await storedRows(room.channelId)).length) throw e;
    failures?.push(e);
  }
  let rows = await storedRows(room.channelId);
  for (let page = 0; page < maxPages && !enough(rows) && !complete; page += 1) {
    const before = rows.length;
    try {
      complete = (await extendBack(room.channelId)).complete;
    } catch (e) {
      if (!rows.length) throw e;
      failures?.push(e);
      break;
    }
    rows = await storedRows(room.channelId);
    if (rows.length === before && !complete) break;
  }
  return rows;
}

export async function notFound(id: string, room: Room): Promise<UserError> {
  return (await loadMeta(room.channelId)).complete
    ? new UserError(`message ${id} not found in "${room.name}" (${room.spaceId})`)
    : new UserError(`message ${id} not found in the stored history of "${room.name}"; check the id, or run \`huddo sync --full --room ${room.spaceId}\` and try again`);
}

/** No server at all (fetch itself failed) exits 2, like every other "server unavailable". */
export function offline(e: unknown): never {
  throw e instanceof TypeError && e.message === "fetch failed" ? new NetworkError(`cannot reach the Huddo server: ${e.message}`) : e;
}

/** A read that could not reach the server: `batch` holds what was stored, marked partial, and nothing was marked read. */
export class ReadFailed extends NetworkError {
  constructor(message: string, readonly batch: MessageBatch, cause?: unknown) {
    super(message, { cause });
  }
}

async function storeBatch(acct: Account, groups: RoomMessages[], hint?: string): Promise<MessageBatch> {
  const rows = groups.flatMap((g) => g.rows);
  const names = await resolveNames(acct, rows);
  return withPairs(acct, await attachParents(acct, { groups: groups.filter((g) => g.rows.length), names, hint }));
}

export function pageRows(rows: Row[], opts: { before?: number; after?: number; limit: number }): Row[] {
  if (opts.after !== undefined) return rows.filter((r) => r.seq > opts.after!).slice(0, opts.limit);
  return (opts.before === undefined ? rows : rows.filter((r) => r.seq < opts.before!)).slice(-opts.limit);
}

async function allRooms(acct: Account): Promise<Room[]> {
  const spaces = await sortedSpaces(acct).catch(() => null);
  if (!spaces) return Object.values(loadState(acct.identity.slug).rooms ?? {});
  const rooms = await Promise.all(spaces.map((s) => roomFor(acct, s).catch(() => null)));
  return rooms.filter((r): r is Room => r !== null);
}

async function sendersNamed(acct: Account, rows: Row[], who: string): Promise<Set<string>> {
  const needle = who.replace(/^@/, "").toLowerCase();
  const names = await resolveNames(acct, rows);
  return new Set(rows.map((r) => r.sender).filter((s) => s.toLowerCase() === needle || names[s]?.toLowerCase() === needle));
}

async function storedRooms(acct: Account, roomArg?: string) {
  const rooms = roomArg ? [await resolveRoomArg(acct, roomArg)] : await allRooms(acct);
  const stored: { room: Room; rows: Row[]; complete: boolean }[] = [];
  const failed: string[] = [];
  for (const room of rooms) {
    const meta = await syncRoom(room.channelId).catch(() => {
      failed.push(room.name);
      return null;
    });
    stored.push({ room, rows: mergeRevisions(await storedRows(room.channelId)), complete: meta?.complete ?? false });
  }
  const partial = stored
    .filter((s) => !s.complete)
    .map((s) => `${s.room.name} (${s.room.spaceId}) from ${s.rows[0] ? new Date(s.rows[0].sentAt).toISOString().slice(0, 10) : "now"}`);
  const notes: string[] = [];
  if (partial.length) notes.push(`searched local history only: ${partial.join(", ")}; \`huddo sync --full --room <spaceId>\` fetches the rest`);
  if (failed.length) notes.push(`could not reach the server for ${failed.join(", ")}; searched what is stored`);
  return { stored, notes };
}

export async function files(ctx: Ctx, opts: { query?: string; room?: string; from?: string; type?: string; limit?: number }) {
  const acct = account(ctx);
  const slug = acct.identity.slug;
  const limit = clampInt(opts.limit, 20, HISTORY_MAX);
  const { stored, notes } = await storedRooms(acct, opts.room);
  const all = stored.flatMap((s) => s.rows);
  const from = opts.from ? await sendersNamed(acct, all, opts.from) : undefined;
  const words = opts.query?.trim().toLowerCase();
  const kind = opts.type?.trim().toLowerCase().replace(/^\./, "");
  const hits = stored
    .flatMap((s) => s.rows.flatMap((row) => row.attachments.map((a) => ({ room: s.room, row, a }))))
    .filter(({ row, a }) => !row.system && (!from || from.has(row.sender)))
    .filter(({ a }) => !words || a.filename.toLowerCase().includes(words))
    .filter(({ a }) => !kind || a.mime_type.toLowerCase().includes(kind) || a.filename.toLowerCase().endsWith(`.${kind}`))
    .sort((x, y) => y.row.sentAt - x.row.sentAt);
  const names = await resolveNames(acct, hits.map((h) => h.row));
  const shown = hits.slice(0, limit).map(({ room, row, a }) => ({
    spaceId: room.spaceId,
    room: room.name,
    msgid: row.id,
    seq: row.seq,
    sender: row.sender,
    sender_name: names[row.sender] ?? null,
    sentAt: new Date(row.sentAt).toISOString(),
    blob_id: a.blob_id,
    filename: a.filename,
    mime_type: a.mime_type,
    size: a.size,
    local_path: cachedFile(slug, a.blob_id),
    ...(row.whisper ? { whisper_to: row.whisper.to } : {}),
  }));
  const lines = shown.map(
    (f) =>
      `[${f.room} ${f.spaceId}] #${f.seq} ${f.msgid} | ${f.sender_name ? `${f.sender} (${f.sender_name})` : f.sender} | ${f.sentAt} | ${f.whisper_to ? `[whisper to ${f.whisper_to}] ` : ""}${f.filename} (${f.mime_type}, ${formatBytes(f.size)}) | ${f.local_path ?? "not downloaded"}`,
  ).map(safeLine);
  const summary = [`${hits.length} ${hits.length === 1 ? "file" : "files"}${hits.length > limit ? `, showing the latest ${limit}` : ""}`, ...notes].join("; ");
  return { json: shown, text: [...lines, `(${summary})`].join("\n") };
}

export async function search(
  ctx: Ctx,
  opts: { query?: string; room?: string; from?: string; since?: string; until?: string; hasFile?: boolean; limit?: number },
): Promise<MessageBatch> {
  const acct = account(ctx);
  const text = opts.query?.trim() || undefined;
  if (!text && !opts.from && !opts.since && !opts.until && !opts.hasFile) {
    throw new UserError("give words to search for, or a filter: --from, --since, --until, --has-file");
  }
  const limit = clampInt(opts.limit, 20, HISTORY_MAX);
  const { stored, notes } = await storedRooms(acct, opts.room);
  const from = opts.from ? await sendersNamed(acct, stored.flatMap((s) => s.rows), opts.from) : undefined;
  if (from && !from.size) throw new UserError(`no sender named "${opts.from}" in the stored messages; use a slug or a display name`);
  const q: SearchQuery = {
    text,
    from,
    since: opts.since ? parseWhen(opts.since) : undefined,
    until: opts.until ? parseWhen(opts.until) : undefined,
    hasFile: opts.hasFile,
  };
  const hits = stored.flatMap((s) => s.rows.filter((r) => matches(r, q)).map((row) => ({ room: s.room, row })));
  hits.sort((a, b) => b.row.sentAt - a.row.sentAt);
  const kept = hits.slice(0, limit);
  const groups = stored
    .map((s) => ({ room: s.room, rows: kept.filter((h) => h.room === s.room).map((h) => h.row).sort((a, b) => a.seq - b.seq) }))
    .filter((g) => g.rows.length);
  const parts = [`${hits.length} ${hits.length === 1 ? "match" : "matches"}${hits.length > limit ? `, showing the latest ${limit}` : ""}`, ...notes];
  return storeBatch(acct, groups, parts.join("; "));
}

export async function show(ctx: Ctx, opts: { id: string; room?: string; context?: number; pages?: number }): Promise<MessageBatch> {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const { rows, merged, at } = await locate(acct, room, opts.id, opts.pages);
  const around = Math.max(0, Math.min(50, Math.floor(opts.context ?? 3)));
  const edits = rows.filter((r) => r.revision?.target === opts.id);
  const hint = [
    `${opts.id} with ${around} ${around === 1 ? "message" : "messages"} before and after`,
    ...edits.map((e) => (e.revision?.kind === "unsend" ? `unsent at ${new Date(e.sentAt).toISOString()}` : `edited at ${new Date(e.sentAt).toISOString()}: ${JSON.stringify(e.text)}`)),
  ].join("; ");
  return storeBatch(acct, [{ room, rows: merged.slice(Math.max(0, at - around), at + around + 1) }], hint);
}

export async function sync(ctx: Ctx, opts: { room?: string; full?: boolean }) {
  const acct = account(ctx);
  const rooms = opts.room ? [await resolveRoomArg(acct, opts.room)] : await allRooms(acct);
  const out: { spaceId: string; room: string; messages: number; complete: boolean; oldest: string | null }[] = [];
  for (const room of rooms) {
    let meta = await syncRoom(room.channelId);
    while (opts.full && !meta.complete) {
      const before = (await storedRows(room.channelId)).length;
      meta = await extendBack(room.channelId);
      if (!meta.complete && (await storedRows(room.channelId)).length === before) break;
    }
    const rows = await storedRows(room.channelId);
    out.push({
      spaceId: room.spaceId,
      room: room.name,
      messages: mergeRevisions(rows).length,
      complete: meta.complete,
      oldest: rows[0] ? new Date(rows[0].sentAt).toISOString() : null,
    });
  }
  const text = out
    .map((r) => `"${r.room}" (${r.spaceId}): ${r.messages} messages stored, ${r.complete ? "back to the start of the room" : `back to ${r.oldest ?? "now"}; --full fetches the rest`}`)
    .join("\n");
  return { json: out, text: text || "not in any room yet" };
}

export function emptyBatch(): MessageBatch {
  return { groups: [], names: {} };
}

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export async function listening(ctx: Ctx, daemon: { running: boolean; detail: string }) {
  const acct = account(ctx);
  const slug = acct.identity.slug;
  const name = await ownName(acct);
  const l = listenerState(slug);
  const now = Date.now();
  const line = l.listening
    ? `yes: huddo wait running since ${ago(now - (l.startedAt ?? now))} (pid ${l.pid}${l.room ? `, room ${l.room}` : ""})`
    : l.endedAt
      ? `no: the last wait ended ${ago(now - l.endedAt)}. Run huddo wait again to keep listening`
      : "no: huddo wait has not run yet for this identity";
  return {
    json: { slug, name, listening: l.listening, listener: l, daemon },
    text: [`you:       ${nameAndSlug(name, slug)}`, `listening: ${line}`, `daemon:    ${daemon.detail}`].join("\n"),
  };
}

export async function members(ctx: Ctx, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const roster = await fetchSpaceMembers(acct.http, room.spaceId);
  const slugs = roster.map((m) => m.slug);
  const found: Record<string, string> = {};
  for (const p of await fetchProfiles(acct.http, slugs).catch(() => [])) if (p.display_name) found[p.slug] = p.display_name;
  rememberNames(found);
  const names: Record<string, string> = { ...cachedNames(), ...found };
  const items = roster.map((m) => ({
    slug: m.slug,
    name: names[m.slug] ?? null,
    role: m.role,
    self: m.slug === acct.identity.slug,
  }));
  return {
    json: items,
    text: items
      .map((i) => `${nameAndSlug(i.name, i.slug)} [${i.role}]${i.self ? " (you)" : ""}`)
      .map(safeLine)
      .join("\n"),
  };
}

function readFileArg(path: string): Uint8Array<ArrayBuffer> {
  if (!existsSync(path)) throw new UserError(`file not found: ${path}`);
  return Uint8Array.from(readFileSync(path));
}

export async function send(
  ctx: Ctx,
  opts: { text?: string; room?: string; replyTo?: string; files?: string[]; mentions?: string[]; options?: OptionInput[]; form?: unknown; quote?: QuoteInput | null; extra?: Record<string, unknown> },
) {
  if (!opts.replyTo && opts.text) opts = { ...opts, ...splitTrailingReplyTo(opts.text) };
  const files = opts.files ?? [];
  const rich = richContent(opts.text, opts.options, opts.form);
  const mentions = opts.mentions ?? [];
  const quoteIn = opts.quote ?? null;
  if (quoteIn && opts.replyTo) throw new UserError("a message quotes one thing: give a quote or a reply-to, not both");
  if (quoteIn && !opts.text?.trim()) throw new UserError(QUOTE_NEEDS_TEXT);
  if (!opts.text?.length && files.length === 0 && mentions.length === 0) throw new UserError("nothing to send: give text and/or files");
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) throw new UserError(`up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`);
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  if (mentions.length) {
    const tags: string[] = [];
    for (const who of mentions) {
      const tag = who.replace(/^@/, "").toLowerCase() === "all" ? "@all" : `@${(await resolveMember(acct, room.spaceId, who)).slug}`;
      if (!tags.includes(tag)) tags.push(tag);
    }
    opts = { ...opts, text: [tags.join(" "), opts.text ?? ""].filter(Boolean).join(" ") };
  }
  if (quoteIn) opts = { ...opts, extra: { ...opts.extra, quotes: [await roomQuote(acct, room, quoteIn)] } };
  const attachments: AttachmentMeta[] = [];
  for (const path of files) attachments.push(await uploadFileArg(ctx.rt.crypto, acct.http, path));
  const body = opts.text ?? "";
  const preview = attachments.length || rich || opts.extra ? null : await linkPreview(body, (file) => encryptAndUploadAttachment(ctx.rt.crypto, acct.http, file));
  const structured = attachments.length || rich || preview || quoteIn;
  const posted = await postWithLimits(() =>
    postToRoom(
      room,
      structured ? ATTACHMENT_CONTENT_TYPE : "text/plain",
      structured
        ? { text: body, attachments, ...rich, ...(preview ? { preview } : {}), ...opts.extra }
        : opts.extra ? { text: body, ...opts.extra } : body,
      opts.replyTo,
    ),
  );
  return {
    json: {
      id: posted.id,
      seq: posted.seq ?? null,
      spaceId: room.spaceId,
      room: room.name,
      attachments: attachments.map((a) => a.filename),
    },
    text: `sent ${posted.id}${posted.seq ? ` (#${posted.seq})` : ""} to "${room.name}" (${room.spaceId})`,
  };
}

const SLOW_MODE_AUTO_WAIT_MS = 10_000;

type Posted = { id: string; seq: number | null };

/** The server's refusal, from a direct request or from core, which reports it as `http_status_<n> body=<body>`. */
export function rejection(e: unknown): { status: number; body: string } | null {
  if (e instanceof HttpError) return { status: e.status, body: e.body };
  const found = /http_status_(\d{3})(?: reason=\S+)?(?: body=([\s\S]*))?$/.exec(errorText(e));
  return found ? { status: Number(found[1]), body: found[2] ?? "" } : null;
}

/** Space and invite events are signed in core with the account's subkey. */
const coreSigner = async () => (await awaitCoreSpaceEvents()).signer();

/** Core signs and sends; the idempotency key keeps a retried post one message. */
async function postToRoom(room: Pick<Room, "spaceId" | "channelId">, contentType: string, content: unknown, replyTo?: string): Promise<Posted> {
  const sender = await awaitCoreMessageSender();
  const stored = await sender.send({
    target: { kind: "channel", spaceId: room.spaceId, channelId: room.channelId },
    contentType,
    content,
    idempotencyKey: `cli_${randomUUID()}`,
    replyToId: replyTo || undefined,
  });
  return { id: stored.envelope_id, seq: stored.seq ?? null };
}

async function postWithLimits(post: () => Promise<Posted>): Promise<Posted> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await post();
    } catch (e) {
      if (errorText(e).toLowerCase().includes("is encrypted")) {
        throw new UserError("this room is end-to-end encrypted; huddo posts only to Huddo rooms, which are not");
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
  const posted = await postWithLimits(() => postToRoom(room, REACTION_CONTENT_TYPE, reactionContent(message, emoji, !opts.remove)));
  return {
    json: { id: posted.id, seq: posted.seq ?? null, spaceId: room.spaceId, room: room.name, message, emoji, removed: Boolean(opts.remove) },
    text: `${opts.remove ? "removed" : "reacted"} ${emoji} ${opts.remove ? "from" : "to"} ${message} in "${room.name}" (${room.spaceId})`,
  };
}

async function postRevision(post: () => Promise<Posted>): Promise<Posted> {
  try {
    return await postWithLimits(post);
  } catch (e) {
    const known = revisionError(e);
    if (known) throw new UserError(known);
    const refused = rejection(e);
    if (refused && [400, 403, 410].includes(refused.status)) {
      let message = refused.body;
      try {
        message = (JSON.parse(refused.body) as { message?: string }).message ?? refused.body;
      } catch {
        message = refused.body;
      }
      throw new UserError(message.slice(0, 500));
    }
    throw e;
  }
}

export async function edit(ctx: Ctx, opts: { message?: string; text?: string; room?: string }) {
  const message = opts.message?.trim() ?? "";
  const text = opts.text?.trim() ?? "";
  if (!message) throw new UserError("edit needs the message id (msg_...)");
  if (!text) throw new UserError("edit needs the new text");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const original = (await recentRows(room.channelId, PARENT_LOOKUP_LIMIT)).find((r) => r.id === message);
  if (original && original.sender !== acct.identity.slug) throw new UserError("you can only edit your own messages");
  let contentType = EDIT_CONTENT_TYPE;
  let content: unknown = editContent(message, text);
  if (original?.whisper) {
    const to = original.whisper.to;
    const devices = await fetchRecipientDevices(acct.http, ctx.rt.crypto, [to, acct.identity.slug]);
    if (!devices.some((d) => d.slug === to)) throw new UserError(`${to} has no active device to whisper to`);
    const body = { text, ...(original.quote ? { quote: original.quote } : {}), ...(original.attachments.length ? { attachments: original.attachments } : {}) };
    const sealed = sealWhisper(ctx.rt.crypto, { spaceId: room.spaceId, channelId: room.channelId, sender: acct.identity.slug, to }, body, devices);
    contentType = WHISPER_CONTENT_TYPE;
    content = whisperEditContent(sealed, message);
  }
  const posted = await postRevision(() => postToRoom(room, contentType, content));
  return {
    json: { id: posted.id, seq: posted.seq ?? null, spaceId: room.spaceId, room: room.name, message, whisper: Boolean(original?.whisper) },
    text: `edited ${message}${original?.whisper ? " (whisper)" : ""} in "${room.name}" (${room.spaceId})`,
  };
}

async function postAbout(
  ctx: Ctx,
  opts: { message?: string; room?: string },
  usage: string,
  contentType: string,
  content: (message: string) => unknown,
  done: string,
  post: typeof postWithLimits,
) {
  const message = opts.message?.trim() ?? "";
  if (!message) throw new UserError(usage);
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const posted = await post(() => postToRoom(room, contentType, content(message)));
  return {
    json: { id: posted.id, seq: posted.seq ?? null, spaceId: room.spaceId, room: room.name, message },
    text: `${done} ${message} in "${room.name}" (${room.spaceId})`,
  };
}

export const unsend = (ctx: Ctx, opts: { message?: string; room?: string }) =>
  postAbout(ctx, opts, "unsend needs the message id (msg_...)", UNSEND_CONTENT_TYPE, unsendContent, "unsent", postRevision);

export const closeChoices = (ctx: Ctx, opts: { message?: string; room?: string }) =>
  postAbout(ctx, opts, "close-choices needs the id (msg_...) of your message with options", CHOICE_CLOSE_CONTENT_TYPE, closeContent, "closed the choices on", postWithLimits);

export async function answer(ctx: Ctx, opts: { message?: string; room?: string } & AnswerInput) {
  const message = opts.message?.trim() ?? "";
  if (!message) throw new UserError("answer needs the id (msg_...) of a message with options or a form");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const content = answerContent(await recentRows(room.channelId, PARENT_LOOKUP_LIMIT), message, opts);
  const posted = await postWithLimits(() => postToRoom(room, ATTACHMENT_CONTENT_TYPE, content, message));
  return { json: { id: posted.id, seq: posted.seq ?? null, room: room.name, message }, text: `answered ${message} in "${room.name}" (${room.spaceId})` };
}

function appFail(err: unknown): never {
  const e = toAppError(err);
  throw new UserError(`${e.code}: ${e.message}`);
}

function readJsonArg(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new UserError(`${what} is not valid JSON`);
  }
}

export async function apps(ctx: Ctx, opts: { app?: string; room?: string }) {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  try {
    if (opts.app) {
      const [snap, list] = await Promise.all([getAppState(acct.http, room.spaceId, opts.app), listApps(acct.http, room.spaceId)]);
      const meta = list.find((a) => a.app_id === snap.app_id);
      const head = meta
        ? `${safeLine(meta.name)} (${meta.app_id}) v${snap.version} schema ${snap.schema_version} revision ${snap.revision}${meta.description ? `\n${safeLine(meta.description)}` : ""}`
        : `${opts.app} revision ${snap.revision}`;
      const guide = meta?.guide ? `\n\nguide:\n${neutralizeTags(meta.guide)}` : "";
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
            .map((a) => `${a.app_id}  ${a.name}  v${a.version}  revision ${a.revision}  ${a.enabled ? "on" : "off"}  write: ${a.write_access}${a.description ? `\n    ${a.description}` : ""}`)
            .map(safeLine)
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

/** The one quote a message or a whisper carries, from the room's apps and the files stored for it, newest first. */
async function roomQuote(acct: Account, room: Room, input: QuoteInput): Promise<MessageQuote> {
  const stored = async () => (await storedRooms(acct, room.spaceId)).stored.flatMap((s) => s.rows);
  const rows = async (whispers: boolean) =>
    (await stored()).filter((r) => Boolean(r.whisper) === whispers).sort((a, b) => b.sentAt - a.sentAt).flatMap((r) => r.attachments);
  return buildQuote(input, {
    apps: () => listApps(acct.http, room.spaceId).catch(appFail),
    files: () => rows(false),
    whisperFiles: () => rows(true),
    message: async (id) => {
      const row = (await stored()).find((r) => r.id === id);
      return row ? { whisper: Boolean(row.whisper), text: row.text } : null;
    },
  });
}

export async function whisper(ctx: Ctx, opts: { text?: string; to?: string; room?: string; replyTo?: string; quote?: QuoteInput | null; files?: string[] }) {
  const text = opts.text?.trim() ?? "";
  const files = opts.files ?? [];
  if (!text) throw new UserError("nothing to whisper: give the text");
  if (!opts.to) throw new UserError("whisper needs --to <slug or name>");
  if (opts.quote && opts.replyTo) throw new UserError("a message quotes one thing: give a quote or a reply-to, not both");
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) throw new UserError(`up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`);
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const member = await resolveMember(acct, room.spaceId, opts.to);
  if (member.slug === acct.identity.slug) throw new UserError("you cannot whisper to yourself");
  const { max_message_chars: maxChars } = await fetchLimits(acct.http, room.spaceId);
  const chars = [...text].length;
  if (chars > maxChars) throw new UserError(`message is ${chars} characters; this huddo allows at most ${maxChars}`);
  const devices = await fetchRecipientDevices(acct.http, ctx.rt.crypto, [member.slug, acct.identity.slug]);
  if (!devices.some((d) => d.slug === member.slug)) throw new UserError(`${opts.to} has no active device to whisper to`);
  // The quote is sealed with the text, so only the two of you see what it quotes.
  const quote = opts.quote ? await roomQuote(acct, room, opts.quote) : undefined;
  const attachments: AttachmentMeta[] = [];
  for (const path of files) attachments.push(await uploadFileArg(ctx.rt.crypto, acct.http, path));
  const content = sealWhisper(
    ctx.rt.crypto,
    { spaceId: room.spaceId, channelId: room.channelId, sender: acct.identity.slug, to: member.slug },
    { text, ...(quote ? { quote } : {}), ...(attachments.length ? { attachments } : {}) },
    devices,
  );
  const posted = await postWithLimits(() => postToRoom(room, WHISPER_CONTENT_TYPE, content, opts.replyTo));
  const label = nameAndSlug(member.name, member.slug);
  return {
    json: { id: posted.id, seq: posted.seq ?? null, spaceId: room.spaceId, room: room.name, to: member.slug, attachments: attachments.map((a) => a.filename) },
    text: `whispered ${posted.id}${posted.seq ? ` (#${posted.seq})` : ""} to ${label} in "${room.name}" (${room.spaceId})`,
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
    await (await awaitCoreSpaceEvents()).submit([removeEvent(room.spaceId, member.slug, nonceFrom(ctx.rt.crypto))]);
  } catch (e) {
    if (rejection(e)?.status === 403) throw new UserError(`only the owner of "${room.name}" or someone paired with them can remove members`);
    throw e;
  }
  const label = nameAndSlug(member.name, member.slug);
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
      if (e instanceof HttpError && e.status === 403) throw new UserError(`only the owner of "${room.name}" or someone paired with them can change its limits`);
      throw e;
    }
  }
  return {
    json: { spaceId: room.spaceId, room: room.name, ...current },
    text: `"${room.name}": slow mode 1 message per ${formatSeconds(current.slow_mode_s)} per member (owner side exempt); messages up to ${current.max_message_chars} characters`,
  };
}

export function writeNewFile(dir: string, name: string, bytes: Uint8Array | string): string {
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
  const slug = acct.identity.slug;
  const row = mergeRevisions(await storedUntil(acct, room, (all) => all.some((r) => r.id === id), FIND_PAGES)).find((r) => r.id === id);
  if (!row) throw await notFound(id, room);
  if (!row.attachments.length) throw new UserError(`message ${id} has no attachments`);
  const dir = opts.outDir ?? joinPath(homeDir(), "downloads");
  mkdirSync(dir, { recursive: true });
  const saved: string[] = [];
  for (const a of row.attachments) {
    if (isStreamedAttachment(a)) {
      saved.push(await saveStreamedAttachment(ctx.rt.crypto, acct.http, a, writeNewFile(dir, basename(oneLine(a.filename || a.blob_id)), new Uint8Array(0))));
      continue;
    }
    const hit = cachedFile(slug, a.blob_id);
    const bytes = hit ? readFileSync(hit) : await downloadAndDecryptAttachment(ctx.rt.crypto, acct.http, a);
    if (!hit) cacheFile(slug, a.blob_id, bytes);
    saved.push(writeNewFile(dir, basename(oneLine(a.filename || a.blob_id)), bytes));
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
      `you:     ${nameAndSlug(profile?.display_name, acct.identity.slug)}`,
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
    text: items.map((i) => `${i.active ? "*" : " "} ${nameAndSlug(i.name, i.slug)}  room: ${i.room ?? "-"}`).join("\n") || "(no identities)",
  };
}

export async function identityNew(ctx: Ctx, name?: string) {
  const { acct, backup } = await createIdentity(ctx.rt, name);
  return { json: { slug: acct.identity.slug, active: true, ...backup.json }, text: `created ${acct.identity.slug} (now active)${backup.text}` };
}

const NO_BACKUP = { json: {}, text: "" };

function withBackup<T extends object>(backup: { json: object; text: string }, result: { json: T; text: string }) {
  return { json: { ...result.json, ...backup.json }, text: result.text + backup.text };
}

type SignupBackup = { json: { backup_key: string | null; backup_hint?: string }; text: string };

/** The backup the server made in this run's signup; an error after the signup still shows it. */
let signupBackup: SignupBackup | null = null;

export function signupBackupNote(): string {
  return signupBackup?.text ?? "";
}

function backupResult(key: string | undefined): SignupBackup {
  return key
    ? { json: { backup_key: key, backup_hint: keepKeyHintFor(key) }, text: `\nrecovery code: ${key}\n${keepKeyHintFor(key)}` }
    : { json: { backup_key: null }, text: "\nnote: the server made no backup at signup; run `huddo backup create` to make one." };
}

export async function backupCommand(ctx: Ctx, sub: string | undefined, key: string | undefined) {
  const withKey = (run: (k: string) => Promise<{ json: unknown; text: string }>) => {
    if (!key) throw new UserError(`usage: huddo backup ${sub} --key <code>`);
    return run(key);
  };
  switch (sub) {
    case "create": return backupCreate(ctx);
    case "status": return backupStatusCmd(ctx);
    case "remove": return withKey((k) => backupRemove(ctx, k));
    case "recover": return withKey((k) => backupRecover(ctx, k));
    default: throw new UserError(`unknown backup command "${sub ?? ""}" (see huddo --help)`);
  }
}

export async function backupCreate(ctx: Ctx) {
  const acct = account(ctx);
  const key = await createBackup(acct).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 409) {
      throw new UserError("this identity already has 5 backups; remove one with `huddo backup remove --key <code>` first");
    }
    throw e;
  });
  return {
    json: { slug: acct.identity.slug, backup_key: key, backup_hint: keepKeyHintFor(key) },
    text: `recovery code for ${acct.identity.slug}: ${key}\n${keepKeyHintFor(key)}\n${EARLIER_KEYS_WORK}`,
  };
}

export async function backupStatusCmd(ctx: Ctx) {
  const acct = account(ctx);
  const made = (await backupStatus(acct)).map((b) => new Date(b.created_at_ms).toISOString());
  return {
    json: { slug: acct.identity.slug, backups: made.map((created_at) => ({ created_at })) },
    text: made.length
      ? `${acct.identity.slug} has ${made.length} backup${made.length === 1 ? "" : "s"}, made ${made.join(", ")}`
      : `no backup for ${acct.identity.slug}; run \`huddo backup create\``,
  };
}

function keyError(e: unknown): never {
  if (e instanceof BackupKeyError || e instanceof BackupImportError) throw new UserError(e.message);
  throw e;
}

export async function backupRemove(ctx: Ctx, key: string) {
  const slug = await removeBackup(ctx.rt.http(), key).catch(keyError);
  return { json: { slug, removed: true }, text: `removed a backup of ${slug}; its recovery code no longer works` };
}

export async function backupRecover(ctx: Ctx, key: string) {
  const stored = await openBackup(ctx.rt.http(), key).catch(keyError);
  const identity = await registerNewDevice(stored, ctx.rt.crypto);
  await ctx.rt.keyStore.saveIdentity(identity);
  updateConfig((c) => {
    c.active = identity.slug;
  });
  await accountFor(ctx.rt, identity.slug).http.ensureAccountSubkey();
  return { json: { slug: identity.slug, active: true }, text: `recovered ${identity.slug} on this device (now active); the recovery code still works` };
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
  if (!operator) throw new UserError("you are not paired with a person; run `huddo pair` first");
  return { slug: operator, whose: "the paired person's " };
}

async function saveProfile(acct: Account, slug: string, patch: { display_name?: string; avatar_url?: string }) {
  try {
    await updateProfile(acct.http, slug, patch);
  } catch (e) {
    if (e instanceof HttpError && e.status === 403 && slug !== acct.identity.slug) {
      throw new UserError("the server says you are no longer paired with this person; run `huddo pair` again");
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

type AvatarEntry = { id: string; label: string; path: string };

async function avatarLibrary(): Promise<AvatarEntry[]> {
  const res = await fetch(`${ORIGIN}/agent-avatars/index.json`);
  if (!res.ok) throw new UserError(`avatar library unavailable (HTTP ${res.status})`);
  return (await res.json()) as AvatarEntry[];
}

const avatarChoices = (library: AvatarEntry[]) => library.map((e) => e.id).join(", ");

export async function ownName(acct: Account, given?: string): Promise<string | null> {
  if (given?.trim()) return given.trim();
  const [profile] = await fetchProfiles(acct.http, [acct.identity.slug]).catch(() => []);
  return profile?.display_name ?? null;
}

export async function avatarBytes(arg: string): Promise<{ bytes: Uint8Array; label: string }> {
  if (existsSync(arg)) {
    if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extname(arg).toLowerCase())) {
      throw new UserError("avatar must be a .png, .jpg, .gif, .webp or .svg file");
    }
    return { bytes: readFileArg(arg), label: basename(arg) };
  }
  const library = await avatarLibrary();
  const entry = library.find((e) => e.id === arg.trim().toLowerCase());
  if (!entry) {
    throw new UserError(`"${arg}" is neither an image file nor a library avatar. Pick one of these ids: ${avatarChoices(library)}`);
  }
  const svg = await fetch(`${ORIGIN}${entry.path}`);
  if (!svg.ok) throw new UserError(`avatar ${arg} unavailable (HTTP ${svg.status})`);
  return { bytes: framedSvg(await svg.text()), label: entry.label };
}

export async function updateAvatar(ctx: Ctx, arg: string, forOperator?: boolean) {
  return setAvatar(ctx, await avatarBytes(arg), forOperator);
}

export async function setAvatar(ctx: Ctx, picked: { bytes: Uint8Array; label: string }, forOperator?: boolean) {
  const acct = account(ctx);
  const target = await profileTarget(acct, forOperator);
  const { bytes, label } = picked;
  if (bytes.length > MAX_PROFILE_AVATAR_BYTES) throw new UserError("avatar image is larger than 4 MiB");
  const avatarUrl = await uploadAvatar(acct.http, acct.identity.server_url, bytes, ctx.rt.crypto);
  await saveProfile(acct, target.slug, { avatar_url: avatarUrl });
  return { json: { slug: target.slug, avatar_url: avatarUrl }, text: `${target.whose}avatar set to ${label} (${avatarUrl})` };
}

export async function exportIdentity(ctx: Ctx, opts: { passphrase?: string; out?: string }) {
  const acct = account(ctx);
  const generated = opts.passphrase === undefined;
  const passphrase = opts.passphrase ?? Buffer.from(ctx.rt.crypto.generateRandomBytes(12)).toString("base64url");
  const bundle = await (await exportKeyBackup(acct.identity, passphrase)).text();
  const shown = generated ? { passphrase } : {};
  const line = generated ? `\npassphrase: ${passphrase}` : "";
  if (opts.out) {
    writeFileSync(opts.out, bundle, { mode: 0o600 });
    return {
      json: { slug: acct.identity.slug, file: opts.out, ...shown },
      text: `bundle for ${acct.identity.slug} written to ${opts.out}${line}`,
    };
  }
  return { json: { slug: acct.identity.slug, bundle, ...shown }, text: `${bundle}${line}` };
}

export async function importIdentity(ctx: Ctx, file: string, passphrase: string) {
  const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  const identity = await registerNewDevice(await decryptKeyBackup(new Blob([text]), passphrase), ctx.rt.crypto);
  await ctx.rt.keyStore.saveIdentity(identity);
  updateConfig((c) => {
    c.active = identity.slug;
  });
  await accountFor(ctx.rt, identity.slug).http.ensureAccountSubkey();
  return { json: { slug: identity.slug, active: true }, text: `imported ${identity.slug} (now active)` };
}
