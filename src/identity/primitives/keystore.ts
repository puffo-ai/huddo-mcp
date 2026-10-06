export interface StoredIdentity {
  slug: string;
  device_id: string;
  root_secret_key: Uint8Array;
  device_signing_secret_key: Uint8Array;
  kem_secret_key: Uint8Array;
  server_url: string;
  slug_binding_json?: string;
  identity_cert_json?: string;
  identity_profile_json?: string;
  /** Set on email-auth identities so the key-login picker can render email instead of slug. */
  email?: string;
}

export interface Session {
  slug: string;
  device_id: string;
  subkey_id: string;
  subkey_secret_key: Uint8Array;
  expires_at: number;
}

const DB_NAME = "puffo-keystore";
const DB_VERSION = 1;
const IDENTITY_STORE = "identities";
const SESSION_STORE = "sessions";
const META_STORE = "meta";
const WRAPPING_KEY_ID = "wrapping-key";
const IDENTITY_DELETION_AUDIT_KEY = "puffo-identity-deletion-audit-v1";

export type IdentityDeletionReason =
  | "agent-provisioning-cleanup"
  | "expired-recoverable-identity"
  | "force-sign-out"
  | "login-saved-identity-delete"
  | "revoke-device"
  | "self-profile-sign-out";

function recordIdentityDeletion(reason: IdentityDeletionReason): void {
  try {
    // Keep enough information to diagnose unexpected deletion paths without
    // retaining a user's handle on a shared browser.
    localStorage.setItem(IDENTITY_DELETION_AUDIT_KEY, JSON.stringify({
      at: new Date().toISOString(),
      reason,
    }));
  } catch {
    // Diagnostics must never prevent an explicitly requested deletion.
  }
}

import { SUBKEY_ROTATION_MARGIN_MS } from "../../constants/subkey";
import { openIdb, idbRequest, idbTxDone, IDB_REQUEST_TIMEOUT_MS } from "../../utils/idb-open";

interface EncryptedBlob {
  iv: Uint8Array;
  data: Uint8Array;
}

interface StoredIdentityRecord {
  slug: string;
  device_id: string;
  root_secret_key: EncryptedBlob;
  device_signing_secret_key: EncryptedBlob;
  kem_secret_key: EncryptedBlob;
  server_url: string;
  slug_binding_json?: string;
  identity_cert_json?: string;
  identity_profile_json?: string;
  email?: string;
}

interface StoredSessionRecord {
  slug: string;
  // Persisted so loadSession stays a single IDB read; optional for legacy rows
  // written before this field existed (upgraded on next saveSession).
  device_id?: string;
  subkey_id: string;
  subkey_secret_key: EncryptedBlob;
  expires_at: number;
}

export class BrowserKeyStore {
  private db: IDBDatabase | null = null;
  private wrappingKey: CryptoKey | null = null;

  async open(): Promise<void> {
    this.db = await this.openDB();
    this.wrappingKey = await this.ensureWrappingKey();
    await this.requestPersistence();
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.wrappingKey = null;
  }

  async saveIdentity(identity: StoredIdentity): Promise<void> {
    const db = this.requireDB();
    const key = this.requireWrappingKey();

    // When device_id or server scope changes (re-enrollment / restore /
    // recovery reset / authenticated origin rebind), invalidate the stored
    // subkey session: it is bound to the OLD scope and must not be paired
    // with the updated identity even if the page dies before rotation.
    const prevRecord: StoredIdentityRecord | undefined = await reqResult(
      db
        .transaction(IDENTITY_STORE, "readonly")
        .objectStore(IDENTITY_STORE)
        .get(identity.slug)
    );
    const deviceIdChanged =
      prevRecord != null && prevRecord.device_id !== identity.device_id;
    const serverUrlChanged =
      prevRecord != null && prevRecord.server_url !== identity.server_url;

    const record: StoredIdentityRecord = {
      slug: identity.slug,
      device_id: identity.device_id,
      root_secret_key: await this.encrypt(key, identity.root_secret_key),
      device_signing_secret_key: await this.encrypt(
        key,
        identity.device_signing_secret_key
      ),
      kem_secret_key: await this.encrypt(key, identity.kem_secret_key),
      server_url: identity.server_url,
      slug_binding_json: identity.slug_binding_json,
      identity_cert_json: identity.identity_cert_json,
      identity_profile_json: identity.identity_profile_json,
      email: identity.email,
    };

    // Atomic put + (conditional) session delete — page dying mid-rotation
    // must not leave a new identity row paired with a stale session row.
    const stores = deviceIdChanged || serverUrlChanged
      ? [IDENTITY_STORE, SESSION_STORE]
      : [IDENTITY_STORE];
    const tx = db.transaction(stores, "readwrite");
    tx.objectStore(IDENTITY_STORE).put(record);
    if (deviceIdChanged || serverUrlChanged) {
      tx.objectStore(SESSION_STORE).delete(identity.slug);
    }
    await txComplete(tx);
  }

  async loadIdentity(slug: string): Promise<StoredIdentity | null> {
    const db = this.requireDB();
    const key = this.requireWrappingKey();

    const tx = db.transaction(IDENTITY_STORE, "readonly");
    const record: StoredIdentityRecord | undefined = await reqResult(
      tx.objectStore(IDENTITY_STORE).get(slug)
    );
    if (!record) return null;

    return {
      slug: record.slug,
      device_id: record.device_id,
      root_secret_key: await this.decrypt(key, record.root_secret_key),
      device_signing_secret_key: await this.decrypt(
        key,
        record.device_signing_secret_key
      ),
      kem_secret_key: await this.decrypt(key, record.kem_secret_key),
      server_url: record.server_url,
      slug_binding_json: record.slug_binding_json,
      identity_cert_json: record.identity_cert_json,
      identity_profile_json: record.identity_profile_json,
      email: record.email,
    };
  }

  async listIdentities(): Promise<string[]> {
    const db = this.requireDB();
    const tx = db.transaction(IDENTITY_STORE, "readonly");
    const keys = await reqResult(tx.objectStore(IDENTITY_STORE).getAllKeys());
    return (keys as string[]).sort();
  }

  async deleteIdentity(slug: string, reason: IdentityDeletionReason): Promise<void> {
    const db = this.requireDB();
    const tx = db.transaction(IDENTITY_STORE, "readwrite");
    tx.objectStore(IDENTITY_STORE).delete(slug);
    await txComplete(tx);
    recordIdentityDeletion(reason);
  }

  async deleteIdentityAndSessionIfDeviceMatches(
    slug: string,
    deviceId: string,
    reason: IdentityDeletionReason,
  ): Promise<boolean> {
    const db = this.requireDB();
    const tx = db.transaction([IDENTITY_STORE, SESSION_STORE], "readwrite");
    const identityStore = tx.objectStore(IDENTITY_STORE);
    const sessionStore = tx.objectStore(SESSION_STORE);
    const record: StoredIdentityRecord | undefined = await reqResult(identityStore.get(slug));
    if (!record || record.device_id !== deviceId) {
      await txComplete(tx);
      return false;
    }
    identityStore.delete(slug);
    const session: StoredSessionRecord | undefined = await reqResult(sessionStore.get(slug));
    if (!session?.device_id || session.device_id === deviceId) sessionStore.delete(slug);
    await txComplete(tx);
    recordIdentityDeletion(reason);
    return true;
  }

  async saveSession(session: Session, assertCurrent?: () => void): Promise<void> {
    const db = this.requireDB();
    const key = this.requireWrappingKey();

    const record: StoredSessionRecord = {
      slug: session.slug,
      device_id: session.device_id,
      subkey_id: session.subkey_id,
      subkey_secret_key: await this.encrypt(key, session.subkey_secret_key),
      expires_at: session.expires_at,
    };

    assertCurrent?.();
    const tx = db.transaction(SESSION_STORE, "readwrite");
    tx.objectStore(SESSION_STORE).put(record);
    await txComplete(tx);
  }

  async loadSession(slug: string): Promise<Session | null> {
    const db = this.requireDB();
    const key = this.requireWrappingKey();

    const tx = db.transaction(SESSION_STORE, "readonly");
    const record: StoredSessionRecord | undefined = await reqResult(
      tx.objectStore(SESSION_STORE).get(slug)
    );
    if (!record) return null;

    if (record.expires_at <= Date.now()) {
      await this.deleteSession(slug);
      return null;
    }

    // Legacy rows (no device_id on session) fall back to the identity record.
    let deviceId = record.device_id;
    if (!deviceId) {
      const identity = await this.loadIdentity(slug);
      if (!identity) return null;
      deviceId = identity.device_id;
    }

    return {
      slug: record.slug,
      device_id: deviceId,
      subkey_id: record.subkey_id,
      subkey_secret_key: await this.decrypt(key, record.subkey_secret_key),
      expires_at: record.expires_at,
    };
  }

  async deleteSession(slug: string): Promise<void> {
    const db = this.requireDB();
    const tx = db.transaction(SESSION_STORE, "readwrite");
    tx.objectStore(SESSION_STORE).delete(slug);
    await txComplete(tx);
  }

  async clear(): Promise<void> {
    const db = this.requireDB();
    const tx = db.transaction(
      [IDENTITY_STORE, SESSION_STORE, META_STORE],
      "readwrite"
    );
    tx.objectStore(IDENTITY_STORE).clear();
    tx.objectStore(SESSION_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await txComplete(tx);
    try {
      localStorage.removeItem(IDENTITY_DELETION_AUDIT_KEY);
    } catch {
      // Clearing durable credentials must not depend on diagnostics storage.
    }
    this.wrappingKey = await this.ensureWrappingKey();
  }

  private requireDB(): IDBDatabase {
    if (!this.db) throw new Error("KeyStore not opened");
    return this.db;
  }

  private requireWrappingKey(): CryptoKey {
    if (!this.wrappingKey) throw new Error("KeyStore not opened");
    return this.wrappingKey;
  }

  private openDB(): Promise<IDBDatabase> {
    return openIdb(DB_NAME, DB_VERSION, {
      onUpgradeNeeded: (db) => {
        if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
          db.createObjectStore(IDENTITY_STORE, { keyPath: "slug" });
        }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: "slug" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      },
    });
  }

  private async ensureWrappingKey(): Promise<CryptoKey> {
    const db = this.requireDB();
    const tx = db.transaction(META_STORE, "readonly");
    const existing: CryptoKey | undefined = await reqResult(
      tx.objectStore(META_STORE).get(WRAPPING_KEY_ID)
    );
    if (existing) return existing;

    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const writeTx = db.transaction(META_STORE, "readwrite");
    writeTx.objectStore(META_STORE).put(key, WRAPPING_KEY_ID);
    await txComplete(writeTx);
    return key;
  }

  private async encrypt(
    key: CryptoKey,
    data: Uint8Array
  ): Promise<EncryptedBlob> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength)
    );
    return { iv, data: new Uint8Array(encrypted) };
  }

  private async decrypt(
    key: CryptoKey,
    blob: EncryptedBlob
  ): Promise<Uint8Array> {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(blob.iv) },
      key,
      (blob.data.buffer as ArrayBuffer).slice(
        blob.data.byteOffset,
        blob.data.byteOffset + blob.data.byteLength
      )
    );
    return new Uint8Array(decrypted);
  }

  private async requestPersistence(): Promise<void> {
    try {
      if (navigator?.storage?.persist) {
        // Bounded: iOS has been seen to leave this pending, and it is
        // advisory — booting without it beats not booting.
        await Promise.race([
          navigator.storage.persist(),
          new Promise((r) => setTimeout(r, IDB_REQUEST_TIMEOUT_MS)),
        ]);
      }
    } catch {
      // persist() not available — non-critical
    }
  }
}

export function isSessionExpired(expiresAt: number, nowMs?: number): boolean {
  return (nowMs ?? Date.now()) >= expiresAt;
}

export function needsRotation(expiresAt: number, nowMs?: number): boolean {
  return expiresAt <= (nowMs ?? Date.now()) + SUBKEY_ROTATION_MARGIN_MS;
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return idbTxDone(tx, "keystore transaction");
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return idbRequest(req, "keystore request");
}
