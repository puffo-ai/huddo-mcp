import type { CryptoOps } from "../http/types";

export const WHISPER_CONTENT_TYPE = "huddo/whisper/v1";

export interface WhisperKey {
  device_id: string;
  enc: string;
  key: string;
}

export interface WhisperContent {
  type: "whisper";
  to: string;
  nonce: string;
  ciphertext: string;
  keys: WhisperKey[];
}

export interface WhisperContext {
  spaceId: string;
  channelId: string;
  sender: string;
  to: string;
}

export interface WhisperDevice {
  device_id: string;
  kem_public_key: Uint8Array;
}

export type DeviceKemOpen = (enc: Uint8Array, info: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array) => Uint8Array;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KEY_INFO = encoder.encode("huddo-whisper-key/v1");

function contentAad(ctx: WhisperContext): Uint8Array {
  return encoder.encode(JSON.stringify(["huddo-whisper/v1", ctx.spaceId, ctx.channelId, ctx.sender, ctx.to]));
}

function keyAad(ctx: WhisperContext, deviceId: string): Uint8Array {
  return encoder.encode(JSON.stringify(["huddo-whisper-key/v1", ctx.spaceId, ctx.channelId, ctx.sender, ctx.to, deviceId]));
}

export function isWhisperContent(content: unknown): content is WhisperContent {
  if (!content || typeof content !== "object") return false;
  const c = content as Record<string, unknown>;
  return c.type === "whisper"
    && typeof c.to === "string"
    && typeof c.nonce === "string"
    && typeof c.ciphertext === "string"
    && Array.isArray(c.keys);
}

export function sealWhisper(
  crypto: CryptoOps,
  ctx: WhisperContext,
  text: string,
  devices: readonly WhisperDevice[],
): WhisperContent {
  if (devices.length === 0) throw new Error("No devices to whisper to");
  const contentKey = crypto.generateRandomBytes(32);
  const nonce = crypto.generateRandomBytes(12);
  const ciphertext = crypto.aeadSeal(contentKey, nonce, encoder.encode(JSON.stringify({ text })), contentAad(ctx));
  const keys = devices.map((d) => {
    const sealed = crypto.hpkeSeal(d.kem_public_key, KEY_INFO, keyAad(ctx, d.device_id), contentKey);
    return { device_id: d.device_id, enc: crypto.base64urlEncode(sealed.enc), key: crypto.base64urlEncode(sealed.ciphertext) };
  });
  contentKey.fill(0);
  return {
    type: "whisper",
    to: ctx.to,
    nonce: crypto.base64urlEncode(nonce),
    ciphertext: crypto.base64urlEncode(ciphertext),
    keys,
  };
}

export function openWhisper(
  crypto: CryptoOps,
  content: WhisperContent,
  ctx: Omit<WhisperContext, "to">,
  deviceId: string,
  openKem: DeviceKemOpen,
): string | null {
  const slot = content.keys.find((k) => k?.device_id === deviceId);
  if (!slot) return null;
  const full = { ...ctx, to: content.to };
  try {
    const contentKey = openKem(
      crypto.base64urlDecode(slot.enc),
      KEY_INFO,
      keyAad(full, deviceId),
      crypto.base64urlDecode(slot.key),
    );
    const plain = crypto.aeadOpen(
      contentKey,
      crypto.base64urlDecode(content.nonce),
      crypto.base64urlDecode(content.ciphertext),
      contentAad(full),
    );
    contentKey.fill(0);
    const parsed = JSON.parse(decoder.decode(plain)) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return null;
  }
}

export function leadingWhisperTarget(
  text: string,
  mentions: readonly { start: number; slug: string }[],
  selfSlug: string | null,
): string | null {
  if (mentions.length !== 1) return null;
  const [only] = mentions;
  if (only.slug === selfSlug) return null;
  return text.slice(0, only.start).trim() === "" ? only.slug : null;
}
