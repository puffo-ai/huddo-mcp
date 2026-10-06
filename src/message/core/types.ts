export type EnvelopeKind = "channel" | "dm";

export interface RecipientDevice {
  device_id: string;
  kem_public_key: Uint8Array;
}

export interface RecipientEntry {
  device_id: string;
  hpke_enc: string;
  wrapped_content_key: string;
}

export interface MessagePayload {
  // Wire key must stay "type" — Rust uses #[serde(rename = "type")]
  // on payload_type. Cross-client decrypt fails otherwise.
  type: string;
  version: number;
  envelope_kind: EnvelopeKind;
  sender_slug: string;
  sender_subkey_id: string;
  // null (not undefined!) for the unused route fields. Server's
  // post-decrypt validator calls ``expect_null`` on the inactive
  // fields per envelope_kind — omitting them returns InvalidInput.
  space_id: string | null;
  channel_id: string | null;
  recipient_slug: string | null;
  sent_at: number;
  message_nonce: string;
  thread_root_id: string | null;
  reply_to_id: string | null;
  content_type: string;
  content: unknown;
  // Absent on pre-0.8 messages — decrypt normalizes that to true.
  is_visible_to_human: boolean;
}

export interface SignedMessagePayload {
  payload: MessagePayload;
  signature: string;
}

export interface MessageEnvelope {
  type: string;
  version: number;
  envelope_id: string;
  // Outside the encrypted payload — used as a read-cursor position.
  seq?: number;
  envelope_kind: EnvelopeKind;
  space_id?: string;
  channel_id?: string;
  recipient_slug?: string;
  sender_slug: string;
  sent_at: number;
  content_nonce: string;
  content_ciphertext: string;
  recipients: RecipientEntry[];
}

// Non-E2EE wire format. All routing lives inside
// signed_payload.payload — there are no outer route fields.
export interface PlaintextMessageEnvelope {
  type: "plaintext_message_envelope";
  version: number;
  envelope_id: string;
  seq?: number;
  signed_payload: SignedMessagePayload;
}

export function isPlaintextEnvelope(
  env: { type?: string },
): env is PlaintextMessageEnvelope {
  return env.type === "plaintext_message_envelope";
}

export function envelopeRoute(
  env: MessageEnvelope | PlaintextMessageEnvelope,
): {
  envelope_kind: EnvelopeKind;
  space_id: string | null;
  channel_id: string | null;
  recipient_slug: string | null;
  sent_at: number;
} {
  if (isPlaintextEnvelope(env)) {
    const payload = env.signed_payload.payload;
    return {
      envelope_kind: payload.envelope_kind,
      space_id: payload.space_id ?? null,
      channel_id: payload.channel_id ?? null,
      recipient_slug: payload.recipient_slug ?? null,
      sent_at: payload.sent_at,
    };
  }
  return {
    envelope_kind: env.envelope_kind,
    space_id: env.space_id ?? null,
    channel_id: env.channel_id ?? null,
    recipient_slug: env.recipient_slug ?? null,
    sent_at: env.sent_at,
  };
}

export interface EncryptMessageInput {
  envelope_kind: EnvelopeKind;
  sender_slug: string;
  sender_subkey_id: string;
  space_id?: string;
  channel_id?: string;
  recipient_slug?: string;
  content_type: string;
  content: unknown;
  thread_root_id?: string;
  reply_to_id?: string;
  recipients: RecipientDevice[];
}
