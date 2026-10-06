import type { PuffoHttpClient } from "../http/client";
import { HttpError, type CryptoOps } from "../http/types";
import type { StoredIdentity } from "../identity/primitives/keystore";
import {
  buildPlaintextMessage,
  encryptMessage,
  wrapAdditionalRecipients,
} from "./core/encrypt";
import {
  isPlaintextEnvelope,
  type EncryptMessageInput,
  type EnvelopeKind,
  type MessageEnvelope,
  type PlaintextMessageEnvelope,
} from "./core/types";
import { fetchRecipientDevices } from "./recipients";

export interface SendMessageParams {
  http: PuffoHttpClient;
  crypto: CryptoOps;
  identity: StoredIdentity;
  subkeyId: string;
  // Signs with the rotating subkey; verifier resolves pk via /certs/sync.
  subkeySecretKey: Uint8Array;
  envelopeKind: EnvelopeKind;
  spaceId?: string;
  channelId?: string;
  recipientSlug?: string;
  contentType: string;
  content: unknown;
  recipients: { device_id: string; kem_public_key: Uint8Array }[];
  // Slugs that produced `recipients` — supplementation refetches them.
  // Absent → supplementation degrades to warn-only.
  recipientSlugs?: string[];
  threadRootId?: string;
  replyToId?: string;
  channelIsEncrypted?: boolean | null;
  refreshChannelPolicy?: (channelId: string) => Promise<void> | void;
  resolveRecipientsForEncryption?: () => Promise<{
    recipients: { device_id: string; kem_public_key: Uint8Array }[];
    recipientSlugs: string[];
  }>;
}

interface SendMessageServerResponse {
  ok: boolean;
  envelope_id: string;
  seq?: number;
  devices_queued: number;
  missing_devices?: string[];
}

export function formatMismatch(error: unknown): boolean | null {
  if (!(error instanceof HttpError) || error.status !== 400) return null;
  const body = (error.body || "").toLowerCase();
  if (body.includes("is plaintext; send via")) return false;
  if (body.includes("is encrypted; send a sealed envelope")) return true;
  return null;
}

export interface BuiltEnvelope {
  envelope: MessageEnvelope | PlaintextMessageEnvelope;
  contentKey?: Uint8Array;
}

export type MessageSupplementParams = Pick<
  SendMessageParams,
  "http" | "crypto" | "recipientSlugs"
>;

export type MessageEnvelopeSupplement =
  | { params: MessageSupplementParams; contentKey: Uint8Array }
  | {
      onMissingDevices(deviceIds: string[]): Promise<void>;
      onComplete?(): void;
    };

/** Build the wire envelope without posting it. */
export function buildMessageEnvelope(
  params: SendMessageParams,
  encrypt: boolean = params.channelIsEncrypted !== false,
): BuiltEnvelope {
  const input: EncryptMessageInput = {
    envelope_kind: params.envelopeKind,
    sender_slug: params.identity.slug,
    sender_subkey_id: params.subkeyId,
    space_id: params.spaceId,
    channel_id: params.channelId,
    recipient_slug: params.recipientSlug,
    content_type: params.contentType,
    content: params.content,
    recipients: params.recipients,
    thread_root_id: params.threadRootId,
    reply_to_id: params.replyToId,
  };
  if (!encrypt) {
    return {
      envelope: buildPlaintextMessage(
        params.crypto,
        params.subkeySecretKey,
        input,
      ),
    };
  }
  return encryptMessage(params.crypto, params.subkeySecretKey, input);
}

/** Post a pre-built envelope; original sends may supplement missing devices. */
export async function postMessageEnvelope(
  http: PuffoHttpClient,
  envelope: MessageEnvelope,
  supplement?: MessageEnvelopeSupplement,
): Promise<MessageEnvelope>;
export async function postMessageEnvelope(
  http: PuffoHttpClient,
  envelope: MessageEnvelope | PlaintextMessageEnvelope,
  supplement?: MessageEnvelopeSupplement,
): Promise<MessageEnvelope | PlaintextMessageEnvelope>;
export async function postMessageEnvelope(
  http: PuffoHttpClient,
  envelope: MessageEnvelope | PlaintextMessageEnvelope,
  supplement?: MessageEnvelopeSupplement,
): Promise<MessageEnvelope | PlaintextMessageEnvelope> {
  if (isPlaintextEnvelope(envelope)) {
    const response = await http.post<SendMessageServerResponse>(
      "/v2/messages/plaintext",
      envelope as unknown as Record<string, unknown>,
    );
    return typeof response.seq === "number"
      ? { ...envelope, seq: response.seq }
      : envelope;
  }

  const response = await http.post<SendMessageServerResponse>(
    "/messages",
    envelope as unknown as Record<string, unknown>,
  );

  // The original send is already durable, but authority-backed supplementation
  // owns a short-lived Wasm handle. Await that callback so its caller cannot
  // finish the handle before missing-device wrapping completes.
  if (
    supplement &&
    response.missing_devices &&
    response.missing_devices.length > 0
  ) {
    if ("onMissingDevices" in supplement) {
      await supplement.onMissingDevices(response.missing_devices);
    } else {
      void supplementMissingDevices(
        supplement.params,
        envelope,
        supplement.contentKey,
        response.missing_devices,
      );
    }
  } else if (supplement && "onMissingDevices" in supplement) {
    supplement.onComplete?.();
  }

  return typeof response.seq === "number"
    ? { ...envelope, seq: response.seq }
    : envelope;
}

export async function sendMessage(
  params: SendMessageParams,
  onBuilt?: (envelope: MessageEnvelope | PlaintextMessageEnvelope) => void,
): Promise<MessageEnvelope | PlaintextMessageEnvelope> {
  let encrypt = params.channelIsEncrypted !== false;
  let effectiveParams = params;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { envelope, contentKey } = buildMessageEnvelope(effectiveParams, encrypt);
    onBuilt?.(envelope);
    try {
      return await postMessageEnvelope(
        effectiveParams.http,
        envelope,
        contentKey ? { params: effectiveParams, contentKey } : undefined,
      );
    } catch (error) {
      const wanted = formatMismatch(error);
      if (wanted === null || wanted === encrypt || attempt === 1) throw error;
      // Both server endpoints reject a format mismatch before inserting the
      // envelope. Rebuilding with a new envelope_id is safe only while that
      // server-side ordering remains true.
      if (wanted && effectiveParams.recipients.length === 0) {
        if (!params.resolveRecipientsForEncryption) throw error;
        const resolved = await params.resolveRecipientsForEncryption();
        if (resolved.recipients.length === 0) {
          throw new Error("No recipient devices available");
        }
        effectiveParams = {
          ...effectiveParams,
          recipients: resolved.recipients,
          recipientSlugs: resolved.recipientSlugs,
        };
      }
      encrypt = wanted;
      if (params.channelId && params.refreshChannelPolicy) {
        try {
          await params.refreshChannelPolicy(params.channelId);
        } catch {
          // The current send recovered; refreshing only warms the next one.
        }
      }
    }
  }
  throw new Error("unreachable: send retry loop exhausted");
}

function warnSupplement(envelopeId: string, msg: string, err?: unknown): void {
  const prefix = `[send] envelope ${envelopeId}: `;
  if (err !== undefined) console.warn(prefix + msg, err);
  else console.warn(prefix + msg);
}

async function supplementMissingDevices(
  params: MessageSupplementParams,
  originalEnvelope: MessageEnvelope,
  contentKey: Uint8Array,
  missingDeviceIds: string[],
): Promise<void> {
  const envelopeId = originalEnvelope.envelope_id;

  if (!params.recipientSlugs || params.recipientSlugs.length === 0) {
    warnSupplement(
      envelopeId,
      `server reported ${missingDeviceIds.length} missing device(s) but caller did not provide recipientSlugs; skipping supplementation.`,
    );
    return;
  }

  let fresh;
  try {
    fresh = await fetchRecipientDevices(params.http, params.crypto, params.recipientSlugs);
  } catch (e) {
    warnSupplement(envelopeId, `/certs/active refetch failed during supplementation:`, e);
    return;
  }

  const missingSet = new Set(missingDeviceIds);
  const supplementaryRecipients = fresh.filter((r) => missingSet.has(r.device_id));

  if (supplementaryRecipients.length === 0) {
    warnSupplement(
      envelopeId,
      `server reported ${missingDeviceIds.length} missing device(s) but /certs/active does not list any of them; skipping supplementation.`,
    );
    return;
  }

  // envelope_id + nonce + ciphertext stay byte-identical — server
  // rejects same-id retries that mutate the context fields.
  const supplementation: MessageEnvelope = {
    ...originalEnvelope,
    recipients: wrapAdditionalRecipients(
      params.crypto,
      envelopeId,
      contentKey,
      supplementaryRecipients,
    ),
  };

  try {
    await params.http.post<SendMessageServerResponse>(
      "/messages",
      supplementation as unknown as Record<string, unknown>,
    );
  } catch (e) {
    warnSupplement(
      envelopeId,
      `supplementation POST failed; ${missingDeviceIds.length} device(s) remain unreached for this envelope:`,
      e,
    );
  }
}
