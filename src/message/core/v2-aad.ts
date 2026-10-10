export const MESSAGE_HPKE_INFO = new TextEncoder().encode(
  "puffo/msg-hpke/v1",
);

const MESSAGE_OUTER_AAD_LABEL = new TextEncoder().encode(
  "puffo/message-envelope-outer/v1",
);
const MESSAGE_WRAP_AAD_LABEL = new TextEncoder().encode(
  "puffo/message-envelope-wrap/v1",
);

const ENVELOPE_KIND_CHANNEL = 0x01;
const ENVELOPE_KIND_DM = 0x02;

const TEXT_ENCODER = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function utf8(value: string): Uint8Array {
  if (value.length === 0) {
    throw new Error("non_empty_utf8: value is empty");
  }
  return TEXT_ENCODER.encode(value);
}

function lenPrefixedUtf8(value: string): Uint8Array {
  const bytes = utf8(value);
  if (bytes.length > 0xffff) {
    throw new Error("len_prefixed_utf8: value too long");
  }
  const lenBuf = new Uint8Array(2);
  new DataView(lenBuf.buffer).setUint16(0, bytes.length, false );
  return concat([lenBuf, bytes]);
}

function i64BeFromU64(value: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigInt64(0, BigInt(value), false );
  return buf;
}

export interface OuterAadChannel {
  kind: "channel";
  envelope_id: string;
  sender_slug: string;
  sent_at_ms: number;
  space_id: string;
  channel_id: string;
}

export interface OuterAadDm {
  kind: "dm";
  envelope_id: string;
  sender_slug: string;
  sent_at_ms: number;
  recipient_slug: string;
}

export type OuterAadInput = OuterAadChannel | OuterAadDm;

export function computeOuterAad(input: OuterAadInput): Uint8Array {
  const head = [
    MESSAGE_OUTER_AAD_LABEL,
    utf8(input.envelope_id),
    new Uint8Array([
      input.kind === "channel" ? ENVELOPE_KIND_CHANNEL : ENVELOPE_KIND_DM,
    ]),
    lenPrefixedUtf8(input.sender_slug),
    i64BeFromU64(input.sent_at_ms),
  ];
  if (input.kind === "channel") {
    return concat([
      ...head,
      utf8(input.space_id),
      utf8(input.channel_id),
    ]);
  }
  return concat([...head, lenPrefixedUtf8(input.recipient_slug)]);
}

export function computeWrapAad(envelopeId: string, deviceId: string): Uint8Array {
  return concat([
    MESSAGE_WRAP_AAD_LABEL,
    utf8(envelopeId),
    utf8(deviceId),
  ]);
}
