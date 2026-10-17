import type { CryptoOps } from "../../http/types";
import { createDeviceCert } from "../certs/device";
import type { StoredIdentity } from "../primitives/keystore";

export async function registerNewDevice(
  identity: StoredIdentity,
  crypto: CryptoOps,
  options: { deviceName?: string; fetchImpl?: typeof fetch } = {},
): Promise<StoredIdentity> {
  const signing = crypto.generateEd25519KeyPair();
  const kem = crypto.generateKemKeyPair();
  const deviceCert = createDeviceCert(crypto, identity.root_secret_key, signing.publicKey, kem.publicKey);
  const res = await (options.fetchImpl ?? fetch)(`${identity.server_url.replace(/\/+$/, "")}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: identity.slug,
      device_cert: deviceCert,
      ...(options.deviceName ? { device_name: options.deviceName } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Could not register this device (HTTP ${res.status})`);
  return {
    ...identity,
    device_id: deviceCert.device_id,
    device_signing_secret_key: signing.secretKey,
    kem_secret_key: kem.secretKey,
  };
}
