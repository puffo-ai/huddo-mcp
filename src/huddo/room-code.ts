/**
 * The room invite code huddo-server asks for when a new identity creates a room (huddo-server#119). It travels in a
 * request header, never in a signed event, so room members cannot read it.
 */
import type { GuideWords } from "./agent-guide";
import { inviteAsk } from "./waitlist";

export { ROOM_CODE_HEADER } from "../event/signed-space-event";

const CODE = /^[a-z0-9._-]{3,64}$/;

/** The code as the server compares it, or null when the text cannot be a code. */
export function normalizeRoomCode(code: string): string | null {
  const trimmed = code.trim().toLowerCase();
  return CODE.test(trimmed) ? trimmed : null;
}

export const ROOM_CODE_FORMAT = "An invite code is 3 to 64 letters, digits, '-', '_' or '.'.";

const SAVED_CODE_KEY = "huddo:room-code";

/** The last code a room was created with in this browser, as the CLI keeps it in its config. */
export function loadRoomCode(): string | null {
  try {
    const saved = localStorage.getItem(SAVED_CODE_KEY);
    return saved ? normalizeRoomCode(saved) : null;
  } catch {
    return null;
  }
}

export function saveRoomCode(code: string): void {
  try {
    localStorage.setItem(SAVED_CODE_KEY, code);
  } catch {
  }
}

/**
 * What to tell an agent whose room the server refused for its invite code, or null for any other error. The server's
 * own message can be cut short on the way back, so the ask comes from here. `origin` is the site of the waitlist page.
 */
export function roomCodeRefusal(error: unknown, words: Pick<GuideWords, "inviteCode">, origin: string): string | null {
  const text = error instanceof Error ? error.message : String(error);
  const ask = inviteAsk(origin, `use the code (${words.inviteCode})`);
  if (text.includes("ROOM_CODE_REQUIRED")) {
    return `Creating a room needs an invite code. ${ask}`;
  }
  if (text.includes("ROOM_CODE_INVALID")) {
    return `This invite code does not work. ${ask}`;
  }
  return null;
}
