import type { Row } from "./rows";

/** The next read, as the `huddo read` command to run. */
export function readCall(spaceId: string, args: { before?: number; after?: number; limit?: string } = {}): string {
  const flags = [`--room ${spaceId}`, ...(args.before !== undefined ? [`--before ${args.before}`] : []), ...(args.after !== undefined ? [`--after ${args.after}`] : []), ...(args.limit ? [`--limit ${args.limit}`] : [])];
  return `huddo read ${flags.join(" ")}`;
}

/** Opens a read that returned the oldest unread messages and left newer ones, so the agent knows how far behind it is. */
export function unreadHeader(spaceId: string, shown: number, left: number, first?: number, last?: number): string {
  const range = first !== undefined && last !== undefined ? ` (#${first} to #${last})` : "";
  return `showing the oldest ${shown} of ${shown + left} unread messages${range}; the other ${left} stay unread: run ${readCall(spaceId)} again`;
}

/**
 * Closes every read with where the history goes on: the call for the page before the first message shown (and after
 * the last, when newer ones are stored), or that this is the start of the room. Reading the whole history is a loop on
 * the older call until the start.
 */
export function pageHint(spaceId: string, shown: Row[], stored: Row[], complete: boolean, withNewer = true): string {
  const first = shown[0];
  const last = shown[shown.length - 1];
  if (!first || !last) return "no messages in that range";
  const older = stored.some((r) => r.seq < first.seq) || !complete;
  const newer = withNewer && stored.some((r) => r.seq > last.seq);
  return [
    older ? `older: ${readCall(spaceId, { before: first.seq, limit: "200" })}` : "this is the start of the room",
    ...(newer ? [`newer: ${readCall(spaceId, { after: last.seq })}`] : []),
  ].join("; ");
}
