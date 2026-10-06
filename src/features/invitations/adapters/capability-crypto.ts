import type { CryptoOps } from "../../../http/types";
import type { InviteCapabilityMaterial } from "../domain/capability";

const INVITE_SEED_BYTES = 16;
const INVITE_KEY_INFO = new TextEncoder().encode("puffo-invite-ed25519-v1");

export async function deriveInviteSecretKey(
  seed: Uint8Array,
): Promise<Uint8Array> {
  if (seed.byteLength !== INVITE_SEED_BYTES) {
    throw new Error("Invalid invite capability seed");
  }
  const seedBuf = (seed.buffer as ArrayBuffer).slice(
    seed.byteOffset,
    seed.byteOffset + seed.byteLength,
  );
  const ikm = await globalThis.crypto.subtle.importKey(
    "raw",
    seedBuf,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: INVITE_KEY_INFO,
    },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

export async function generateInviteCapabilityKey(
  crypto: CryptoOps,
): Promise<InviteCapabilityMaterial> {
  // VESTIGIAL(PUF-358): unique public key; private material discarded.
  const seed = crypto.generateRandomBytes(INVITE_SEED_BYTES);
  const secretKey = await deriveInviteSecretKey(seed);
  const publicKey = crypto.ed25519PublicKeyFromSecret(secretKey);
  return {
    publicKeyBase64url: crypto.base64urlEncode(publicKey),
  };
}
