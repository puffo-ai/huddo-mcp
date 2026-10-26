export interface InvitationSignerSession {
  slug: string;
  deviceId: string;
  subkeyId: string;
  subkeySecretKey: Uint8Array;
}

export interface SignedInviteEvent {
  type: "signed_event";
  version: 1;
  event_id: string;
  kind: string;
  payload: Record<string, unknown>;
  signer_slug: string;
  signer_device_id: string;
  signer_subkey_id: string;
  signature: string;
}

export interface CoreEventSigner {
  slug: string;
  deviceId: string;
  subkeyId: string;
  sign(kind: string, payload: Record<string, unknown>): Promise<SignedInviteEvent>;
}

export type InviteSigner = InvitationSignerSession | CoreEventSigner;
