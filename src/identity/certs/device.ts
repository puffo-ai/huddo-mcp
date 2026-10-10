import type { CryptoOps } from "../../http/types";
import { derivePublicKeyId } from "./ids";

export interface DeviceCertKey {
  algorithm: string;
  public_key: string;
}

export interface DeviceCertKeys {
  signing: DeviceCertKey;
  encryption: DeviceCertKey;
}

export interface DeviceCert {
  type: string;
  version: number;
  device_id: string;
  root_public_key: string;
  keys: DeviceCertKeys;
  issued_at: number;
  expires_at: number | null;
  signature: string;
}

export interface DeviceRevocation {
  type: string;
  version: number;
  device_id: string;
  root_public_key: string;
  effective_from: number;
  issued_at: number;
  signature: string;
}

export function createDeviceCert(
  crypto: CryptoOps,
  rootSecretKey: Uint8Array,
  deviceSigningPk: Uint8Array,
  kemPk: Uint8Array,
  issuedAt?: number,
  expiresAt?: number | null,
): DeviceCert {
  const rootPk = crypto.ed25519PublicKeyFromSecret(rootSecretKey);
  const deviceId = derivePublicKeyId(crypto, "dev", deviceSigningPk);

  const cert: DeviceCert = {
    type: "device_cert",
    version: 1,
    device_id: deviceId,
    root_public_key: crypto.base64urlEncode(rootPk),
    keys: {
      signing: {
        algorithm: "ed25519",
        public_key: crypto.base64urlEncode(deviceSigningPk),
      },
      encryption: {
        algorithm: "x25519",
        public_key: crypto.base64urlEncode(kemPk),
      },
    },
    issued_at: issuedAt ?? Date.now(),
    expires_at: expiresAt ?? null,
    signature: "",
  };

  const canonical = crypto.canonicalizeForSigning(JSON.stringify(cert));
  const sig = crypto.ed25519Sign(rootSecretKey, canonical);
  cert.signature = crypto.base64urlEncode(sig);

  return cert;
}

export function createDeviceRevocation(
  crypto: CryptoOps,
  rootSecretKey: Uint8Array,
  deviceId: string,
  effectiveFromMs?: number,
  issuedAtMs?: number,
): DeviceRevocation {
  const rootPk = crypto.ed25519PublicKeyFromSecret(rootSecretKey);
  const now = Date.now();

  const rev: DeviceRevocation = {
    type: "device_revocation",
    version: 1,
    device_id: deviceId,
    root_public_key: crypto.base64urlEncode(rootPk),
    effective_from: effectiveFromMs ?? now,
    issued_at: issuedAtMs ?? now,
    signature: "",
  };

  const canonical = crypto.canonicalizeForSigning(JSON.stringify(rev));
  const sig = crypto.ed25519Sign(rootSecretKey, canonical);
  rev.signature = crypto.base64urlEncode(sig);

  return rev;
}
