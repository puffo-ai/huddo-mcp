import { HttpError } from "../src/http/types";
import { fetchSpaces } from "../src/features/spaces/adapters";
import { messageLink, targetFromSearch, type MessageTarget } from "../src/huddo/message-link";
import { roomIdFromJoinTarget } from "../src/huddo/room-link";
import { updateProfile } from "../src/ui/services/profile-service";
import { ORIGIN, type Room } from "./home";
import * as ops from "./ops";
import { rowsAround, type Row } from "./rows";
import { activeSlug, type Account } from "./runtime";
import { mergeRevisions } from "./store";
import { UserError } from "./text-args";

/** A message link (`<origin>/chat/<roomId>?m=<msgId>`, as Copy link makes it) split into its ids;
 *  null for anything else, an invite link included. A link to another host names a room on that host's server,
 *  not this one, so it is refused rather than followed here. */
export function parseMessageLink(arg: string, origin = ORIGIN): MessageTarget | null {
  const trimmed = arg.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const [route, roomId, ...rest] = url.pathname.split("/").filter(Boolean);
  const target = route === "chat" && roomId && rest.length === 0 ? targetFromSearch(roomId, url.search) : null;
  const home = new URL(origin).host;
  if (target && url.host !== home) throw new UserError(`not a Huddo message link: it points at ${url.host}, and this Huddo server is ${home}`);
  return target;
}

/** Why a message gets no link, or null when it can have one. A whisper's link would reach people it wasn't
 *  for, so whispers never get one. */
export function linkRefusal(row: Row): string | null {
  if (row.whisper) return "a whisper can't be linked: the link would reach people it wasn't for";
  if (row.unsent) return "that message was unsent";
  if (row.system) return "a room notice can't be linked";
  return null;
}

/** The room's own join code when it lets people join by its link, as the web's /join/<room> page asks;
 *  null when it doesn't, or there is no such room. */
async function roomLinkCode(ctx: ops.Ctx, roomId: string): Promise<string | null> {
  try {
    const body = await ctx.rt.http().getUnsigned<{ code?: unknown }>(`/v2/invitations/rooms/${encodeURIComponent(roomId)}`);
    return typeof body?.code === "string" && body.code ? body.code : null;
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw new UserError("too many room lookups from this address: try again in a minute");
    if (e instanceof HttpError && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
}

function refuseOtherHost(arg: string): void {
  if (!/^https?:/i.test(arg.trim())) return;
  const { host } = new URL(arg.trim());
  const home = new URL(ORIGIN).host;
  if (host !== home) throw new UserError(`not a link to this Huddo: it points at ${host}, and this Huddo server is ${home}`);
}

/** `join` for an invite, a room id or link, or a message link. A room's id and links stand for its own link:
 *  joining takes the room's link code, and a member of a room closed to link joins still opens it. A message
 *  link then shows the message, or why it can't be shown. */
export async function join(ctx: ops.Ctx, invite: string, name?: string, avatar?: string) {
  const target = parseMessageLink(invite);
  if (!target) {
    const roomId = roomIdFromJoinTarget(invite);
    if (!roomId) return ops.join(ctx, invite, name, avatar);
    refuseOtherHost(invite);
    ops.checkName(name);
    const code = await roomLinkCode(ctx, roomId);
    return code ? ops.join(ctx, code, name, avatar) : openAsMember(ctx, roomId, name, avatar);
  }
  ops.checkName(name);
  const code = await roomLinkCode(ctx, target.roomId);
  const joined = await (code ? ops.join(ctx, code, name, avatar) : openAsMember(ctx, target.roomId, name, avatar));
  return { ...joined, json: { ...joined.json, message: target.msgId }, batch: await linkedMessage(ctx, joined.json, target.msgId) };
}

async function openAsMember(ctx: ops.Ctx, roomId: string, name?: string, avatar?: string) {
  const acct = activeSlug(ctx.as) ? ops.account(ctx) : null;
  const space = acct ? (await fetchSpaces(acct.http)).find((s) => s.id === roomId) : undefined;
  const room = acct && space ? await ops.roomFor(acct, space) : null;
  if (!acct || !room) {
    throw new UserError(`huddo ${roomId} doesn't let people join by its link, or doesn't exist: ask someone in it for an invite link`);
  }
  if (name?.trim()) {
    await updateProfile(acct.http, acct.identity.slug, { display_name: name.trim() });
    ops.rememberNames({ [acct.identity.slug]: name.trim() });
  }
  if (avatar) await ops.setAvatar(ctx, await ops.avatarBytes(avatar));
  await ops.makeDefault(acct, room);
  return {
    json: { slug: acct.identity.slug, created: false, joined: false, spaceId: room.spaceId, name: room.name },
    text: `as ${ops.nameAndSlug(await ops.ownName(acct, name), acct.identity.slug)}: already in "${room.name}" (${room.spaceId})`,
  };
}

async function linkedMessage(ctx: ops.Ctx, room: Pick<Room, "spaceId" | "name">, id: string): Promise<ops.MessageBatch> {
  try {
    // Straight to the server's window: a linked message is often older than a fresh join's first page.
    const batch = await ops.show(ctx, { id, room: room.spaceId, pages: 0 });
    // An unsent target is gone, as the web says: arriving on its placeholder would look like it was found.
    const target = batch.groups.flatMap((g) => g.rows).find((r) => r.id === id);
    if (!target?.unsent) return batch;
    return { ...ops.emptyBatch(), hint: `message ${id} isn't available in "${room.name}" (${room.spaceId}): it was unsent` };
  } catch (e) {
    if (e instanceof UserError) return { ...ops.emptyBatch(), hint: e.message };
    throw e;
  }
}

/** The message among the stored messages after paging back up to `pages` pages, or else in the server's
 *  window around it (not stored: it may sit past a gap). */
export async function locate(acct: Account, room: Room, id: string, pages = ops.FIND_PAGES): Promise<{ rows: Row[]; merged: Row[]; at: number }> {
  const rows = await ops.storedUntil(acct, room, (all) => all.some((r) => r.id === id), pages);
  const merged = mergeRevisions(rows);
  const at = merged.findIndex((r) => r.id === id);
  if (at >= 0) return { rows, merged, at };
  const window = await rowsAround(room.channelId, id);
  const shown = window === "unavailable" ? [] : mergeRevisions(window);
  const found = shown.findIndex((r) => r.id === id);
  if (found < 0) throw new UserError(`message ${id} isn't available in "${room.name}" (${room.spaceId}): it was deleted or unsent, or you can't see it`);
  return { rows: window as Row[], merged: shown, at: found };
}

export async function link(ctx: ops.Ctx, opts: { id: string; room?: string }) {
  const acct = ops.account(ctx);
  const room = await ops.currentRoom(acct, opts.room);
  const { merged, at } = await locate(acct, room, opts.id);
  const refusal = linkRefusal(merged[at]!);
  if (refusal) throw new UserError(refusal);
  const url = messageLink(ORIGIN, room.spaceId, opts.id);
  return { json: { url, msgid: opts.id, spaceId: room.spaceId, room: room.name }, text: url };
}
