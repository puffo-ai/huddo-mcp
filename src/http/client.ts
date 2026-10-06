import type { CryptoOps } from "./types";
import { HttpError, HttpTimeoutError, SessionRecoveryError, StaleHttpSessionError } from "./types";
import { authHeadersToRecord } from "../identity/session/signing";
import { transportSigningPort } from "../application/runtime/transport-signing-port";
import type { TransportSigningInput } from "../application/runtime/transport-signing-port";
import {
  coordinateRotation,
  mintAndPostSubkey,
  onSubkeyRotated,
  retryOnRotationRace,
  retryUntilSubkeyReady,
  trackSubkeyRotationTransaction,
} from "../identity/session/rotation";
import {
  BrowserKeyStore,
  needsRotation,
} from "../identity/primitives/keystore";
import { findAccountKeyAuthority } from "../application/runtime/account-key-authority-registry";
import { loadLegacyIdentity, loadLegacySession } from "../application/runtime/legacy-secret-read-adapter";

// Hard timeouts on every signed request so a stalled fetch can't
// wedge the caller forever. 60s covers every JSON endpoint we send
// today; uploads get 5 minutes because encrypted attachment bodies
// can reach 8 MiB and slow networks still need a user-tolerable
// window. Per-request overrides via opts.timeoutMs.
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60_000;
export const UNAUTHORIZED_REQUEST_RETRY_DELAYS_MS = [0, 150, 350] as const;
export const SESSION_RECOVERY_TIMEOUT_MS = 10_000;

export class PuffoHttpClient {
  // Re-export for back-compat with existing WS subscribers.
  static onSubkeyRotated = onSubkeyRotated;

  private serverUrl: string;

  constructor(
    serverUrl: string,
    private readonly keyStore: BrowserKeyStore,
    private readonly crypto: CryptoOps,
    private readonly slug: string,
    private readonly isSessionCurrent?: () => boolean,
  ) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  signTypedEvent<T extends Record<string, unknown>>(
    signer: {
      slug: string;
      deviceId: string;
      subkeyId: string;
      subkeySecretKey: Uint8Array;
    },
    event: T,
  ): T {
    this.assertSessionCurrent();
    return transportSigningPort().signEvent(
      {
        serverUrl: this.serverUrl,
        slug: signer.slug,
        credential: {
          deviceId: signer.deviceId,
          keyId: signer.subkeyId,
          secretKey: signer.subkeySecretKey,
        },
        crypto: this.crypto,
      },
      event,
    );
  }

  async verifyTypedEvent(
    event: Record<string, unknown>,
    chain: Record<string, unknown>,
  ): Promise<boolean> {
    this.assertSessionCurrent();
    await this.ensureSubkey();
    const input = await this.transportSigningInput();
    return transportSigningPort().verifyEvent(input, event, chain);
  }

  private async transportSigningInput(): Promise<TransportSigningInput> {
    const owner = transportSigningPort().authority === "rust"
      ? findAccountKeyAuthority(this.serverUrl, this.slug) : null;
    const session = owner ? {
      device_id: owner.deviceId, subkey_id: owner.subkeyId,
      subkey_secret_key: new Uint8Array(0), expires_at: owner.subkeyExpiresAt ?? 0,
    } : await loadLegacySession(this.keyStore, this.slug);
    this.assertSessionCurrent();
    if (!session) throw new Error("No active session — subkey rotation failed");
    return {
      serverUrl: this.serverUrl,
      slug: this.slug,
      credential: {
        deviceId: session.device_id,
        keyId: session.subkey_id,
        secretKey: session.subkey_secret_key,
      },
      crypto: this.crypto,
    };
  }

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    const raw = body ? new TextEncoder().encode(JSON.stringify(body)) : new Uint8Array(0);
    return this.request<T>("POST", path, raw);
  }

  /// Signed POST with a raw-bytes body. Used by /blobs/upload, where
  /// the server reads the request body directly into a file (no JSON
  /// envelope). The signature still covers the body bytes verbatim.
  /// Defaults to the upload-timeout budget rather than the normal
  /// request budget; pass ``opts.timeoutMs`` to override.
  async postBytes<T = unknown>(
    path: string,
    bytes: Uint8Array,
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    return this.request<T>("POST", path, bytes, {
      timeoutMs: opts?.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS,
    });
  }

  async put<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    const raw = body ? new TextEncoder().encode(JSON.stringify(body)) : new Uint8Array(0);
    return this.request<T>("PUT", path, raw);
  }

  async patch<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    const raw = body ? new TextEncoder().encode(JSON.stringify(body)) : new Uint8Array(0);
    return this.request<T>("PATCH", path, raw);
  }

  async delete<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    const raw = body ? new TextEncoder().encode(JSON.stringify(body)) : new Uint8Array(0);
    return this.request<T>("DELETE", path, raw);
  }

  async postUnsigned<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    const raw = body ? JSON.stringify(body) : undefined;
    const resp = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
    });
    return this.handleResponse<T>(resp);
  }

  async getUnsigned<T = unknown>(path: string): Promise<T> {
    const resp = await fetch(`${this.serverUrl}${path}`);
    return this.handleResponse<T>(resp);
  }

  /// Signed GET that returns raw bytes — used by /blobs/{id} where
  /// the body is opaque (encrypted attachments) or an image. Browsers
  /// can't carry signed headers on ``<img src=...>``, so the caller
  /// is expected to wrap the result in ``URL.createObjectURL`` and
  /// hand THAT back to the img tag.
  async getBytes(path: string, opts?: { timeoutMs?: number }): Promise<Uint8Array> {
    await this.ensureSubkey();
    const resp = await this.requestWithSessionRecovery(
      "GET",
      path,
      new Uint8Array(0),
      opts?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new HttpError(resp.status, text);
    }
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  }

  private async request<T>(
    method: string,
    path: string,
    body: Uint8Array = new Uint8Array(0),
    opts?: { timeoutMs?: number },
  ): Promise<T> {
    await this.ensureSubkey();
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    const resp = await this.requestWithSessionRecovery(method, path, body, timeoutMs);

    return this.handleResponse<T>(resp);
  }

  private async requestWithSessionRecovery(
    method: string,
    path: string,
    body: Uint8Array,
    timeoutMs: number,
  ): Promise<Response> {
    if (method !== "GET" && method !== "HEAD") {
      this.assertSessionCurrent();
      return this.doRequest(method, path, body, timeoutMs);
    }
    let response = await this.doRequest(method, path, body, timeoutMs);
    if (response.status !== 401) return response;

    const recovery = (async () => {
      for (const delay of UNAUTHORIZED_REQUEST_RETRY_DELAYS_MS.slice(1)) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.assertSessionCurrent();
      response = await this.doRequest(method, path, body, timeoutMs);
      if (response.status !== 401) return response;
      }

      await this.recoverSession(this.assertSessionCurrent.bind(this));
      this.assertSessionCurrent();
      return this.doRequest(method, path, body, timeoutMs);
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HttpTimeoutError(
        method, path, SESSION_RECOVERY_TIMEOUT_MS,
      )), SESSION_RECOVERY_TIMEOUT_MS);
    });
    try {
      return await Promise.race([recovery, deadline]);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) throw error;
      if (error instanceof StaleHttpSessionError) throw error;
      if (error instanceof HttpTimeoutError) throw new SessionRecoveryError(error);
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async recoverSession(assertCurrent: () => void): Promise<void> {
    assertCurrent();
    await this.rotateSubkey(assertCurrent);
    await retryUntilSubkeyReady(async () => {
      assertCurrent();
      const response = await this.doRequest(
        "GET",
        "/spaces",
        new Uint8Array(0),
        DEFAULT_REQUEST_TIMEOUT_MS,
      );
      const body = await response.text();
      if (!response.ok) throw new HttpError(response.status, body);
    });
  }

  async signedHeaders(method: string, path: string): Promise<Record<string, string>> {
    await this.ensureSubkey();
    return this.authHeaders(method, path, new Uint8Array(0));
  }

  private async authHeaders(method: string, path: string, body: Uint8Array): Promise<Record<string, string>> {
    this.assertSessionCurrent();
    const owner = transportSigningPort().authority === "rust"
      ? findAccountKeyAuthority(this.serverUrl, this.slug) : null;
    const session = owner ? {
      device_id: owner.deviceId, subkey_id: owner.subkeyId,
      subkey_secret_key: new Uint8Array(0), expires_at: owner.subkeyExpiresAt ?? 0,
    } : await loadLegacySession(this.keyStore, this.slug);
    this.assertSessionCurrent();
    if (!session) {
      throw new Error("No active session — subkey rotation failed");
    }

    const auth = transportSigningPort().signHttp(
      {
        serverUrl: this.serverUrl,
        slug: this.slug,
        credential: {
          deviceId: session.device_id,
          keyId: session.subkey_id,
          secretKey: session.subkey_secret_key,
        },
        crypto: this.crypto,
      },
      method,
      path,
      body,
    );
    return authHeadersToRecord(auth);
  }

  private async doRequest(
    method: string,
    path: string,
    body: Uint8Array,
    timeoutMs: number,
  ): Promise<Response> {
    const headers = await this.authHeaders(method, path, body);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${this.serverUrl}${path}`, {
        method,
        headers,
        body: body.length > 0
          ? (body.buffer as ArrayBuffer).slice(body.byteOffset, body.byteOffset + body.byteLength)
          : undefined,
        signal: ctrl.signal,
      });
    } catch (err) {
      // fetch rejects with AbortError when the signal fires — translate
      // to the typed timeout so callers can branch on it.
      if (ctrl.signal.aborted) {
        throw new HttpTimeoutError(method, path, timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSubkey(): Promise<void> {
    this.assertSessionCurrent();
    const owner = transportSigningPort().authority === "rust"
      ? findAccountKeyAuthority(this.serverUrl, this.slug) : null;
    const session = owner ? {
      device_id: owner.deviceId, subkey_id: owner.subkeyId,
      subkey_secret_key: new Uint8Array(0), expires_at: owner.subkeyExpiresAt ?? 0,
    } : await loadLegacySession(this.keyStore, this.slug);
    this.assertSessionCurrent();
    if (!session || needsRotation(session.expires_at)) {
      await this.rotateSubkeyWithRetry(this.assertSessionCurrent.bind(this));
      return;
    }
    // Belt-and-suspenders against stale sessions left behind by an
    // identity rotation. saveIdentity clears the session when
    // device_id changes (keystore.ts), but a session row written by an
    // older client build can still slip past here. Without this check
    // the request signs under the old device's subkey.
    const identity = owner ? null : await loadLegacyIdentity(this.keyStore, this.slug);
    this.assertSessionCurrent();
    if (identity && session.device_id !== identity.device_id) {
      await this.rotateSubkeyWithRetry(this.assertSessionCurrent.bind(this));
    }
  }

  /** Ensure the persisted account subkey is usable before runtime hydration. */
  async ensureAccountSubkey(): Promise<void> {
    await this.ensureSubkey();
  }

  /// Post-enroll rotation: retries 401 + 400 DEVICE_NOT_FOUND while
  /// the just-committed device_cert / subkey_cert propagate.
  async rotateSubkeyWithRetry(assertCurrent?: () => void): Promise<Record<string, unknown>> {
    return trackSubkeyRotationTransaction(async () => {
      const assertOwner = assertCurrent ?? this.assertSessionCurrent.bind(this);
      assertOwner();
      const certificate = await retryOnRotationRace(() => this.rotateSubkey(assertOwner));
      await retryUntilSubkeyReady(async () => {
        assertOwner();
        const response = await this.doRequest(
          "GET",
          "/spaces",
          new Uint8Array(0),
          DEFAULT_REQUEST_TIMEOUT_MS,
        );
        const body = await response.text();
        if (!response.ok) throw new HttpError(response.status, body);
      });
      return certificate;
    });
  }

  async rotateSubkey(assertCurrent?: () => void): Promise<Record<string, unknown>> {
    const assertOwner = assertCurrent ?? this.assertSessionCurrent.bind(this);
    return coordinateRotation(this.serverUrl, this.slug, async () => {
      assertOwner();
      const identity = await loadLegacyIdentity(this.keyStore, this.slug);
      if (!identity) {
        throw new Error(`No identity found for slug: ${this.slug}`);
      }
      return mintAndPostSubkey({
        identity,
        crypto: this.crypto,
        keyStore: this.keyStore,
        serverUrl: this.serverUrl,
        slug: this.slug,
        assertCurrent: assertOwner,
      });
    });
  }

  private assertSessionCurrent(): void {
    if (this.isSessionCurrent && !this.isSessionCurrent()) {
      throw new StaleHttpSessionError();
    }
  }

  private async handleResponse<T>(resp: Response): Promise<T> {
    const text = await resp.text();
    if (!resp.ok) {
      throw new HttpError(resp.status, text);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
}

// Re-export rotation helpers from their new home so existing callers
// (agent provision flows) don't need an import-path bump in the same
// PR. New code should import directly from identity/session/rotation.
export {
  ROTATE_SUBKEY_RETRY_DELAYS_MS,
  SUBKEY_READINESS_RETRY_DELAYS_MS,
  isRotationRaceError,
  retryOnRotationRace,
  retryUntilSubkeyReady,
} from "../identity/session/rotation";
