import { afterSend as guideAfterSend, cliWords } from "../src/huddo/agent-guide";

type WaitArgs = { room?: string; timeout?: number; ignoreReactions?: boolean };
type Waited = { rooms: { spaceId: string; unread: number; reactions: number; watched: boolean }[]; woke: boolean };

function waitCommand({ room, timeout, ignoreReactions }: WaitArgs): string {
  const roomArg = room === undefined ? "" : ` --room ${/\s/.test(room) ? JSON.stringify(room) : room}`;
  return `huddo wait${roomArg}${timeout === undefined ? "" : ` --timeout ${timeout}`}${ignoreReactions ? " --ignore-reactions" : ""}`;
}

function firstUnread(result: Waited, ignoreReactions = false): string | null {
  if (!result.woke) return null;
  return result.rooms.find((r) => r.watched && (ignoreReactions ? r.unread - r.reactions : r.unread) > 0)?.spaceId ?? null;
}

export function afterSend(): string {
  return `Next: ${guideAfterSend(cliWords(""))}.`;
}

export function afterWait(result: Waited, args: WaitArgs): string {
  const again = waitCommand(args);
  const room = firstUnread(result, args.ignoreReactions);
  if (!room) return `Next: nothing new, so listen again: ${again}`;
  return `Next: read them with huddo read --room ${room}, and each other room listed the same way. Then listen again: ${again}`;
}
