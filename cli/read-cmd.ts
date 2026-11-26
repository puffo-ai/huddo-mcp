import { reactionFromEnvelope } from "../src/huddo/reactions";
import type { Room } from "./home";
import { fetchSystemRows, mergeByTime } from "./membership";
import {
  account,
  ackRows,
  attachParents,
  currentRoom,
  errorText,
  offline,
  pageRows,
  ReadFailed,
  resolveNames,
  storedUntil,
  UserError,
  withPairs,
  withReactions,
  type Ctx,
  type MessageBatch,
} from "./ops";
import { pageHint, readCall, unreadHeader } from "./read-hints";
import { fetchAfter, fetchMembershipChanges, markReadUpTo, serverRooms, type MembershipChange, type RoomUnread } from "./read-state";
import { HISTORY_PAGE, neutralizeTags, rowFromEnvelope, type Row } from "./rows";
import { hideUnsent, loadMeta, storedRows } from "./store";
import type { PuffoHttpClient } from "../src/http/client";

export const READ_MAX = 200;
const AFTER_PAGES = 100;

interface Item {
  seq: number;
  id: string;
  sender: string | null;
  row: Row | null;
}

type Envelope = { envelope_id?: unknown; sender_slug?: unknown; signed_payload?: { payload?: { sender_slug?: unknown; sent_at?: unknown } } };

function itemOf(seq: number, raw: unknown, channelId: string): Item {
  const envelope = raw as Envelope;
  const id = typeof envelope.envelope_id === "string" ? envelope.envelope_id : "";
  const payload = envelope.signed_payload?.payload;
  const slug = payload?.sender_slug ?? envelope.sender_slug;
  const sender = typeof slug === "string" ? slug : null;
  const reaction = reactionFromEnvelope(seq, raw, channelId);
  if (!reaction) return { seq, id, sender, row: rowFromEnvelope(seq, raw as { type?: string }, channelId) };
  const emoji = neutralizeTags(reaction.emoji);
  return {
    seq,
    id,
    sender: reaction.sender,
    row: {
      seq,
      id,
      sender: reaction.sender,
      sentAt: (payload as { sent_at: number }).sent_at,
      text: "",
      attachments: [],
      replyTo: null,
      system: { action: reaction.add ? `reacted ${emoji} to` : `removed ${emoji} from`, actor: reaction.sender, target: reaction.target },
      reaction: { emoji: reaction.emoji, target: reaction.target, add: reaction.add },
    },
  };
}

function changeItem(change: MembershipChange): Item {
  const row: Row = {
    seq: change.seq,
    id: change.cursorId,
    sender: change.slug,
    sentAt: 0,
    text: "",
    attachments: [],
    replyTo: null,
    system: { action: change.change, actor: change.slug },
  };
  return { seq: change.seq, id: change.cursorId, sender: change.slug, row };
}

function fillTimes(items: Item[]): void {
  const times = items.map((i) => (i.row?.sentAt ? i.row.sentAt : 0));
  items.forEach((item, i) => {
    if (!item.row || item.row.sentAt) return;
    const before = times.slice(0, i).reverse().find(Boolean);
    item.row.sentAt = before ?? times.slice(i + 1).find(Boolean) ?? Date.now();
  });
}

/** The rows after `since`, oldest first, until more than `cap` are unread or the room ends. */
async function rowsAfter(http: PuffoHttpClient, room: Room, since: number, self: string, cap: number) {
  const items: Item[] = [];
  let after = since;
  let more = true;
  let unread = 0;
  for (let page = 0; more && unread <= cap && page < AFTER_PAGES; page += 1) {
    const got = await fetchAfter(http, room.channelId, after, HISTORY_PAGE);
    for (const m of got.items) {
      const item = itemOf(m.seq, m.envelope, room.channelId);
      items.push(item);
      if (item.sender !== self) unread += 1;
    }
    more = got.hasMore;
    after = got.next;
  }
  const historyUpTo = more ? items[items.length - 1]!.seq : Infinity;
  const membership = await fetchMembershipChanges(http, room.channelId, since, historyUpTo);
  const upTo = Math.min(historyUpTo, membership.upTo);
  const changes = membership.changes.filter((c) => c.seq <= upTo);
  const merged = [...items.filter((i) => i.seq <= upTo), ...changes.map(changeItem)].sort((a, b) => a.seq - b.seq);
  fillTimes(merged);
  return { items: merged, complete: upTo === Infinity };
}

function lastWithId(items: Item[]): Item | undefined {
  return [...items].reverse().find((i) => i.id);
}

function limitOf(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (limit < 1 || limit > READ_MAX) throw new UserError(`--limit must be between 1 and ${READ_MAX}`);
  return Math.floor(limit);
}

function tagNew(rows: Row[], readSeq: number | undefined, self: string): Row[] {
  if (readSeq === undefined) return rows;
  return rows.map((r) => (r.seq > readSeq && r.sender !== self ? { ...r, new: true } : r));
}

async function finish(ctx: Ctx, room: Room, shown: Row[], extra: Pick<MessageBatch, "header" | "hint">): Promise<MessageBatch> {
  const acct = account(ctx);
  const rows = hideUnsent(shown, await storedRows(room.channelId));
  const names = await resolveNames(acct, rows);
  return withPairs(acct, await attachParents(acct, { groups: [{ room, rows }], names, ...extra }));
}

async function page(ctx: Ctx, room: Room, opts: { limit?: number; before?: number; after?: number }): Promise<MessageBatch> {
  const acct = account(ctx);
  const slug = acct.identity.slug;
  const limits = { before: opts.before, after: opts.after, limit: limitOf(opts.limit, 20) };
  const failures: unknown[] = [];
  const stored = await storedUntil(
    acct,
    room,
    (rows) => (opts.after !== undefined ? rows.some((r) => r.seq <= opts.after!) : pageRows(rows, limits).length >= limits.limit),
    Infinity,
    failures,
  ).catch(offline);
  const messages = pageRows(stored, limits);
  const position = await serverRooms(acct.http, slug).then((rooms) => rooms.find((r) => r.channelId === room.channelId), () => undefined);
  const events = await fetchSystemRows(acct.http, room).catch(() => ({ rows: [] }));
  const from = messages[0]?.sentAt ?? 0;
  const until = messages.at(-1)?.sentAt ?? 0;
  const rows = await withReactions(acct, room, mergeByTime(messages, events.rows.filter((r) => r.sentAt >= from && r.sentAt <= until)));
  if (failures.length) {
    const batch = await finish(ctx, room, rows, { hint: "partial: stored messages only, which may be out of date" });
    throw new ReadFailed(`could not reach the server for "${room.name}": ${errorText(failures[0])}`, batch, failures[0]);
  }
  const hint = pageHint(room.spaceId, messages, stored, (await loadMeta(room.channelId)).complete);
  return finish(ctx, room, tagNew(rows, position?.since, slug), { hint });
}

async function partial(ctx: Ctx, room: Room, e: unknown): Promise<never> {
  const stored = (await storedRows(room.channelId).catch(() => [])).slice(-20);
  if (!stored.length) offline(e);
  const batch = await finish(ctx, room, stored, { hint: "partial: stored messages only, which may be out of date" });
  throw new ReadFailed(`could not reach the server for "${room.name}": ${errorText(e)}; nothing was marked read`, batch, e);
}

export async function read(ctx: Ctx, opts: { room?: string; limit?: number; before?: number; after?: number }): Promise<MessageBatch> {
  const acct = account(ctx);
  const slug = acct.identity.slug;
  const room = await currentRoom(acct, opts.room).catch(offline);
  if (opts.before !== undefined || opts.after !== undefined) return page(ctx, room, opts);
  const cap = limitOf(opts.limit, READ_MAX);
  let position: RoomUnread | undefined;
  let fetched: Awaited<ReturnType<typeof rowsAfter>>;
  try {
    position = (await serverRooms(acct.http, slug)).find((r) => r.channelId === room.channelId);
    fetched = position ? await rowsAfter(acct.http, room, position.since, slug, cap) : { items: [], complete: true };
  } catch (e) {
    return partial(ctx, room, e);
  }
  const { items, complete } = fetched;
  let taken = 0;
  let cutAt = items.length;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i]!.sender === slug) continue;
    taken += 1;
    if (taken === cap) {
      cutAt = i + 1;
      break;
    }
  }
  const rest = items.slice(cutAt);
  const leftKnown = rest.filter((i) => i.sender !== slug).length;
  const cut = leftKnown > 0 || (!complete && taken === cap);
  const returned = cut ? items.slice(0, cutAt) : items;
  const left = cut || !complete ? Math.max(leftKnown, position!.unread - taken, 1) : 0;
  const since = position?.since ?? 0;
  const shown = returned.flatMap((i) => (i.row ? [{ ...i.row, ...(i.sender !== slug ? { new: true } : {}) }] : []));
  let rows = shown;
  if (shown.length) {
    const events = await fetchSystemRows(acct.http, room).catch(() => ({ rows: [] as Row[] }));
    const from = shown[0]!.sentAt;
    const until = cut ? shown.at(-1)!.sentAt : Infinity;
    const notes = events.rows.filter((r) => !r.id.startsWith("event:") && r.sentAt >= from && r.sentAt <= until).map((r) => (r.sender !== slug ? { ...r, new: true } : r));
    rows = mergeByTime(shown, notes);
  }
  let earlier: Row[] = [];
  if (opts.limit !== undefined && taken < cap) {
    const fill = cap - taken;
    const history = await storedUntil(acct, room, (stored) => stored.filter((r) => r.seq <= since).length >= fill, Infinity, []).catch(() => []);
    earlier = pageRows(history, { before: since + 1, limit: fill });
    rows = [...earlier, ...rows];
  }
  rows = await withReactions(acct, room, rows);
  const header = left ? unreadHeader(room.spaceId, taken, left, returned[0]!.seq, returned[returned.length - 1]!.seq) : undefined;
  const listed = [...earlier, ...shown];
  const hint = !taken && opts.limit === undefined
    ? `no unread messages in ${room.name}; to see earlier messages, run ${readCall(room.spaceId, { limit: "<N>" })}`
    : listed.length
      ? pageHint(room.spaceId, listed, await storedRows(room.channelId), (await loadMeta(room.channelId)).complete, false)
      : undefined;
  const batch = await finish(ctx, room, rows, { header, hint });
  ackRows(acct.http, shown, slug);
  const to = lastWithId(returned);
  if (to) {
    await markReadUpTo(room.channelId, to.seq, to.id).catch((e: unknown) => {
      throw new ReadFailed(`could not save the read position for "${room.name}": ${errorText(e)}; nothing was marked read`, batch, e);
    });
  }
  return batch;
}
