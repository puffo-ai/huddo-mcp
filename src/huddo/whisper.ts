import type { CryptoOps } from "../http/types";
import { coreWhisperKeys, type CoreDeviceSealed } from "../application/runtime/core-whisper-port";
import { quoteOfContent, type MessageQuote } from "./message-quotes";
import { parseAttachmentsContent, type AttachmentReference } from "../features/attachments/domain/attachment";

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

/** What a whisper says, sealed together: its text, its files and, like any message, at most one quote. */
export interface WhisperBody {
  text: string;
  quote?: MessageQuote;
  attachments?: AttachmentReference[];
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
  body: string | WhisperBody,
  devices: readonly WhisperDevice[],
): WhisperContent {
  if (devices.length === 0) throw new Error("No devices to whisper to");
  const { text, quote, attachments } = typeof body === "string" ? { text: body, quote: undefined, attachments: undefined } : body;
  const contentKey = crypto.generateRandomBytes(32);
  const nonce = crypto.generateRandomBytes(12);
  const plain = JSON.stringify({ text, ...(quote ? { quotes: [quote] } : {}), ...(attachments?.length ? { attachments } : {}) });
  const ciphertext = crypto.aeadSeal(contentKey, nonce, encoder.encode(plain), contentAad(ctx));
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

type WhisperSlot = Readonly<{ full: WhisperContext; enc: Uint8Array; aad: Uint8Array; key: Uint8Array }>;

function whisperSlot(
  crypto: CryptoOps,
  content: WhisperContent,
  ctx: Omit<WhisperContext, "to">,
  deviceId: string,
): WhisperSlot | null {
  const slot = content.keys.find((k) => k?.device_id === deviceId);
  if (!slot) return null;
  const full = { ...ctx, to: content.to };
  return {
    full,
    enc: crypto.base64urlDecode(slot.enc),
    aad: keyAad(full, deviceId),
    key: crypto.base64urlDecode(slot.key),
  };
}

function whisperBody(plain: Uint8Array): WhisperBody | null {
  const parsed = JSON.parse(decoder.decode(plain)) as { text?: unknown };
  if (typeof parsed.text !== "string") return null;
  const quote = quoteOfContent(parsed);
  const attachments = parseAttachmentsContent({ text: parsed.text, attachments: (parsed as { attachments?: unknown }).attachments ?? [] })?.attachments ?? [];
  return { text: parsed.text, ...(quote ? { quote } : {}), ...(attachments.length ? { attachments } : {}) };
}

function decryptWhisper(crypto: CryptoOps, content: WhisperContent, full: WhisperContext, contentKey: Uint8Array): WhisperBody | null {
  const plain = crypto.aeadOpen(
    contentKey,
    crypto.base64urlDecode(content.nonce),
    crypto.base64urlDecode(content.ciphertext),
    contentAad(full),
  );
  contentKey.fill(0);
  return whisperBody(plain);
}

export function openWhisper(
  crypto: CryptoOps,
  content: WhisperContent,
  ctx: Omit<WhisperContext, "to">,
  deviceId: string,
  openKem: DeviceKemOpen,
): WhisperBody | null {
  try {
    const slot = whisperSlot(crypto, content, ctx, deviceId);
    if (!slot) return null;
    return decryptWhisper(crypto, content, slot.full, openKem(slot.enc, KEY_INFO, slot.aad, slot.key));
  } catch {
    return null;
  }
}

export type WhisperKeys = Readonly<{
  localDeviceId(): Promise<string | null>;
  openSealed(sealed: CoreDeviceSealed): Promise<Uint8Array>;
}>;

export async function openWhisperWith(
  crypto: CryptoOps,
  content: WhisperContent,
  ctx: Omit<WhisperContext, "to">,
  keys: WhisperKeys,
): Promise<WhisperBody | null> {
  try {
    const deviceId = await keys.localDeviceId();
    const slot = deviceId ? whisperSlot(crypto, content, ctx, deviceId) : null;
    if (!slot) return null;
    return whisperBody(
      await keys.openSealed({
        enc: slot.enc,
        info: KEY_INFO,
        keyAad: slot.aad,
        sealedKey: slot.key,
        nonce: crypto.base64urlDecode(content.nonce),
        aad: contentAad(slot.full),
        ciphertext: crypto.base64urlDecode(content.ciphertext),
      }),
    );
  } catch {
    return null;
  }
}

/** Opens whispers through core in the background and remembers each result by row id. */
export function createWhisperTextCache(crypto: CryptoOps, onOpened: () => void) {
  const texts = new Map<string, WhisperBody | null>();
  const sent = new Map<string, WhisperBody>();
  const opening = new Set<string>();
  return {
    /** The plaintext of a whisper this page just sealed, so its stored copy shows at once. */
    remember(content: WhisperContent, body: WhisperBody): void {
      sent.set(content.nonce, body);
    },
    body(id: string, content: WhisperContent, ctx: Omit<WhisperContext, "to">): WhisperBody | null | undefined {
      const known = texts.has(id) ? texts.get(id) : sent.get(content.nonce);
      if (known !== undefined) return known;
      const keys = coreWhisperKeys();
      if (keys && !opening.has(id)) {
        opening.add(id);
        void openWhisperWith(crypto, content, ctx, keys)
          .then((opened) => {
            texts.set(id, opened);
            onOpened();
          })
          .finally(() => opening.delete(id));
      }
      return undefined;
    },
  };
}

export async function whisperDevices(slugs: readonly string[]): Promise<WhisperDevice[]> {
  const keys = coreWhisperKeys();
  if (!keys) throw new Error("The core runtime is not ready yet");
  return keys.devices(slugs.filter(Boolean));
}

/** Seals `body` for the recipient's and the sender's devices, which core resolves. */
export async function sealWhisperForRoom(crypto: CryptoOps, ctx: WhisperContext, body: string | WhisperBody): Promise<WhisperContent> {
  return sealWhisper(crypto, ctx, body, await whisperDevices([ctx.to, ctx.sender]));
}

export function leadingWhisperTarget(
  text: string,
  mentions: readonly { start: number; slug: string }[],
  selfSlug: string | null,
): string | null {
  if (mentions.length !== 1) return null;
  const [only] = mentions;
  if (only.slug === selfSlug || only.slug === "all") return null;
  return text.slice(0, only.start).trim() === "" ? only.slug : null;
}
