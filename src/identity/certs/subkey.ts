import type { CryptoOps } from "../../http/types";
import { SUBKEY_TTL_MS } from "../../constants/subkey";
import { derivePublicKeyId } from "./ids";

export function createSubkeyCert(
  crypto: CryptoOps,
  deviceSigningKey: Uint8Array,
  deviceId: string,
  subkeyPublicKey: Uint8Array,
  issuedAt?: number
): Record<string, unknown> {
  const now = issuedAt ?? Date.now();
  const expiresAt = now + SUBKEY_TTL_MS;
  const subkeyId = derivePublicKeyId(crypto, "sk", subkeyPublicKey);

  const cert: Record<string, unknown> = {
    type: "subkey_cert",
    version: 1,
    subkey_id: subkeyId,
    device_id: deviceId,
    subkey_public_key: crypto.base64urlEncode(subkeyPublicKey),
    issued_at: now,
    expires_at: expiresAt,
    signature: "",
  };

  const canonical = crypto.canonicalizeForSigning(JSON.stringify(cert));
  const sig = crypto.ed25519Sign(deviceSigningKey, canonical);
  cert.signature = crypto.base64urlEncode(sig);

  return cert;
}
