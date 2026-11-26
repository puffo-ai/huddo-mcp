import type { CatchUpSnapshot } from "../sync/types";
import {
  OwnedProjectionStore,
  type ProjectionOwner,
  type ProjectionToken,
} from "./owned-projection-store";

export type MessageProjectionChangeReason = "startup" | "reconnect" | "manual" | "live";

export interface MessageProjectionChanged {
  operationId: string | null;
  reason: MessageProjectionChangeReason;
  changedCount: number;
}

export const messageProjection = new OwnedProjectionStore<MessageProjectionChanged | null>(
  () => null,
);

export function bindMessageProjectionOwner(owner: ProjectionOwner): ProjectionToken {
  return messageProjection.lease(owner);
}

export function releaseMessageProjectionOwner(token: ProjectionToken): boolean {
  return messageProjection.release(token);
}

export function publishCatchUpProjectionChanged(
  token: ProjectionToken,
  snapshot: CatchUpSnapshot,
): boolean {
  const durablyTerminal = snapshot.phase === "ready"
    || (snapshot.phase === "error"
      && (snapshot.error?.code === "ack_failed"
        || snapshot.error?.code === "cursor_hydration_failed"));
  if (!durablyTerminal || snapshot.reason === null || snapshot.processed <= snapshot.failed) {
    return false;
  }
  const changedCount = snapshot.processed - snapshot.failed;
  const previous = messageProjection.getSnapshot().value;
  if (previous?.operationId === snapshot.operationId && previous.changedCount === changedCount) {
    return false;
  }
  return messageProjection.update(token, () => ({
    operationId: snapshot.operationId,
    reason: snapshot.reason!,
    changedCount,
  }));
}

export function publishLiveProjectionChanged(
  token: ProjectionToken,
  envelopeId: string,
): boolean {
  const previous = messageProjection.getSnapshot().value;
  if (previous?.reason === "live" && previous.operationId === envelopeId) return false;
  return messageProjection.update(token, () => ({
    operationId: envelopeId,
    reason: "live",
    changedCount: 1,
  }));
}

export function publishCoreProjectionChanged(): boolean {
  return messageProjection.touchBound({ operationId: null, reason: "live", changedCount: 1 });
}

export function resetMessageProjectionForTests(): void {
  messageProjection.clear();
}
