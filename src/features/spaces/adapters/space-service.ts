import type { PuffoHttpClient } from "../../../http/client";
import type { CryptoOps } from "../../../http/types";
import {
  generateEventNonce,
  generateEventUuid,
  signSpaceEvent,
  type SignedSpaceEvent,
  type SpaceEventSigner,
} from "../../../event/signed-space-event";
import { submitSpacesMembershipEvents } from "../../../application/runtime/spaces-membership-command-port";
import type { CreatedChannel, CreatedSpace } from "../domain";

export type SignedEvent = SignedSpaceEvent;
const generateNonce = generateEventNonce;

// Keep this construction aligned with core-v2 build_signed_event; the server
// resolves signer_subkey_id through certificate sync before verification.
export function signEvent(
  crypto: CryptoOps,
  kind: string,
  payload: Record<string, unknown>,
  signerSlug: string,
  signerDeviceId: string,
  signerSubkeyId: string,
  signingKey: Uint8Array,
  http?: PuffoHttpClient,
): SignedEvent {
  return signSpaceEvent(
    crypto,
    {
      slug: signerSlug,
      deviceId: signerDeviceId,
      subkeyId: signerSubkeyId,
      subkeySecretKey: signingKey,
    },
    kind,
    payload,
    http,
  );
}

export type SignerSession = SpaceEventSigner;

export async function createSpace(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  name: string,
): Promise<CreatedSpace> {
  const spaceId = `sp_${generateEventUuid(crypto)}`;
  const joinedAt = Date.now();
  const payload = {
    space_id: spaceId,
    name,
    created_at: joinedAt,
    nonce: generateEventNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "create_space",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  const resp = await submitSpacesMembershipEvents(http, spaceId, [event]);

  const generalEvent = resp.server_emitted_events?.find(
    (e) => e.kind === "create_channel",
  );
  const defaultChannel = generalEvent
    ? {
        channelId: generalEvent.payload.channel_id as string,
        name: generalEvent.payload.name as string,
        isPublic: generalEvent.payload.is_public === true,
      }
    : undefined;

  return { spaceId, name, joinedAt, defaultChannel };
}

export async function createChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  name: string,
  isEncrypted = true,
): Promise<CreatedChannel> {
  const channelId = `ch_${generateEventUuid(crypto)}`;
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    name,
    created_at: Date.now(),
    nonce: generateEventNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "create_channel",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event], { isEncrypted });
  return { channelId, spaceId, name, isEncrypted };
}

export async function inviteToSpace(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  inviteeSlug: string,
): Promise<string> {
  // invitee_role is intentionally omitted to match the server's optional field.
  const payload = {
    space_id: spaceId,
    invitee_slug: inviteeSlug,
    issued_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "invite_to_space",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
  // Follow-up notifications reference the invite event without another read.
  return event.event_id;
}

export async function inviteToChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
  inviteeSlug: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    invitee_slug: inviteeSlug,
    issued_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "invite_to_channel",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

// The server applies batches in order, so the space invite must come first;
// a duplicate pending space invite is a no-op and does not block channel invite.
export async function inviteToSpaceAndChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
  inviteeSlug: string,
): Promise<void> {
  const issuedAt = Date.now();
  const spaceEvent = signEvent(
    crypto,
    "invite_to_space",
    {
      space_id: spaceId,
      invitee_slug: inviteeSlug,
      issued_at: issuedAt,
      nonce: generateNonce(crypto),
    },
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  const channelEvent = signEvent(
    crypto,
    "invite_to_channel",
    {
      space_id: spaceId,
      channel_id: channelId,
      invitee_slug: inviteeSlug,
      issued_at: issuedAt,
      nonce: generateNonce(crypto),
    },
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [spaceEvent, channelEvent]);
}

export async function acceptSpaceInvite(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  invitationEventId: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    invitation_event_id: invitationEventId,
    accepted_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "accept_space_invite",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function rejectSpaceInvite(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  invitationEventId: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    invitation_event_id: invitationEventId,
    rejected_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "reject_space_invite",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function cancelSpaceInvite(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  invitationEventId: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    invitation_event_id: invitationEventId,
    cancelled_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "cancel_space_invite",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function acceptChannelInvite(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
  invitationEventId: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    invitation_event_id: invitationEventId,
    accepted_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "accept_channel_invite",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function rejectChannelInvite(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
  invitationEventId: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    invitation_event_id: invitationEventId,
    rejected_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "reject_channel_invite",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function cancelChannelInvite(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
  invitationEventId: string,
): Promise<void> {
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    invitation_event_id: invitationEventId,
    cancelled_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "cancel_channel_invite",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function removeFromSpace(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  removedSlug: string,
): Promise<void> {
  // Owners cannot be kicked; self-removal must use leaveSpace instead.
  const payload = {
    space_id: spaceId,
    removed_slug: removedSlug,
    effective_from: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "remove_from_space",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function leaveSpace(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
): Promise<void> {
  // The current owner must transfer ownership before leaving.
  const payload = {
    space_id: spaceId,
    effective_from: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "leave_space",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function removeFromChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
  removedSlug: string,
): Promise<void> {
  // Public topics reject channel-level removal; remove from the space instead.
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    removed_slug: removedSlug,
    effective_from: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "remove_from_channel",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function leaveChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  channelId: string,
): Promise<void> {
  // Public topics inherit space membership and cannot be left independently.
  const payload = {
    space_id: spaceId,
    channel_id: channelId,
    effective_from: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "leave_channel",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function updateMemberRole(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  targetSlug: string,
  newRole: "admin" | "member",
): Promise<void> {
  // Only the owner may change roles; ownership changes use the transfer event.
  const payload = {
    space_id: spaceId,
    target_slug: targetSlug,
    new_role: newRole,
    issued_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "update_role",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}

export async function transferSpaceOwnership(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: SignerSession,
  spaceId: string,
  newOwnerSlug: string,
): Promise<void> {
  // The server demotes the old owner and adds the new owner to every topic.
  const payload = {
    space_id: spaceId,
    new_owner_slug: newOwnerSlug,
    issued_at: Date.now(),
    nonce: generateNonce(crypto),
  };
  const event = signEvent(
    crypto,
    "transfer_space_ownership",
    payload,
    signer.slug,
    signer.deviceId,
    signer.subkeyId,
    signer.subkeySecretKey,
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
}
