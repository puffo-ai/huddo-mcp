import type { PuffoHttpClient } from "../http/client";
import type { CryptoOps } from "../http/types";
import { transportSigningPort } from "../application/runtime/transport-signing-port";

export interface SignedSpaceEvent {
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

export interface SpaceEventSigner {
  slug: string;
  deviceId: string;
  subkeyId: string;
  subkeySecretKey: Uint8Array;
}

export interface PostSpaceEventsResponse {
  ok?: boolean;
  applied?: number;
  server_emitted_events?: SignedSpaceEvent[];
}

export function generateEventUuid(crypto: CryptoOps): string {
  const bytes = crypto.generateRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function generateEventNonce(crypto: CryptoOps): string {
  return crypto.base64urlEncode(crypto.generateRandomBytes(32));
}

export function signSpaceEvent(
  crypto: CryptoOps,
  signer: SpaceEventSigner,
  kind: string,
  payload: Record<string, unknown>,
  http?: PuffoHttpClient,
): SignedSpaceEvent {
  const event: SignedSpaceEvent = {
    type: "signed_event",
    version: 1,
    event_id: `ev_${generateEventUuid(crypto)}`,
    kind,
    payload,
    signer_slug: signer.slug,
    signer_device_id: signer.deviceId,
    signer_subkey_id: signer.subkeyId,
    signature: "",
  };
  if (!http || typeof http.signTypedEvent !== "function") {
    if (transportSigningPort().typedEventAuthority === "rust") {
      throw new Error("Typed-event HTTP authority is unavailable");
    }
    return transportSigningPort().signEvent({
      serverUrl: "",
      slug: signer.slug,
      credential: {
        deviceId: signer.deviceId,
        keyId: signer.subkeyId,
        secretKey: signer.subkeySecretKey,
      },
      crypto,
    }, event as unknown as Record<string, unknown>) as unknown as SignedSpaceEvent;
  }
  return http.signTypedEvent(signer, event as unknown as Record<string, unknown>) as unknown as SignedSpaceEvent;
}

export async function postSpaceEvents(
  http: PuffoHttpClient,
  spaceId: string,
  events: SignedSpaceEvent[],
  options?: { isEncrypted?: boolean },
): Promise<PostSpaceEventsResponse> {
  return http.post<PostSpaceEventsResponse>("/spaces/events", {
    space_id: spaceId,
    events: events as unknown as Record<string, unknown>[],
    ...(options?.isEncrypted !== undefined
      ? { is_encrypted: options.isEncrypted }
      : {}),
  } as unknown as Record<string, unknown>);
}
