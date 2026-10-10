import type { CryptoOps } from "../../http/types";

export function derivePublicKeyId(
  crypto: CryptoOps,
  prefix: "dev" | "sk",
  publicKey: Uint8Array,
): string {
  const digest = crypto.sha256(publicKey);
  return `${prefix}_${crypto.base64urlEncode(digest)}`;
}

const ROOT_PK_FP_DOMAIN = "puffo/root-public-key-fingerprint/v1";

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
