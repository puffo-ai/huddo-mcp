import type { PuffoHttpClient } from "../../../http/client";
import type { CryptoOps } from "../../../http/types";
import {
  generateEventNonce,
  signSpaceEvent,
} from "../../../event/signed-space-event";
import { submitSpacesMembershipEvents } from "../../../application/runtime/spaces-membership-command-port";
import type { InvitationSignerSession } from "../domain/signer";

function invitePayload(
  crypto: CryptoOps,
  spaceId: string,
  inviteeSlug: string,
  channelId?: string,
) {
  return {
    space_id: spaceId,
    ...(channelId ? { channel_id: channelId } : {}),
    invitee_slug: inviteeSlug,
    issued_at: Date.now(),
    nonce: generateEventNonce(crypto),
  };
}

export async function inviteToSpace(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  spaceId: string,
  inviteeSlug: string,
): Promise<string> {
  const event = signSpaceEvent(
    crypto,
    signer,
    "invite_to_space",
    invitePayload(crypto, spaceId, inviteeSlug),
    http,
  );
  await submitSpacesMembershipEvents(http, spaceId, [event]);
  return event.event_id;
}

export async function inviteToChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  spaceId: string,
  channelId: string,
  inviteeSlug: string,
): Promise<void> {
  await submitSpacesMembershipEvents(http, spaceId, [
    signSpaceEvent(
      crypto,
      signer,
      "invite_to_channel",
      invitePayload(crypto, spaceId, inviteeSlug, channelId),
      http,
    ),
  ]);
}

export async function inviteToSpaceAndChannel(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  spaceId: string,
  channelId: string,
  inviteeSlug: string,
): Promise<void> {
  const issuedAt = Date.now();
  await submitSpacesMembershipEvents(http, spaceId, [
    signSpaceEvent(
      crypto,
      signer,
      "invite_to_space",
      {
        ...invitePayload(crypto, spaceId, inviteeSlug),
        issued_at: issuedAt,
      },
      http,
    ),
    signSpaceEvent(
      crypto,
      signer,
      "invite_to_channel",
      {
        ...invitePayload(crypto, spaceId, inviteeSlug, channelId),
        issued_at: issuedAt,
      },
      http,
    ),
  ]);
}

async function respond(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  action: "accept" | "reject" | "cancel",
  scope: "space" | "channel",
  spaceId: string,
  invitationEventId: string,
  channelId?: string,
): Promise<void> {
  const timestampKey =
    action === "accept"
      ? "accepted_at"
      : action === "reject"
        ? "rejected_at"
        : "cancelled_at";
  await submitSpacesMembershipEvents(http, spaceId, [
    signSpaceEvent(
      crypto,
      signer,
      `${action}_${scope}_invite`,
      {
        space_id: spaceId,
        ...(channelId ? { channel_id: channelId } : {}),
        invitation_event_id: invitationEventId,
        [timestampKey]: Date.now(),
        nonce: generateEventNonce(crypto),
      },
      http,
    ),
  ]);
}

export const acceptSpaceInvite = (
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  spaceId: string,
  invitationEventId: string,
) =>
  respond(http, crypto, signer, "accept", "space", spaceId, invitationEventId);

export const rejectSpaceInvite = (
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  spaceId: string,
  invitationEventId: string,
) =>
  respond(http, crypto, signer, "reject", "space", spaceId, invitationEventId);

export const cancelSpaceInvite = (
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  spaceId: string,
  invitationEventId: string,
) =>
  respond(http, crypto, signer, "cancel", "space", spaceId, invitationEventId);

type ChannelResponseArgs = [
  PuffoHttpClient,
  CryptoOps,
  InvitationSignerSession,
  string,
  string,
  string,
];

export const acceptChannelInvite = (...args: ChannelResponseArgs) =>
  respond(
    args[0],
    args[1],
    args[2],
    "accept",
    "channel",
    args[3],
    args[5],
    args[4],
  );
export const rejectChannelInvite = (...args: ChannelResponseArgs) =>
  respond(
    args[0],
    args[1],
    args[2],
    "reject",
    "channel",
    args[3],
    args[5],
    args[4],
  );
export const cancelChannelInvite = (...args: ChannelResponseArgs) =>
  respond(
    args[0],
    args[1],
    args[2],
    "cancel",
    "channel",
    args[3],
    args[5],
    args[4],
  );
