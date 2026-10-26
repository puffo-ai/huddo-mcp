import type { Channel, Space } from "../../features/spaces/domain";
import {
  OwnedProjectionStore,
  type ProjectionOwner,
  type ProjectionToken,
} from "./owned-projection-store";

export interface SpaceDomainProjection {
  spaces: Space[];
  spacesLoaded: boolean;
  channels: Channel[];
  channelsHydrated: boolean;
  dmPeers: string[];
  membersVersion: number;
}

function emptySpaceDomainProjection(): SpaceDomainProjection {
  return {
    spaces: [],
    spacesLoaded: false,
    channels: [],
    channelsHydrated: false,
    dmPeers: [],
    membersVersion: 0,
  };
}

export const spaceDomainProjection = new OwnedProjectionStore<SpaceDomainProjection>(
  emptySpaceDomainProjection,
);

export function bindSpaceDomainProjectionOwner(owner: ProjectionOwner): ProjectionToken {
  return spaceDomainProjection.lease(owner);
}

export function updateSpaceDomainProjection(
  token: ProjectionToken,
  project: (current: SpaceDomainProjection) => SpaceDomainProjection,
): boolean {
  return spaceDomainProjection.update(token, project);
}

export function clearSpaceDomainProjection(): void {
  spaceDomainProjection.clear();
}

export function resetSpaceDomainProjectionForTests(): void {
  spaceDomainProjection.clear();
}
