import type { PuffoHttpClient } from "../src/http/client";
import { loadState, updateState } from "./home";
import { awaitCoreReadState } from "../src/application/runtime/core-read-state-port";

export interface RoomUnread {
  spaceId: string;
  channelId: string;
  readSeq: number | null;
  since: number;
  unread: number;
  reactions: number;
}

export interface MembershipChange {
  slug: string;
  change: "joined" | "left";
  seq: number;
  cursorId: string;
}

export interface HistoryItem {
  seq: number;
  envelope: unknown;
}

interface UnreadWire {
  rooms?: { space_id: string; channel_id: string; read_seq?: number | null; since?: number; unread?: number; reactions?: number }[];
}

interface ChangesWire {
  changes?: { slug: string; change: string; seq: number; cursor_id: string }[];
}

interface AfterWire {
  messages?: { seq: number; envelope: unknown }[];
  has_more?: boolean;
  next_after?: number | null;
}

const channelPath = (channelId: string) => encodeURIComponent(channelId);

export async function fetchUnread(http: PuffoHttpClient): Promise<RoomUnread[]> {
  const res = await http.get<UnreadWire>("/v2/messages/unread");
  return (res.rooms ?? []).map((r) => ({
    spaceId: r.space_id,
    channelId: r.channel_id,
    readSeq: r.read_seq ?? null,
    since: r.since ?? r.read_seq ?? 0,
    unread: r.unread ?? 0,
    reactions: r.reactions ?? 0,
  }));
}

export const MEMBERSHIP_PAGE = 500;
const MEMBERSHIP_PAGES = 20;

/**
 * Joins and leaves after `after`, paged until a page is not full or passes `until`.
 * `upTo` is the last seq the pages cover when it stopped on the page limit; else Infinity.
 */
export async function fetchMembershipChanges(
  http: PuffoHttpClient,
  channelId: string,
  after: number,
  until = Infinity,
): Promise<{ changes: MembershipChange[]; upTo: number }> {
  const changes: MembershipChange[] = [];
  let cursor = after;
  for (let page = 0; page < MEMBERSHIP_PAGES; page += 1) {
    const res = await http.get<ChangesWire>(`/v2/channels/${channelPath(channelId)}/membership-changes?after=${cursor}&limit=${MEMBERSHIP_PAGE}`);
    const raw = (res.changes ?? []).filter((c) => c.seq > cursor);
    for (const c of raw) {
      if (c.change === "joined" || c.change === "left") changes.push({ slug: c.slug, change: c.change, seq: c.seq, cursorId: c.cursor_id });
    }
    if (raw.length < MEMBERSHIP_PAGE) return { changes, upTo: Infinity };
    cursor = Math.max(...raw.map((c) => c.seq));
    if (cursor >= until) return { changes, upTo: Infinity };
  }
  return { changes, upTo: cursor };
}

export async function fetchAfter(
  http: PuffoHttpClient,
  channelId: string,
  after: number,
  limit: number,
): Promise<{ items: HistoryItem[]; hasMore: boolean; next: number }> {
  const res = await http.get<AfterWire>(`/v2/messages/history/channel/${channelPath(channelId)}?after_seq=${after}&reactions=true&limit=${limit}`);
  const items = (res.messages ?? []).filter((m) => m.seq > after).sort((a, b) => a.seq - b.seq);
  const last = items.at(-1)?.seq ?? after;
  return { items, hasMore: Boolean(res.has_more) && items.length > 0, next: Math.max(res.next_after ?? last, last) };
}

const HISTORY_PAGE = 100;

/**
 * How far back, in seqs, the history is read for the message that an older CLI's read position points at. A seq
 * range can hold no message of the room (an unsent message, other rooms' seqs), so each try reads a wider range.
 */
const LOCAL_POSITION_SPANS = [100, 10_000, Infinity];

/** The newest message at or before `seq` and after `after`, from the room's history, or null. */
async function messageAtOrBefore(http: PuffoHttpClient, channelId: string, after: number, seq: number): Promise<{ seq: number; envelopeId: string } | null> {
  for (const span of LOCAL_POSITION_SPANS) {
    let cursor = Math.max(after, seq - span);
    let found: { seq: number; envelopeId: string } | null = null;
    for (;;) {
      const page = await fetchAfter(http, channelId, cursor, HISTORY_PAGE);
      for (const item of page.items) {
        if (item.seq > seq) break;
        const id = (item.envelope as { envelope_id?: unknown } | null)?.envelope_id;
        if (typeof id === "string" && id) found = { seq: item.seq, envelopeId: id };
      }
      const last = page.items.at(-1)?.seq ?? seq;
      if (!page.hasMore || last >= seq) break;
      cursor = page.next;
    }
    if (found || seq - span <= after) return found;
  }
  return null;
}

/**
 * The server's unread counts for every room. An older CLI kept read positions locally (0.10.2 and before), and the
 * server never had them. Each local position that is ahead of the server's first moves the server's read position
 * there. The positions that moved, or have nothing to move, are dropped; a room that failed keeps its position for
 * the next command.
 */
export async function serverRooms(http: PuffoHttpClient, slug: string): Promise<RoomUnread[]> {
  const state = loadState(slug);
  if (!state.cursors && !state.baselines) return fetchUnread(http);
  const rooms = await fetchUnread(http);
  let moved = false;
  const failed: Record<string, number> = {};
  for (const [channelId, seq] of Object.entries(state.cursors ?? {})) {
    const room = rooms.find((r) => r.channelId === channelId);
    if (!room || (room.readSeq ?? 0) >= seq) continue;
    try {
      const target = await messageAtOrBefore(http, channelId, room.readSeq ?? 0, seq);
      if (!target) continue;
      await markReadUpTo(channelId, target.seq, target.envelopeId);
      moved = true;
    } catch {
      failed[channelId] = seq;
    }
  }
  updateState(slug, (s) => {
    delete s.baselines;
    if (Object.keys(failed).length > 0) s.cursors = failed;
    else delete s.cursors;
  });
  return moved ? fetchUnread(http) : rooms;
}

/** Core moves the room's read cursor to the message the command showed last and pushes it to the server. */
export async function markReadUpTo(channelId: string, seq: number, envelopeId: string): Promise<void> {
  const readState = await awaitCoreReadState();
  if (!readState) throw new Error("the core runtime is not running");
  await readState.markRead("channel", channelId, seq, envelopeId);
}
