import { PRESENCE_HEARTBEAT_MS } from "../src/huddo/presence";
import { safeLine } from "../src/huddo/projection";
import { Deadline, DeadlineReached, NetworkError } from "./deadline";
import { loadState } from "./home";
import { subscribeCoreEvents } from "../src/platform/web/core-runtime/core-events";
import { deviceRejection } from "./device-check";
import { markListening, markStopped } from "./listener";
import { account, errorText, offline, resolveRoomArg, sortedSpaces, UserError, type Ctx } from "./ops";
import { reportPresence } from "./presence";
import { fetchUnread, serverRooms, type RoomUnread } from "./read-state";

/** Core pushes these the moment the relay delivers; the poll is only a backstop. */
const WAKE_EVENTS = new Set(["message_committed", "message_display_changed", "read_state_changed", "sync_completed"]);
export const WAIT_POLL_MS = 30_000;
const MIN_CHECK_MS = 250;

/** Resolves on the next core event that can change an unread count, or after `ms`. */
function nextActivity(dl: Deadline, ms: number): Promise<void> {
  let wake!: () => void;
  const event = new Promise<void>((resolve) => (wake = resolve));
  const stop = subscribeCoreEvents((events) => {
    if (events.some((e) => WAKE_EVENTS.has(e.type))) wake();
  });
  return Promise.race([event, dl.sleep(ms)]).finally(() => stop());
}

export interface WaitRoom {
  room: string;
  spaceId: string;
  unread: number;
  reactions: number;
  watched: boolean;
}

export interface WaitResult {
  rooms: WaitRoom[];
  woke: boolean;
}

export interface WaitOptions {
  deadline: number;
  room?: string;
  ignoreReactions?: boolean;
  signal?: AbortSignal;
}

async function watchedRooms(ctx: Ctx, arg: string | undefined): Promise<Set<string> | null> {
  if (arg === undefined) return null;
  const items = arg.split(",").map((s) => s.trim()).filter(Boolean);
  if (!items.length) throw new UserError("--room needs a room id or list index");
  const acct = account(ctx);
  const rooms = await Promise.all(items.map((item) => resolveRoomArg(acct, item).catch(offline)));
  return new Set(rooms.map((r) => r.spaceId));
}

export function waitRooms(rooms: RoomUnread[], names: Map<string, string>, watched: Set<string> | null): WaitRoom[] {
  return rooms
    .filter((r) => r.unread > 0)
    .map((r) => ({
      room: names.get(r.spaceId) ?? r.spaceId,
      spaceId: r.spaceId,
      unread: r.unread,
      reactions: r.reactions,
      watched: !watched || watched.has(r.spaceId),
    }));
}

export function wakes(rooms: WaitRoom[], ignoreReactions = false): boolean {
  return rooms.some((r) => r.watched && (ignoreReactions ? r.unread - r.reactions : r.unread) > 0);
}

export function formatWaitRoom(r: WaitRoom): string {
  const notes = [...(r.reactions ? [`${r.reactions} ${r.reactions === 1 ? "reaction" : "reactions"}`] : []), ...(r.watched ? [] : ["not in --room"])];
  const label = r.room === r.spaceId ? r.spaceId : `${safeLine(r.room)} ${r.spaceId}`;
  return `[${label}] ${r.unread} unread${notes.length ? ` (${notes.join("; ")})` : ""}`;
}

/**
 * Blocks until a watched room has unread messages, by the server's read positions. It never returns message content.
 * It moves a read position only once after an upgrade, to the one an older CLI kept locally (`serverRooms`).
 */
export async function wait(ctx: Ctx, opts: WaitOptions): Promise<WaitResult> {
  const acct = account(ctx);
  const slug = acct.identity.slug;
  markListening(slug, opts.room);
  const dl = new Deadline(opts.deadline, opts.signal);
  const heartbeat = setInterval(() => void reportPresence(acct), PRESENCE_HEARTBEAT_MS);
  void dl.soft(reportPresence(acct), undefined);
  try {
    const watched = await watchedRooms(ctx, opts.room);
    const names = new Map<string, string>();
    const learned = new Set<string>();
    for (const r of Object.values(loadState(slug).rooms ?? {})) names.set(r.spaceId, r.name);
    const learnNames = async (rooms: RoomUnread[]) => {
      if (rooms.every((r) => r.unread === 0 || learned.has(r.spaceId))) return;
      for (const s of await dl.soft(sortedSpaces(acct), [])) {
        names.set(s.id, s.name);
        learned.add(s.id);
      }
    };
    let last: WaitRoom[] = [];
    let everOk = false;
    let uploaded = false;
    let lastError: unknown = null;
    let checkedAt = 0;
    // When the last good check was, and why the checks since it failed: "no new messages" needs a check that worked.
    let okAt = 0;
    let failedSince: string | null = null;
    for (;;) {
      checkedAt = Date.now();
      const activity = nextActivity(dl, WAIT_POLL_MS);
      try {
        const rooms = await dl.race(uploaded ? fetchUnread(acct.http) : serverRooms(acct.http, slug));
        uploaded = true;
        everOk = true;
        okAt = Date.now();
        failedSince = null;
        lastError = null;
        await learnNames(rooms);
        last = waitRooms(rooms, names, watched);
        if (wakes(last, opts.ignoreReactions)) return { rooms: last, woke: true };
      } catch (e) {
        if (e instanceof DeadlineReached) break;
        if (deviceRejection(e)) throw e;
        lastError = e;
        failedSince = errorText(e);
      }
      await activity;
      await dl.sleep(MIN_CHECK_MS - (Date.now() - checkedAt));
      if (dl.expired()) break;
    }
    if (!everOk) throw new NetworkError(`cannot reach the Huddo server${lastError ? `: ${errorText(lastError)}` : " before the deadline"}`);
    if (failedSince !== null) {
      throw new NetworkError(
        `no new messages at the last good check (${new Date(okAt).toISOString()}), but the checks after it failed: ${failedSince}`,
        { cause: lastError ?? undefined },
      );
    }
    return { rooms: last, woke: false };
  } finally {
    clearInterval(heartbeat);
    markStopped(slug);
  }
}
