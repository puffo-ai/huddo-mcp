import type { CoreWhisperKeys } from "../../../application/runtime/core-whisper-port";
import { CoreRequestError } from "../../../http/types";
import type { CoreClient } from "./client";
import { unknownOutcome, type CallKind } from "./protocol";

type Envelope = { ok?: Record<string, unknown>; err?: { code: string; message: string } };

function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64(text: string): Uint8Array {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function createCoreWhisperKeys(client: Pick<CoreClient, "call">, slug: string): CoreWhisperKeys {
  async function ok(kind: CallKind, payload: unknown): Promise<Record<string, unknown>> {
    const outcome = await client.call(kind, JSON.stringify(payload));
    if (outcome.status === "unknown") throw unknownOutcome(`${kind}`, outcome);
    const envelope = JSON.parse(outcome.envelope) as Envelope;
    if (!envelope.ok) throw CoreRequestError.fromCore(envelope.err?.code ?? "unknown", `${envelope.err?.code}: ${envelope.err?.message}`);
    return envelope.ok;
  }
  let deviceId: Promise<string | null> | null = null;
  return {
    localDeviceId() {
      deviceId ??= ok("query", { type: "list_identities" }).then((result) => {
        const items = result.items as Array<{ slug: string; local_device_id?: string }>;
        return items.find((item) => item.slug === slug)?.local_device_id ?? null;
      });
      return deviceId;
    },
    async devices(slugs) {
      const result = await ok("request", { v: 2, name: "device_kem_keys", payload: { slugs: [...new Set(slugs)] } });
      return (result.devices as Array<{ slug: string; device_id: string; kem_public_key: string }>).map((device) => ({
        slug: device.slug,
        device_id: device.device_id,
        kem_public_key: fromB64(device.kem_public_key),
      }));
    },
    async openSealed(sealed) {
      const result = await ok("request", {
        v: 2,
        name: "open_device_sealed",
        payload: {
          encapped_key_b64: toB64(sealed.enc),
          info_b64: toB64(sealed.info),
          key_aad_b64: toB64(sealed.keyAad),
          sealed_key_b64: toB64(sealed.sealedKey),
          nonce_b64: toB64(sealed.nonce),
          aad_b64: toB64(sealed.aad),
          ciphertext_b64: toB64(sealed.ciphertext),
        },
      });
      return fromB64(result.plaintext_b64 as string);
    },
  };
}
