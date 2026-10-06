import type { SignedSpaceEvent } from "../../../event/signed-space-event";
import type { PlaintextMessageEnvelope } from "../../../message/core/types";

export const CREATE_INVITE_CAPABILITY_KIND = "create_invite_capability";
export const REDEEM_INVITE_CAPABILITY_KIND = "redeem_invite_capability";
export const REVOKE_INVITE_CAPABILITY_KIND = "revoke_invite_capability";

export const INVITE_LINK_TTL_DAYS = 30;
export const INVITE_LINK_TTL_MS = INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000;

// "Never expires" sentinel: expires_at is required (NOT NULL, > created_at), so
// "never" is a fixed far-future value, not null; matched by exact equality (not a
// threshold) so a long-lived link isn't misread as never. 9999-12-31T23:59:59Z ms.
export const INVITE_LINK_NEVER_EXPIRES_AT = 253_402_300_799_000;

// The one place the "expires in N days" vs "never" choice becomes a concrete expires_at.
// Extracted so each create surface (the chat host and the manage-groups settings pane) resolves
// it identically and it can be unit-tested without standing up either surface.
export function inviteLinkExpiresAt(neverExpires: boolean, now: number = Date.now()): number {
  return neverExpires ? INVITE_LINK_NEVER_EXPIRES_AT : now + INVITE_LINK_TTL_MS;
}

export type InviteCapabilitySpaceRole = "member";
export type InviteCapabilityChannelRole = "member";

export interface InviteCapabilitySpaceGrant {
  role: InviteCapabilitySpaceRole;
}

export interface InviteCapabilityChannelGrant {
  channel_id: string;
  role: InviteCapabilityChannelRole;
}

export interface InviteCapabilityScope {
  space_grant: InviteCapabilitySpaceGrant | null;
  channel_grants: InviteCapabilityChannelGrant[];
}

export interface CreateInviteCapabilityPayload {
  invite_id: string;
  space_id: string;
  scope: InviteCapabilityScope;
  max_uses: number | null;
  expires_at: number;
  invite_public_key: string;
  created_at: number;
  nonce: string;
}

export interface RedeemInviteCapabilityPayload {
  redemption_id: string;
  invite_id: string;
  space_id: string;
  redeemer_slug: string;
  redeemer_device_id: string;
  redeemer_subkey_id: string;
  redeemed_at: number;
  nonce: string;
}

export interface RevokeInviteCapabilityPayload {
  invite_id: string;
  space_id: string;
  revoked_at: number;
  nonce: string;
}

export interface CapabilityMutationResponse {
  link_id: string;
  invite_id: string;
  event_id: string;
  applied: boolean;
  short_code?: string;
}

export interface InvitationLinkPreview {
  link_id: string;
  invite_id: string;
  space_id: string;
  space_name: string;
  space_avatar_url?: string | null;
  space_archived?: boolean;
  issuer_slug: string;
  issuer_display_name?: string | null;
  scope: InviteCapabilityScope;
  channel_names?: Record<string, string>;
  showcase_channels?: InvitationShowcaseChannel[];
  member_count?: number | null;
  agent_count?: number | null;
  member_avatar_count?: number | null;
  max_uses: number | null;
  uses: number;
  expires_at: number;
  create_event: SignedSpaceEvent;
  server_seq: number;
  server_received_at: number;
}

export interface InvitationShowcaseChannel {
  channel_id: string;
  name: string;
}

export interface InvitationShowcaseMessage {
  seq: number;
  envelope: PlaintextMessageEnvelope;
}

export interface InvitationShowcaseMessages {
  messages: InvitationShowcaseMessage[];
}

export interface InvitationLinkListItem {
  link_id: string;
  short_code: string;
  invite_id: string;
  space_id: string;
  issuer_slug: string;
  scope: InviteCapabilityScope;
  max_uses: number | null;
  uses: number;
  expires_at: number;
  created_at: number;
  state: string;
}

export interface InvitationLinkList {
  links: InvitationLinkListItem[];
  next_cursor?: string;
}

export interface InviteCapabilityMaterial {
  publicKeyBase64url: string;
}
