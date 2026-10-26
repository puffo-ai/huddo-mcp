import {
  OwnedProjectionStore,
  type ProjectionOwner,
  type ProjectionToken,
} from "./owned-projection-store";

export interface ChannelRosterProjectionEntry {
  members: ChannelRosterMember[];
  version: number;
  spaceId: string;
}

export interface ChannelRosterMember {
  slug: string;
  display_name?: string;
  identity_type?: string;
}

export interface SpaceRosterMember {
  slug: string;
  role?: string;
  identity_type?: string;
}

export interface RosterProjectionEntry<T> {
  members: T[];
  version: number;
}

export interface MembershipRosterProjection {
  scopeKey: string | null;
  channelRosters: Record<string, ChannelRosterProjectionEntry>;
  spaceRosters: Record<string, RosterProjectionEntry<SpaceRosterMember>>;
}

export function membershipRosterOwnerScope(owner: ProjectionOwner): string {
  return `${owner.serverUrl.replace(/\/$/, "")}|${owner.slug}`;
}

function emptyMembershipRosterProjection(): MembershipRosterProjection {
  return { scopeKey: null, channelRosters: {}, spaceRosters: {} };
}

export const membershipRosterProjection =
  new OwnedProjectionStore<MembershipRosterProjection>(emptyMembershipRosterProjection);

export function bindMembershipRosterProjectionOwner(owner: ProjectionOwner): ProjectionToken {
  const token = membershipRosterProjection.lease(owner);
  membershipRosterProjection.update(token, (value) => ({
    ...value,
    scopeKey: membershipRosterOwnerScope(owner),
  }));
  return token;
}

export function updateMembershipRosterProjection(
  token: ProjectionToken,
  project: (current: MembershipRosterProjection) => MembershipRosterProjection,
): boolean {
  return membershipRosterProjection.update(token, project);
}

export function clearMembershipRosterProjection(): void {
  membershipRosterProjection.clear();
}
