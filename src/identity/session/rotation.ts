// Subkey rotation coordination: mints a fresh subkey cert under the
// device key, POSTs it to /devices/subkeys, persists the new session in
// the keystore. Owns the cross-instance dedup + listener registry so
// every PuffoHttpClient sharing a slug observes a single rotation.

import type { CryptoOps } from "../../http/types";
import { HttpError, HttpTimeoutError } from "../../http/types";
import { transportSigningPort } from "../../application/runtime/transport-signing-port";
import { subkeyCertAuthorityPort } from "../../application/runtime/subkey-cert-authority-port";
import { SUBKEY_TTL_MS } from "../../constants/subkey";
import type { BrowserKeyStore, Session, StoredIdentity } from "../primitives/keystore";
import { authHeadersToRecord } from "./signing";

// Multiple stores / hooks construct their own PuffoHttpClient against
// the same factory, so instance-scoped state can't dedup the
// thundering-herd on initial load — N services racing past
// ensureSubkey with no session would each fire a separate
// POST /devices/subkeys (production incident 2026-05-19 saw 6
// simultaneous 201s after a hard refresh post-rotation). One in-flight
// POST per slug is all we ever need.
const rotatingPromises = new Map<string, Promise<Record<string, unknown>>>();
const rotationListeners = new Map<string, Set<() => void | Promise<void>>>();
export const SUBKEY_ROTATION_TIMEOUT_MS = 60_000;

/** Observable count used by clean-start rollback eligibility. */
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

// Subscribe to subkey-rotation events for a given slug. Fires once per
// successful rotation, AFTER the new session has been persisted — a
// callback reading the keystore inside the handler is guaranteed to
// see the new subkey. Intended consumer: http/ws-client.ts, which
// has to force a reconnect under the fresh subkey.
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

// Wraps an actual rotation call: dedups concurrent callers for the same
// server/account owner and fans out to listeners on success only.
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
        // Listener failures do not turn a committed rotation into a failed
        // server operation. Consumers remain responsible for fail-closed UI.
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

// Mint a fresh subkey cert + POST it + persist the new session row.
// Pure: no class state, no dedup. Wrap in `coordinateRotation` for
// dedup + listener semantics.
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

// 250/750/1500 ms ≈ 2.5 s worst case — within typical Postgres
// commit-visibility windows and under what a user notices as a hang.
export const ROTATE_SUBKEY_RETRY_DELAYS_MS = [0, 250, 750, 1500] as const;
export const SUBKEY_READINESS_RETRY_DELAYS_MS = [0, 250, 750, 1500, 2500] as const;

// 401 or 400 with exact DEVICE_NOT_FOUND body. Any other 400 is a
// real malformed request and must NOT be retried.
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

// Tests pass an all-zero `delays` array to skip sleeps.
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
