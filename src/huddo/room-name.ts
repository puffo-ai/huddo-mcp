/**
 * The room-name rules huddo-server enforces, checked before a request so people get a plain sentence, not a refusal.
 * The server checks a new room and a rename differently, and these mirror both as they are: a new room's name is
 * trimmed and counted in characters (Unicode code points), and a rename counts the UTF-8 bytes of the name as sent.
 */
export const ROOM_NAME_MIN_CHARS = 6;
export const ROOM_NAME_MAX_CHARS = 100;
export const ROOM_RENAME_MAX_BYTES = 80;

export const ROOM_NAME_TOO_SHORT = `A room name needs at least ${ROOM_NAME_MIN_CHARS} characters.`;
export const ROOM_NAME_TOO_LONG = `A room name can have at most ${ROOM_NAME_MAX_CHARS} characters.`;
// A byte count is nothing a person can act on: a Chinese character takes 3 of the 80.
export const ROOM_RENAME_TOO_LONG = "That name is too long. Try a shorter one.";
export const ROOM_NAME_EMPTY = "A room name can't be empty.";

/** The limits in words, for help text: a Chinese character takes 3 bytes. */
export const NEW_ROOM_NAME_LIMIT = `${ROOM_NAME_MIN_CHARS} to ${ROOM_NAME_MAX_CHARS} characters`;
export const ROOM_RENAME_LIMIT = `at most ${ROOM_RENAME_MAX_BYTES} bytes: ${ROOM_RENAME_MAX_BYTES} English letters, ${Math.floor(ROOM_RENAME_MAX_BYTES / 3)} Chinese characters`;

const chars = (name: string) => [...name].length;

/** Why the server would refuse `name` for a new room, or null. */
export function newRoomNameError(name: string): string | null {
  const count = chars(name.trim());
  if (count < ROOM_NAME_MIN_CHARS) return ROOM_NAME_TOO_SHORT;
  return count > ROOM_NAME_MAX_CHARS ? ROOM_NAME_TOO_LONG : null;
}

/** Why the server would refuse `name` as a room's new name, or null. */
export function roomRenameError(name: string): string | null {
  if (!name.trim()) return ROOM_NAME_EMPTY;
  return new TextEncoder().encode(name).length > ROOM_RENAME_MAX_BYTES ? ROOM_RENAME_TOO_LONG : null;
}
