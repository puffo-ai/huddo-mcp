import { chatPath } from "./config";

export const MESSAGE_PARAM = "m";
export const NOTIFICATION_MESSAGE_PARAM = "msg_id";
const TARGET_KEY = "huddo.message-target";
const TARGET_MAX_AGE_MS = 30 * 60_000;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface MessageTarget {
  roomId: string;
  msgId: string;
}

export const validId = (value: unknown): value is string => typeof value === "string" && ID_RE.test(value);

export function messageLink(origin: string, roomId: string, msgId: string): string {
  return `${origin}${chatPath(roomId)}?${MESSAGE_PARAM}=${encodeURIComponent(msgId)}`;
}

export function targetFromSearch(roomId: string, search: string): MessageTarget | null {
  const params = new URLSearchParams(search);
  const msgId = params.get(MESSAGE_PARAM) ?? params.get(NOTIFICATION_MESSAGE_PARAM);
  return validId(roomId) && validId(msgId) ? { roomId, msgId } : null;
}

export function withoutTarget(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(MESSAGE_PARAM);
  params.delete(NOTIFICATION_MESSAGE_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export function rememberTarget(target: MessageTarget, now = Date.now()): void {
  try {
    sessionStorage.setItem(TARGET_KEY, JSON.stringify({ roomId: target.roomId, msgId: target.msgId, at: now }));
  } catch {}
}

export function takeTarget(roomId: string, now = Date.now()): string | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(TARGET_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let saved: { roomId?: unknown; msgId?: unknown; at?: unknown };
  try {
    saved = JSON.parse(raw);
  } catch {
    saved = {};
  }
  const fresh = typeof saved.at === "number" && now - saved.at >= 0 && now - saved.at <= TARGET_MAX_AGE_MS;
  const valid = fresh && saved.roomId === roomId && validId(saved.roomId) && validId(saved.msgId);
  try {
    sessionStorage.removeItem(TARGET_KEY);
  } catch {}
  return valid ? (saved.msgId as string) : null;
}
