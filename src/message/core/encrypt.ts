import type { CryptoOps } from "../../http/types";
import type {
  EncryptMessageInput,
  MessageEnvelope,
  MessagePayload,
  PlaintextMessageEnvelope,
  RecipientEntry,
  SignedMessagePayload,
} from "./types";
import {
  MESSAGE_HPKE_INFO,
  computeOuterAad,
  computeWrapAad,
  type OuterAadInput,
} from "./v2-aad";

function generateUUID(crypto: CryptoOps): string {
  const bytes = crypto.generateRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface EncryptMessageResult {
  envelope: MessageEnvelope;
  contentKey: Uint8Array;
}

export function wrapAdditionalRecipients(
  crypto: CryptoOps,
  envelopeId: string,
  contentKey: Uint8Array,
  recipients: { device_id: string; kem_public_key: Uint8Array }[],
): RecipientEntry[] {
  return recipients.map((device) => {
    const wrapAad = computeWrapAad(envelopeId, device.device_id);
    const hpkeOut = crypto.hpkeSeal(
      device.kem_public_key,
      MESSAGE_HPKE_INFO,
      wrapAad,
      contentKey,
    );
    return {
      device_id: device.device_id,
      hpke_enc: crypto.base64urlEncode(hpkeOut.enc),
      wrapped_content_key: crypto.base64urlEncode(hpkeOut.ciphertext),
    };
  });
}

function buildSignedPayload(
  crypto: CryptoOps,
  signingKey: Uint8Array,
  input: EncryptMessageInput,
): { envelopeId: string; nowMs: number; signed: SignedMessagePayload } {
  const envelopeId = `msg_${generateUUID(crypto)}`;
  const messageNonce = crypto.base64urlEncode(crypto.generateRandomBytes(16));
  const nowMs = Date.now();

  const payload: MessagePayload = {
    type: "message_payload",
    version: 1,
    envelope_kind: input.envelope_kind,
    sender_slug: input.sender_slug,
    sender_subkey_id: input.sender_subkey_id,
    sent_at: nowMs,
    message_nonce: messageNonce,
    content_type: input.content_type,
    content: input.content,
    is_visible_to_human: true,
    space_id: input.space_id ?? null,
    channel_id: input.channel_id ?? null,
    recipient_slug: input.recipient_slug ?? null,
    thread_root_id: input.thread_root_id ?? null,
    reply_to_id: input.reply_to_id ?? null,
  };

  const canonical = crypto.canonicalizeForSigning(JSON.stringify(payload));
  const sig = crypto.ed25519Sign(signingKey, canonical);
  const signature = crypto.base64urlEncode(sig);

  return { envelopeId, nowMs, signed: { payload, signature } };
}

export function buildPlaintextMessage(
  crypto: CryptoOps,
  signingKey: Uint8Array,
  input: EncryptMessageInput,
): PlaintextMessageEnvelope {
  const { envelopeId, signed } = buildSignedPayload(crypto, signingKey, input);
  return {
    type: "plaintext_message_envelope",
    version: 1,
    envelope_id: envelopeId,
    signed_payload: signed,
  };
}

export function encryptMessage(
  crypto: CryptoOps,
  signingKey: Uint8Array,
  input: EncryptMessageInput
): EncryptMessageResult {
  if (input.recipients.length === 0) {
    throw new Error("No recipients");
  }

  const { envelopeId, nowMs, signed } = buildSignedPayload(
    crypto,
    signingKey,
    input,
  );

  const plaintext = new TextEncoder().encode(JSON.stringify(signed));

  const contentKey = crypto.generateRandomBytes(32);
  const nonce = crypto.generateRandomBytes(12);

  let outerAadInput: OuterAadInput;
  if (input.envelope_kind === "channel") {
    if (!input.space_id || !input.channel_id) {
      throw new Error("channel envelopes require space_id and channel_id");
    }
    outerAadInput = {
      kind: "channel",
      envelope_id: envelopeId,
      sender_slug: input.sender_slug,
      sent_at_ms: nowMs,
      space_id: input.space_id,
      channel_id: input.channel_id,
    };
  } else {
    if (!input.recipient_slug) {
      throw new Error("dm envelopes require recipient_slug");
    }
    outerAadInput = {
      kind: "dm",
      envelope_id: envelopeId,
      sender_slug: input.sender_slug,
      sent_at_ms: nowMs,
      recipient_slug: input.recipient_slug,
    };
  }
  const outerAad = computeOuterAad(outerAadInput);

  const ciphertext = crypto.aeadSeal(contentKey, nonce, plaintext, outerAad);

  const recipients = wrapAdditionalRecipients(
    crypto,
    envelopeId,
    contentKey,
    input.recipients,
  );

  const envelope: MessageEnvelope = {
    type: "message_envelope",
    version: 1,
    envelope_id: envelopeId,
    envelope_kind: input.envelope_kind,
    sender_slug: input.sender_slug,
    sent_at: nowMs,
    content_nonce: crypto.base64urlEncode(nonce),
    content_ciphertext: crypto.base64urlEncode(ciphertext),
    recipients,
  };

  if (input.space_id !== undefined) envelope.space_id = input.space_id;
  if (input.channel_id !== undefined) envelope.channel_id = input.channel_id;
  if (input.recipient_slug !== undefined) envelope.recipient_slug = input.recipient_slug;

  return { envelope, contentKey };
}
