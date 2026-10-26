import { resolveInvitation } from "../application";
import {
  acceptChannelInvite as acceptChannelInviteTransport,
  acceptSpaceInvite as acceptSpaceInviteTransport,
  cancelChannelInvite as cancelChannelInviteTransport,
  cancelSpaceInvite as cancelSpaceInviteTransport,
  inviteToChannel as inviteToChannelTransport,
  inviteToSpace as inviteToSpaceTransport,
  inviteToSpaceAndChannel as inviteToSpaceAndChannelTransport,
  rejectChannelInvite as rejectChannelInviteTransport,
  rejectSpaceInvite as rejectSpaceInviteTransport,
  buildInviteLinkUrl,
  createInviteLink as createInviteLinkTransport,
  lookupInviteLink as lookupInviteLinkTransport,
  loadInviteShowcaseMessages as loadInviteShowcaseMessagesTransport,
  redeemInviteLink as redeemInviteLinkTransport,
  revokeInviteLink as revokeInviteLinkTransport,
  listInviteLinks as listInviteLinksTransport,
} from "../adapters";
import type { PendingInvite } from "../domain";
import type { ProjectionOwner } from "../../../application/projections/owned-projection-store";
import { invitationProjection } from "../../../application/projections/invitation-projection";
import {
  bindInvitationProjection,
  captureInvitationToken,
  projectInvitation,
  removeInvitation,
  type InvitationOwnerToken,
} from "./invites-store";

export function bindInvitationOwner(owner: ProjectionOwner): InvitationOwnerToken {
  return bindInvitationProjection(owner);
}

export function releaseInvitationOwner(token: InvitationOwnerToken): boolean {
  if (!invitationOwnerIsCurrent(token)) return false;
  return invitationProjection.release(token);
}

export function invitationMutationToken(owner: ProjectionOwner): InvitationOwnerToken | null {
  return captureInvitationToken(owner);
}

export function invitationOwnerIsCurrent(token: InvitationOwnerToken): boolean {
  return invitationProjection.accepts(token);
}

export function projectIncomingInvitation(
  token: InvitationOwnerToken,
  invite: PendingInvite,
): boolean {
  return projectInvitation(token, "incoming", invite);
}

export function projectSentInvitation(
  token: InvitationOwnerToken,
  invite: PendingInvite,
): boolean {
  return projectInvitation(token, "sent", invite);
}

export function commitInvitationRemoval(
  token: InvitationOwnerToken,
  id: string,
): boolean {
  return removeInvitation(token, id);
}

export async function resolveInvitationForOwner(
  token: InvitationOwnerToken,
  id: string,
  request: () => Promise<void>,
): Promise<boolean> {
  let committed = false;
  await resolveInvitation(
    {
      replace: () => {},
      remove: (resolvedId) => {
        committed = commitInvitationRemoval(token, resolvedId);
      },
    },
    request,
    id,
  );
  return committed;
}

export const inviteToSpace = (
  ...args: Parameters<typeof inviteToSpaceTransport>
) => inviteToSpaceTransport(...args);
export const inviteToChannel = (
  ...args: Parameters<typeof inviteToChannelTransport>
) => inviteToChannelTransport(...args);
export const inviteToSpaceAndChannel = (
  ...args: Parameters<typeof inviteToSpaceAndChannelTransport>
) => inviteToSpaceAndChannelTransport(...args);
export const acceptSpaceInvite = (
  ...args: Parameters<typeof acceptSpaceInviteTransport>
) => acceptSpaceInviteTransport(...args);
export const rejectSpaceInvite = (
  ...args: Parameters<typeof rejectSpaceInviteTransport>
) => rejectSpaceInviteTransport(...args);
export const cancelSpaceInvite = (
  ...args: Parameters<typeof cancelSpaceInviteTransport>
) => cancelSpaceInviteTransport(...args);
export const acceptChannelInvite = (
  ...args: Parameters<typeof acceptChannelInviteTransport>
) => acceptChannelInviteTransport(...args);
export const rejectChannelInvite = (
  ...args: Parameters<typeof rejectChannelInviteTransport>
) => rejectChannelInviteTransport(...args);
export const cancelChannelInvite = (
  ...args: Parameters<typeof cancelChannelInviteTransport>
) => cancelChannelInviteTransport(...args);

export { buildInviteLinkUrl };
export const createInviteLink = (
  ...args: Parameters<typeof createInviteLinkTransport>
) => createInviteLinkTransport(...args);
export const lookupInviteLink = (
  ...args: Parameters<typeof lookupInviteLinkTransport>
) => lookupInviteLinkTransport(...args);
export const loadInviteShowcaseMessages = (
  ...args: Parameters<typeof loadInviteShowcaseMessagesTransport>
) => loadInviteShowcaseMessagesTransport(...args);
export const redeemInviteLink = (
  ...args: Parameters<typeof redeemInviteLinkTransport>
) => redeemInviteLinkTransport(...args);
export const revokeInviteLink = (
  ...args: Parameters<typeof revokeInviteLinkTransport>
) => revokeInviteLinkTransport(...args);
export const listInviteLinks = (
  ...args: Parameters<typeof listInviteLinksTransport>
) => listInviteLinksTransport(...args);
