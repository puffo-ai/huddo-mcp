import type { StoredIdentity, BrowserKeyStore } from "./keystore";

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const BACKUP_VERSION = 1;

interface BackupFile {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export class BackupImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupImportError";
  }
}

export async function exportKeyBackup(
  identity: StoredIdentity,
  passphrase: string
): Promise<Blob> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const key = await deriveKey(passphrase, salt);

  const plaintext = encoder.encode(
    JSON.stringify({
      slug: identity.slug,
      device_id: identity.device_id,
      root_secret_key: arrayToBase64(identity.root_secret_key),
      device_signing_secret_key: arrayToBase64(identity.device_signing_secret_key),
      kem_secret_key: arrayToBase64(identity.kem_secret_key),
      server_url: identity.server_url,
      slug_binding_json: identity.slug_binding_json,
      identity_cert_json: identity.identity_cert_json,
      identity_profile_json: identity.identity_profile_json,
    })
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  const backup: BackupFile = {
    version: BACKUP_VERSION,
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    ciphertext: arrayToBase64(new Uint8Array(ciphertext)),
  };

  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

export async function importKeyBackup(
  file: Blob,
  passphrase: string,
  keyStore: BrowserKeyStore
): Promise<StoredIdentity> {
  const identity = await decryptKeyBackup(file, passphrase);
  await keyStore.saveIdentity(identity);
  return identity;
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export async function decryptKeyBackup(file: Blob, passphrase: string): Promise<StoredIdentity> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new BackupImportError("We couldn't read this backup file");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupImportError("This doesn't look like a valid backup file");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Partial<BackupFile>).version !== "number"
  ) {
    throw new BackupImportError("This doesn't look like a valid backup file");
  }

  const backup = parsed as Partial<BackupFile>;
  if (backup.version !== BACKUP_VERSION) {
    throw new BackupImportError(`Unsupported backup version: ${backup.version}`);
  }
  if (
    typeof backup.salt !== "string" ||
    typeof backup.iv !== "string" ||
    typeof backup.ciphertext !== "string"
  ) {
    throw new BackupImportError("This doesn't look like a valid backup file");
  }
  for (const field of ["salt", "iv", "ciphertext"] as const) {
    const value = backup[field] as string;
    if (value.length % 4 !== 0 || !BASE64_RE.test(value)) {
      throw new BackupImportError(`Corrupted backup: ${field} was altered after export`);
    }
  }

  let plaintext: ArrayBuffer;
  try {
    const salt = base64ToArray(backup.salt);
    const iv = base64ToArray(backup.iv);
    const ciphertext = base64ToArray(backup.ciphertext);
    const key = await deriveKey(passphrase, salt);
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: (iv.buffer as ArrayBuffer).slice(iv.byteOffset, iv.byteOffset + iv.byteLength) },
      key,
      (ciphertext.buffer as ArrayBuffer).slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength)
    );
  } catch {
    throw new BackupImportError("Wrong passphrase or corrupted backup");
  }

  let identity: StoredIdentity;
  try {
    const data = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
    const stringFields = [
      "slug",
      "device_id",
      "root_secret_key",
      "device_signing_secret_key",
      "kem_secret_key",
      "server_url",
    ];
    if (stringFields.some((field) => typeof data[field] !== "string")) {
      throw new Error("invalid backup payload");
    }
    identity = {
      slug: data.slug as string,
      device_id: data.device_id as string,
      root_secret_key: base64ToArray(data.root_secret_key as string),
      device_signing_secret_key: base64ToArray(data.device_signing_secret_key as string),
      kem_secret_key: base64ToArray(data.kem_secret_key as string),
      server_url: data.server_url as string,
    };
    if (typeof data.slug_binding_json === "string") {
      identity.slug_binding_json = data.slug_binding_json;
    }
    if (typeof data.identity_cert_json === "string") {
      identity.identity_cert_json = data.identity_cert_json;
    }
    if (typeof data.identity_profile_json === "string") {
      identity.identity_profile_json = data.identity_profile_json;
    }
  } catch {
    throw new BackupImportError("Wrong passphrase or corrupted backup");
  }
  return identity;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: (salt.buffer as ArrayBuffer).slice(salt.byteOffset, salt.byteOffset + salt.byteLength), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function arrayToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToArray(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}
