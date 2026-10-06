import type { PuffoHttpClient } from "../../../http/client";
import type { CryptoOps } from "../../../http/types";
import {
  generateEventNonce,
  generateEventUuid,
  signSpaceEvent,
} from "../../../event/signed-space-event";
import type { InvitationSignerSession } from "../domain/signer";
import {
  CREATE_INVITE_CAPABILITY_KIND,
  REDEEM_INVITE_CAPABILITY_KIND,
  REVOKE_INVITE_CAPABILITY_KIND,
  type CapabilityMutationResponse,
  type CreateInviteCapabilityPayload,
  type InvitationLinkList,
  type InvitationLinkListItem,
  type InvitationLinkPreview,
  type InvitationShowcaseMessages,
  type InviteCapabilityScope,
  type RedeemInviteCapabilityPayload,
  type RevokeInviteCapabilityPayload,
} from "../domain/capability";
import { generateInviteCapabilityKey } from "./capability-crypto";

const LINKS_PATH = "/v2/invitations/links";
export type InviteLinkOwnerGuard = () => void;

function linkPath(shortCode: string, suffix = ""): string {
  return `${LINKS_PATH}/${encodeURIComponent(shortCode)}${suffix}`;
}

export interface CreateInviteLinkParams {
  spaceId: string;
  scope: InviteCapabilityScope;
  maxUses: number | null;
  expiresAt: number;
}

export interface CreatedInviteLink {
  linkId: string;
  inviteId: string;
  shortCode: string;
  eventId: string;
}

export async function createInviteLink(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  params: CreateInviteLinkParams,
  assertActive?: InviteLinkOwnerGuard,
): Promise<CreatedInviteLink> {
  const material = await generateInviteCapabilityKey(crypto);
  const inviteId = `inv_${generateEventUuid(crypto)}`;
  const payload: CreateInviteCapabilityPayload = {
    invite_id: inviteId,
    space_id: params.spaceId,
    scope: params.scope,
    max_uses: params.maxUses,
    expires_at: params.expiresAt,
    // VESTIGIAL(PUF-358): required server column.
    invite_public_key: material.publicKeyBase64url,
    created_at: Date.now(),
    nonce: generateEventNonce(crypto),
  };
  const event = signSpaceEvent(
    crypto,
    signer,
    CREATE_INVITE_CAPABILITY_KIND,
    payload as unknown as Record<string, unknown>,
    http,
  );
  assertActive?.();
  const response = await http.post<CapabilityMutationResponse>(LINKS_PATH, {
    event,
  });
  assertActive?.();
  if (!response.short_code) {
    throw new Error("invite link create response is missing short_code");
  }
  return {
    linkId: response.link_id,
    inviteId,
    shortCode: response.short_code,
    eventId: event.event_id,
  };
}

export async function lookupInviteLink(
  http: PuffoHttpClient,
  shortCode: string,
): Promise<InvitationLinkPreview> {
  return http.getUnsigned<InvitationLinkPreview>(linkPath(shortCode));
}

export async function loadInviteShowcaseMessages(
  http: PuffoHttpClient,
  shortCode: string,
  channelId: string,
): Promise<InvitationShowcaseMessages> {
  return http.getUnsigned<InvitationShowcaseMessages>(
    `${linkPath(shortCode)}/channels/${encodeURIComponent(channelId)}/messages`,
  );
}

export interface RedeemInviteLinkParams {
  shortCode: string;
  inviteId: string;
  spaceId: string;
}

export async function redeemInviteLink(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  params: RedeemInviteLinkParams,
  assertActive?: InviteLinkOwnerGuard,
): Promise<CapabilityMutationResponse> {
  const payload: RedeemInviteCapabilityPayload = {
    redemption_id: `red_${generateEventUuid(crypto)}`,
    invite_id: params.inviteId,
    space_id: params.spaceId,
    redeemer_slug: signer.slug,
    redeemer_device_id: signer.deviceId,
    redeemer_subkey_id: signer.subkeyId,
    redeemed_at: Date.now(),
    nonce: generateEventNonce(crypto),
  };
  const event = signSpaceEvent(
    crypto,
    signer,
    REDEEM_INVITE_CAPABILITY_KIND,
    payload as unknown as Record<string, unknown>,
    http,
  );
  assertActive?.();
  const response = await http.post<CapabilityMutationResponse>(
    linkPath(params.shortCode, "/redeem"),
    { event },
  );
  assertActive?.();
  return response;
}

export async function revokeInviteLink(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  signer: InvitationSignerSession,
  params: { shortCode: string; inviteId: string; spaceId: string },
  assertActive?: InviteLinkOwnerGuard,
): Promise<CapabilityMutationResponse> {
  const payload: RevokeInviteCapabilityPayload = {
    invite_id: params.inviteId,
    space_id: params.spaceId,
    revoked_at: Date.now(),
    nonce: generateEventNonce(crypto),
  };
  const event = signSpaceEvent(
    crypto,
    signer,
    REVOKE_INVITE_CAPABILITY_KIND,
    payload as unknown as Record<string, unknown>,
    http,
  );
  assertActive?.();
  const response = await http.post<CapabilityMutationResponse>(
    linkPath(params.shortCode, "/revoke"),
    { event },
  );
  assertActive?.();
  return response;
}

export async function listInviteLinks(
  http: PuffoHttpClient,
  spaceId: string,
  assertActive?: InviteLinkOwnerGuard,
): Promise<InvitationLinkListItem[]> {
  const links: InvitationLinkListItem[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ space_id: spaceId });
    if (cursor) params.set("after", cursor);
    assertActive?.();
    const result = await http.get<InvitationLinkList>(
      `${LINKS_PATH}?${params.toString()}`,
    );
    assertActive?.();
    links.push(...result.links);
    cursor = result.next_cursor;
  } while (cursor);
  return links;
}

export function buildInviteLinkUrl(origin: string, shortCode: string): string {
  return `${origin}/i/${encodeURIComponent(shortCode)}`;
}
