import type { Row } from "./rows";

export function skippedHint(
  spaceId: string,
  shown: Row[],
  stored: Row[],
  seenBefore: number,
  self: string,
  complete: boolean,
): string | undefined {
  const first = shown[0];
  if (!first || !seenBefore || first.seq <= seenBefore + 1) return undefined;
  const skipped = stored.filter((r) => r.seq > seenBefore && r.seq < first.seq && r.sender !== self && !r.system).length;
  const known = complete || stored.some((r) => r.seq <= seenBefore);
  if (!skipped && known) return undefined;
  const count = known ? `${skipped} earlier unread ${skipped === 1 ? "message" : "messages"}` : "earlier unread messages";
  return `${count} not shown; they are now marked seen. Read them with: huddo read --room ${spaceId} --before ${first.seq}`;
}

export function pageHint(spaceId: string, shown: Row[], stored: Row[], complete: boolean): string {
  const first = shown[0];
  const last = shown[shown.length - 1];
  if (!first || !last) return "no messages in that range";
  const older = stored.some((r) => r.seq < first.seq) || !complete;
  const newer = stored.some((r) => r.seq > last.seq);
  return [
    older ? `older: huddo read --room ${spaceId} --before ${first.seq}` : "this is the start of the room",
    ...(newer ? [`newer: huddo read --room ${spaceId} --after ${last.seq}`] : []),
  ].join("; ");
}
