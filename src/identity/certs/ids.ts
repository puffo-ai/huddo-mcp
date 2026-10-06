import type { CryptoOps } from "../../http/types";

// Server's DeviceId::derive / SubkeyId::derive recompute this suffix,
// so the SHA-256 source MUST be the bound public key.
export function derivePublicKeyId(
  crypto: CryptoOps,
  prefix: "dev" | "sk",
  publicKey: Uint8Array,
): string {
  const digest = crypto.sha256(publicKey);
  return `${prefix}_${crypto.base64urlEncode(digest)}`;
}

const ROOT_PK_FP_DOMAIN = "puffo/root-public-key-fingerprint/v1";

// Field order must match server's PublicKeyFingerprint::derive_ed25519_public_key_bytes:
//   sha256(domain || 0x00 || "ed25519" || 0x00 || rootPublicKey)
export function deriveRootPublicKeyFingerprint(
  crypto: CryptoOps,
  rootPublicKey: Uint8Array,
): Uint8Array {
  const domain = new TextEncoder().encode(ROOT_PK_FP_DOMAIN);
  const algLabel = new TextEncoder().encode("ed25519");
  const buf = new Uint8Array(
    domain.length + 1 + algLabel.length + 1 + rootPublicKey.length,
  );
  let off = 0;
  buf.set(domain, off);
  off += domain.length;
  buf[off++] = 0;
  buf.set(algLabel, off);
  off += algLabel.length;
  buf[off++] = 0;
  buf.set(rootPublicKey, off);
  return crypto.sha256(buf);
}
