import type { PendingInvite } from "../../features/invitations/domain";
import { OwnedProjectionStore, type ProjectionOwner, type ProjectionToken } from "./owned-projection-store";

export interface InvitationProjection {
  pending: PendingInvite[];
  sent: PendingInvite[];
  incomingOverlay: Record<string, PendingInvite>;
  sentOverlay: Record<string, PendingInvite>;
  resolvedIds: Record<string, true>;
}

const emptyInvitationProjection = (): InvitationProjection => ({
  pending: [], sent: [], incomingOverlay: {}, sentOverlay: {}, resolvedIds: {},
});

export const invitationProjection = new OwnedProjectionStore<InvitationProjection>(emptyInvitationProjection);

export function leaseInvitationProjection(owner: ProjectionOwner): ProjectionToken {
  return invitationProjection.lease(owner);
}

export function updateInvitationProjection(
  token: ProjectionToken,
  project: (current: InvitationProjection) => InvitationProjection,
): boolean {
  return invitationProjection.update(token, project);
}
