import type { CryptoOps } from "./types";
import { HttpError, HttpTimeoutError, SessionRecoveryError, StaleHttpSessionError } from "./types";
import { authHeadersToRecord } from "../identity/session/signing";
import { transportSigningPort } from "../application/runtime/transport-signing-port";
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
import { loadLegacyIdentity, loadLegacySession } from "../application/runtime/legacy-secret-read-adapter";
import { coreHttpTransportFor, coreOwnsAcks } from "./core-transport-port";

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60_000;
export const UNAUTHORIZED_REQUEST_RETRY_DELAYS_MS = [0, 150, 350] as const;
export const SESSION_RECOVERY_TIMEOUT_MS = 10_000;

const rotationsInFlight = new Map<string, Promise<Record<string, unknown>>>();

export class PuffoHttpClient {
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

  get baseUrl(): string {
    return this.serverUrl;
  }

  async get<T = unknown>(path: string): Promise<T> {
    if (path.startsWith("/messages/pending") && coreOwnsAcks(this.serverUrl, this.slug)) return { messages: [] } as T;
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

  async post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
    if (path === "/messages/ack" && coreOwnsAcks(this.serverUrl, this.slug)) return {} as T;
    const raw = body ? new TextEncoder().encode(JSON.stringify(body)) : new Uint8Array(0);
    return this.request<T>("POST", path, raw);
  }

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

  async getBytes(path: string, opts?: { timeoutMs?: number }): Promise<Uint8Array> {
    if (!this.viaCore("GET", path)) await this.ensureSubkey();
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
    if (!this.viaCore(method, path)) await this.ensureSubkey();
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
    if (this.viaCore(method, path)) return this.doRequest(method, path, body, timeoutMs);
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
    const session = await loadLegacySession(this.keyStore, this.slug);
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
    const core = coreHttpTransportFor(this.serverUrl, this.slug, method, path);
    if (core) {
      this.assertSessionCurrent();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HttpTimeoutError(method, path, timeoutMs)), timeoutMs);
      });
      try {
        return await Promise.race([core.send(method, path, body), deadline]);
      } finally {
        clearTimeout(timer);
      }
    }
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
      if (ctrl.signal.aborted) {
        throw new HttpTimeoutError(method, path, timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private viaCore(method: string, path: string): boolean {
    return coreHttpTransportFor(this.serverUrl, this.slug, method, path) !== null;
  }

  private async ensureSubkey(): Promise<void> {
    this.assertSessionCurrent();
    const session = await loadLegacySession(this.keyStore, this.slug);
    this.assertSessionCurrent();
    if (!session || needsRotation(session.expires_at)) {
      await this.rotateSubkeyWithRetry(this.assertSessionCurrent.bind(this));
      return;
    }
    const identity = await loadLegacyIdentity(this.keyStore, this.slug);
    this.assertSessionCurrent();
    if (identity && session.device_id !== identity.device_id) {
      await this.rotateSubkeyWithRetry(this.assertSessionCurrent.bind(this));
    }
  }

  async ensureAccountSubkey(): Promise<void> {
    await this.ensureSubkey();
  }

  async rotateSubkeyWithRetry(assertCurrent?: () => void): Promise<Record<string, unknown>> {
    const key = `${this.serverUrl}|${this.slug}`;
    const shared = rotationsInFlight.get(key);
    if (shared) return shared;
    const run = this.rotateSubkeyOnce(assertCurrent).finally(() => {
      if (rotationsInFlight.get(key) === run) rotationsInFlight.delete(key);
    });
    rotationsInFlight.set(key, run);
    return run;
  }

  private async rotateSubkeyOnce(assertCurrent?: () => void): Promise<Record<string, unknown>> {
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

export {
  ROTATE_SUBKEY_RETRY_DELAYS_MS,
  SUBKEY_READINESS_RETRY_DELAYS_MS,
  isRotationRaceError,
  retryOnRotationRace,
  retryUntilSubkeyReady,
} from "../identity/session/rotation";
