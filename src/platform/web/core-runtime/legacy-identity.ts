export type LegacyCerts = Readonly<{
  slug: string;
  identity_cert: unknown;
  slug_binding: unknown;
  device_cert: unknown;
  subkey_cert: unknown;
}>;

export type LegacyKeySource = Readonly<{
  loadIdentity(slug: string): Promise<{
    device_id: string;
    root_secret_key: Uint8Array;
    device_signing_secret_key: Uint8Array;
    kem_secret_key: Uint8Array;
  } | null>;
  loadSession(slug: string): Promise<{ subkey_id: string; subkey_secret_key: Uint8Array } | null>;
}>;

export const STALE_LEGACY_KEYS = "stale_legacy_keys";

/** The stored keys moved on (a new subkey or device) after the certificates were fetched. */
export class StaleLegacyKeysError extends Error {
  readonly code = STALE_LEGACY_KEYS;
}

const certField = (cert: unknown, field: string): unknown => (cert as Record<string, unknown> | null)?.[field];

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Runs in the leader Worker so the secrets never cross the tab channel. */
export async function legacyIdentityCommand(payload: string, keys: LegacyKeySource): Promise<string> {
  const certs = JSON.parse(payload) as LegacyCerts;
  const [identity, session] = await Promise.all([keys.loadIdentity(certs.slug), keys.loadSession(certs.slug)]);
  if (!identity) throw new Error(`no stored identity for ${certs.slug}`);
  if (!session) throw new Error(`no live session for ${certs.slug}`);
  if (certField(certs.device_cert, "device_id") !== identity.device_id) {
    throw new StaleLegacyKeysError(`the stored device of ${certs.slug} is not the one certified`);
  }
  if (certField(certs.subkey_cert, "subkey_id") !== session.subkey_id) {
    throw new StaleLegacyKeysError(`the stored subkey of ${certs.slug} is not the one certified`);
  }
  return JSON.stringify({
    type: "import_legacy_identity",
    slug: certs.slug,
    identity_cert: certs.identity_cert,
    slug_binding: certs.slug_binding,
    device_cert: certs.device_cert,
    subkey_cert: certs.subkey_cert,
    root_secret_key: base64url(identity.root_secret_key),
    device_signing_secret_key: base64url(identity.device_signing_secret_key),
    kem_secret_key: base64url(identity.kem_secret_key),
    subkey_secret_key: base64url(session.subkey_secret_key),
  });
}
