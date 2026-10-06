import { join } from "node:path";
import type { BrowserKeyStore, Session, StoredIdentity } from "../src/identity/primitives/keystore";
import { identityDir, listIdentitySlugs, readJson, removeFile, writeJson } from "./home";

const BYTE_FIELDS = ["root_secret_key", "device_signing_secret_key", "kem_secret_key"] as const;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

type Encoded<T> = { [K in keyof T]: T[K] extends Uint8Array ? string : T[K] };

const identityPath = (slug: string) => join(identityDir(slug), "identity.json");
const sessionPath = (slug: string) => join(identityDir(slug), "session.json");

export class FileKeyStore {
  async open(): Promise<void> {}
  async close(): Promise<void> {}

  async saveIdentity(identity: StoredIdentity): Promise<void> {
    const prev = readJson<Encoded<StoredIdentity>>(identityPath(identity.slug));
    const encoded: Record<string, unknown> = { ...identity };
    for (const field of BYTE_FIELDS) encoded[field] = b64(identity[field]);
    writeJson(identityPath(identity.slug), encoded);
    if (prev && (prev.device_id !== identity.device_id || prev.server_url !== identity.server_url)) {
      removeFile(sessionPath(identity.slug));
    }
  }

  async loadIdentity(slug: string): Promise<StoredIdentity | null> {
    return this.identity(slug);
  }

  identity(slug: string): StoredIdentity | null {
    const raw = readJson<Encoded<StoredIdentity>>(identityPath(slug));
    if (!raw || raw.slug !== slug) return null;
    return {
      ...raw,
      root_secret_key: unb64(raw.root_secret_key),
      device_signing_secret_key: unb64(raw.device_signing_secret_key),
      kem_secret_key: unb64(raw.kem_secret_key),
    };
  }

  async listIdentities(): Promise<string[]> {
    return listIdentitySlugs();
  }

  async saveSession(session: Session, assertCurrent?: () => void): Promise<void> {
    assertCurrent?.();
    writeJson(sessionPath(session.slug), { ...session, subkey_secret_key: b64(session.subkey_secret_key) });
  }

  async loadSession(slug: string): Promise<Session | null> {
    const raw = readJson<Encoded<Session>>(sessionPath(slug));
    if (!raw || raw.slug !== slug) return null;
    if (raw.expires_at <= Date.now()) {
      removeFile(sessionPath(slug));
      return null;
    }
    return { ...raw, subkey_secret_key: unb64(raw.subkey_secret_key) };
  }

  async deleteSession(slug: string): Promise<void> {
    removeFile(sessionPath(slug));
  }

  asBrowserKeyStore(): BrowserKeyStore {
    return this as unknown as BrowserKeyStore;
  }
}
