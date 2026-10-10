import type { CryptoOps } from "../../http/types";
import { HttpError, HttpTimeoutError } from "../../http/types";
import { transportSigningPort } from "../../application/runtime/transport-signing-port";
import { subkeyCertAuthorityPort } from "../../application/runtime/subkey-cert-authority-port";
import { SUBKEY_TTL_MS } from "../../constants/subkey";
import type { BrowserKeyStore, Session, StoredIdentity } from "../primitives/keystore";
import { authHeadersToRecord } from "./signing";

const rotatingPromises = new Map<string, Promise<Record<string, unknown>>>();
const rotationListeners = new Map<string, Set<() => void | Promise<void>>>();
export const SUBKEY_ROTATION_TIMEOUT_MS = 60_000;

let activeRotationTransactions = 0;
export const activeSubkeyRotationTransactionCount = (): number => activeRotationTransactions;

export async function trackSubkeyRotationTransaction<T>(work: () => Promise<T>): Promise<T> {
  activeRotationTransactions += 1;
  try {
    return await work();
  } finally {
    activeRotationTransactions -= 1;
  }
}

export async function postSubkeyCertificate(
  serverUrl: string,
  init: RequestInit,
  timeoutMs = SUBKEY_ROTATION_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${serverUrl}/devices/subkeys`, {
      ...init,
      signal: ctrl.signal,
    });
  } catch (error) {
    if (ctrl.signal.aborted) {
      throw new HttpTimeoutError("POST", "/devices/subkeys", timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function onSubkeyRotated(slug: string, cb: () => void | Promise<void>): () => void {
  let set = rotationListeners.get(slug);
  if (!set) {
    set = new Set();
    rotationListeners.set(slug, set);
  }
  set.add(cb);
  return () => {
    rotationListeners.get(slug)?.delete(cb);
  };
}

export function coordinateRotation(
  serverUrl: string,
  slug: string,
  work: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const owner = `${serverUrl.replace(/\/+$/, "")}\u0000${slug}`;
  const existing = rotatingPromises.get(owner);
  if (existing) return existing;

  const promise = work().then(async (result) => {
    const listeners = [...(rotationListeners.get(slug) ?? [])];
    await Promise.all(listeners.map(async (cb) => {
      try {
        await cb();
      } catch {
      }
    }));
    return result;
  }).finally(() => {
    if (rotatingPromises.get(owner) === promise) {
      rotatingPromises.delete(owner);
    }
  });
  rotatingPromises.set(owner, promise);

  return promise;
}

export async function mintAndPostSubkey(opts: {
  identity: StoredIdentity;
  crypto: CryptoOps;
  keyStore: BrowserKeyStore;
  serverUrl: string;
  slug: string;
  assertCurrent?: () => void;
}): Promise<Record<string, unknown>> {
  const { identity, crypto, keyStore, serverUrl, slug, assertCurrent } = opts;

  const issuedAt = Date.now();
  const issued = subkeyCertAuthorityPort().issue({
    serverUrl,
    slug,
    deviceId: identity.device_id,
    deviceSecretKey: identity.device_signing_secret_key,
    issuedAt,
    expiresAt: issuedAt + SUBKEY_TTL_MS,
    crypto,
  });
  const cert = issued.cert;

  const body = new TextEncoder().encode(JSON.stringify({ subkey_cert: cert }));
  const auth = transportSigningPort().signHttp({
    serverUrl,
    slug,
    credential: {
      deviceId: identity.device_id,
      keyId: identity.device_id,
      secretKey: identity.device_signing_secret_key,
    },
    crypto,
  }, "POST", "/devices/subkeys", body);

  const resp = await postSubkeyCertificate(serverUrl, {
    method: "POST",
    headers: authHeadersToRecord(auth),
    body: (body.buffer as ArrayBuffer).slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new HttpError(resp.status, text);
  }

  assertCurrent?.();

  const session: Session = {
    slug,
    device_id: identity.device_id,
    subkey_id: cert.subkey_id as string,
    subkey_secret_key: issued.secretKey,
    expires_at: cert.expires_at as number,
  };
  await keyStore.saveSession(session, assertCurrent);
  return cert;
}

export const ROTATE_SUBKEY_RETRY_DELAYS_MS = [0, 250, 750, 1500] as const;
export const SUBKEY_READINESS_RETRY_DELAYS_MS = [0, 250, 750, 1500, 2500] as const;

export function isRotationRaceError(e: unknown): boolean {
  if (!(e instanceof HttpError)) return false;
  if (e.status === 401) return true;
  if (e.status !== 400) return false;
  try {
    const body = JSON.parse(e.body) as { error?: unknown };
    return body.error === "DEVICE_NOT_FOUND";
  } catch {
    return false;
  }
}

export async function retryOnRotationRace<T>(
  fn: () => Promise<T>,
  delays: readonly number[] = ROTATE_SUBKEY_RETRY_DELAYS_MS,
): Promise<T> {
  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (e) {
      if (!isRotationRaceError(e)) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function retryUntilSubkeyReady<T>(
  fn: () => Promise<T>,
  delays: readonly number[] = SUBKEY_READINESS_RETRY_DELAYS_MS,
): Promise<T> {
  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      lastErr = error;
    }
  }
  throw lastErr;
}
