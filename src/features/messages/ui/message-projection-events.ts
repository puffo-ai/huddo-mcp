import { useSyncExternalStore } from "react";
import {
  messageProjection,
  resetMessageProjectionForTests,
} from "../../../application/projections/message-projection";
import type { ProjectionOwner } from "../../../application/projections/owned-projection-store";

export {
  bindMessageProjectionOwner,
  releaseMessageProjectionOwner,
  publishCatchUpProjectionChanged,
  publishLiveProjectionChanged,
} from "../../../application/projections/message-projection";

export function useMessageProjectionRevision(owner: ProjectionOwner | null): number {
  const snapshot = useSyncExternalStore(
    messageProjection.subscribe,
    messageProjection.getSnapshot,
    messageProjection.getSnapshot,
  );
  return owner
    && snapshot.owner?.serverUrl === owner.serverUrl
    && snapshot.owner.slug === owner.slug
    && snapshot.owner.generation === owner.generation
    ? snapshot.version
    : 0;
}

export const resetMessageProjectionEventsForTests = resetMessageProjectionForTests;
