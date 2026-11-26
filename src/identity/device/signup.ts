import type { CryptoOps } from "../../http/types";
import { PuffoHttpClient } from "../../http/client";
import { BrowserKeyStore, type StoredIdentity } from "../primitives/keystore";
import { sealIdentityEscrow } from "../primitives/backup";
import { beginFreshIdentityCertificateCeremony } from "./root-device-certificates";

export interface SignupResult {
  slug: string;
  deviceId: string;
  /** Only with `backup`, and only when the server stored the backup. */
  backupKey?: string;
}

export interface SignupOptions {
  displayName?: string;
  avatarUrl?: string;
  signupEndpoint?: string;
  /** Send an escrow of the new identity with the slug binding; the server stores it as the first backup. */
  backup?: boolean;
}

export async function signup(
  serverUrl: string,
  inviteCode: string,
  username: string,
  identityType: "human" | "agent",
  keyStore: BrowserKeyStore,
  crypto: CryptoOps,
  options: SignupOptions = {},
): Promise<SignupResult> {
  const ceremony = beginFreshIdentityCertificateCeremony({
    serverUrl,
    identityType,
    crypto,
  });
  const { identityCert, deviceCert } = ceremony.phase1;

  const httpClient = new PuffoHttpClient(serverUrl, keyStore, crypto, "");
  const signupClient = options.signupEndpoint
    ? new PuffoHttpClient(options.signupEndpoint, keyStore, crypto, "")
    : httpClient;

  try {
    const signupResp = await signupClient.postUnsigned<{
      slug: string;
      device_id: string;
      pending_token: string;
    }>("/signup", {
      invite_code: inviteCode,
      username,
      ...(options.displayName ? { display_name: options.displayName } : {}),
      ...(options.avatarUrl ? { avatar_url: options.avatarUrl } : {}),
      identity_cert: identityCert,
      device_cert: deviceCert,
    });

    if (signupResp.device_id !== ceremony.phase1.deviceId) {
      throw new Error("Signup returned a device id that does not match the issued certificate");
    }
    const material = ceremony.complete(signupResp.slug, Date.now());

    const identity: StoredIdentity = {
      slug: signupResp.slug,
      device_id: signupResp.device_id,
      root_secret_key: material.rootSecretKey,
      device_signing_secret_key: material.deviceSigningSecretKey,
      kem_secret_key: material.kemSecretKey,
      server_url: serverUrl,
      slug_binding_json: JSON.stringify(material.slugBinding),
      identity_cert_json: JSON.stringify(identityCert),
    };

    const committed = await httpClient.postUnsigned<{ backup_key?: string }>("/certs/slug_binding", {
      pending_token: signupResp.pending_token,
      slug_binding: material.slugBinding,
      ...(options.backup ? { backup: { escrow: { ...(await sealIdentityEscrow(identity)) } } } : {}),
    });

    await keyStore.saveIdentity(identity);

    return {
      slug: signupResp.slug,
      deviceId: signupResp.device_id,
      ...(committed?.backup_key ? { backupKey: committed.backup_key } : {}),
    };
  } finally {
    ceremony.dispose();
  }
}
