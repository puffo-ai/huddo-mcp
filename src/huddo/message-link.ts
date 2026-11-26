import { chatPath } from "./config";
import { validId } from "./message-id";
import { readStored, removeStored, writeStored } from "./stored";

export const MESSAGE_PARAM = "m";
export const NOTIFICATION_MESSAGE_PARAM = "msg_id";
const TARGETS_KEY = "huddo.message-targets";
const TARGET_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_REMEMBERED_ROOMS = 20;

export interface MessageTarget {
  roomId: string;
  msgId: string;
}

export { validId };

export function messageLink(origin: string, roomId: string, msgId: string): string {
  return `${origin}${chatPath(roomId)}?${MESSAGE_PARAM}=${encodeURIComponent(msgId)}`;
}

function targetId(search: string): string | null {
  const params = new URLSearchParams(search);
  const msgId = params.get(MESSAGE_PARAM) ?? params.get(NOTIFICATION_MESSAGE_PARAM);
  return validId(msgId) ? msgId : null;
}

export function targetFromSearch(roomId: string, search: string): MessageTarget | null {
  const msgId = targetId(search);
  return validId(roomId) && msgId ? { roomId, msgId } : null;
}

/** The query aimed at `msgId` as `m`, or at no message, with its other parameters kept. */
export function withTarget(search: string, msgId: string | null): string {
  const params = new URLSearchParams(search);
  params.delete(NOTIFICATION_MESSAGE_PARAM);
  if (validId(msgId)) params.set(MESSAGE_PARAM, msgId);
  else params.delete(MESSAGE_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** `href` without its message target, for a link that stands for the whole room. */
export function linkWithoutTarget(href: string): string {
  const url = new URL(href);
  url.search = withTarget(url.search, null);
  return url.toString();
}

/** `path` with the target of `search`, so each redirect on the way into a room keeps the link. */
export function carryTarget(path: string, search: string): string {
  return `${path}${withTarget("", targetId(search))}`;
}

type Remembered = Record<string, { msgId: string; at: number }>;

/** The remembered targets that are still valid and fresh, newest first. */
function readTargets(now: number): Remembered {
  const parsed = readStored<unknown>(TARGETS_KEY, { parse: (raw) => JSON.parse(raw ?? "{}"), fallback: {} });
  if (!parsed || typeof parsed !== "object") return {};
  const fresh = Object.entries(parsed as Record<string, { msgId?: unknown; at?: unknown }>).filter(
    ([roomId, t]) =>
      validId(roomId) && validId(t?.msgId) && typeof t.at === "number" && now - t.at >= 0 && now - t.at <= TARGET_MAX_AGE_MS,
  ) as [string, { msgId: string; at: number }][];
  return Object.fromEntries(fresh.sort(([, a], [, b]) => b.at - a.at).map(([roomId, t]) => [roomId, { msgId: t.msgId, at: t.at }]));
}

function writeTargets(targets: Remembered): void {
  if (Object.keys(targets).length) writeStored(TARGETS_KEY, JSON.stringify(targets));
  else removeStored(TARGETS_KEY);
}

/** Keeps a target for its room, so entering that room later in any tab still opens the message. */
export function rememberTarget(target: MessageTarget, now = Date.now()): void {
  if (!validId(target.roomId) || !validId(target.msgId)) return;
  const others = Object.entries(readTargets(now)).filter(([roomId]) => roomId !== target.roomId);
  writeTargets(Object.fromEntries([[target.roomId, { msgId: target.msgId, at: now }], ...others].slice(0, MAX_REMEMBERED_ROOMS)));
}

/** Whether the room has a remembered target, without taking it. */
export function hasTarget(roomId: string, now = Date.now()): boolean {
  return roomId in readTargets(now);
}

/** The room's remembered target, read once. */
export function takeTarget(roomId: string, now = Date.now()): string | null {
  const targets = readTargets(now);
  const saved = targets[roomId];
  delete targets[roomId];
  writeTargets(targets);
  return saved?.msgId ?? null;
}

export function forgetTargets(): void {
  removeStored(TARGETS_KEY);
}
