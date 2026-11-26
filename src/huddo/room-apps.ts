import { HttpError } from "../http/types";
import type { SignedHttp } from "./presence";
import { cachedRequest, forgetCachedRequest, storeCachedRequest } from "./request-cache";

export type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "test"; path: string; value: unknown };

export interface AppMeta {
  app_id: string;
  name: string;
  version: number;
  schema_version: number;
  write_access: "members" | "owner";
  enabled: boolean;
  description: string;
  guide: string;
  revision: number;
  published_by: string;
  updated_at: number;
  is_page?: boolean;
}

export interface AppStateSnapshot<S = Record<string, unknown>> {
  app_id: string;
  version: number;
  schema_version: number;
  revision: number;
  state: S;
}

export interface PublishInput {
  name: string;
  schema_version: number;
  code: string;
  write_access?: "members" | "owner";
  enabled?: boolean;
  description?: string;
  guide?: string;
  initial_state?: Record<string, unknown>;
  reset_state?: boolean;
}

export interface SettingsInput {
  enabled?: boolean;
  write_access?: "members" | "owner";
}

export interface OpsInput {
  request_id: string;
  schema_version: number;
  app_version?: number;
  expected_revision?: number;
  ops: PatchOp[];
}

export const APP_ERROR_CODES = [
  "REVISION_CONFLICT",
  "IDEMPOTENCY_MISMATCH",
  "VERSION_MISMATCH",
  "QUOTA_EXCEEDED",
  "APP_DISABLED",
  "READ_ONLY",
  "PATCH_FAILED",
  "TEST_FAILED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number] | "UNKNOWN";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly status = 0,
    /** The failure this wraps. An app gets the code and message; a screen reads this (huddo/error-text.ts). */
    readonly source: unknown = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof HttpError) {
    try {
      const body = JSON.parse(err.body) as { error?: string; message?: string };
      const code = (APP_ERROR_CODES as readonly string[]).includes(body.error ?? "") ? (body.error as AppErrorCode) : "UNKNOWN";
      return new AppError(code, body.message ?? err.message, err.status, err);
    } catch {
      return new AppError("UNKNOWN", err.message, err.status, err);
    }
  }
  return new AppError("UNKNOWN", err instanceof Error ? err.message : String(err), 0, err);
}

const enc = encodeURIComponent;
const base = (spaceId: string) => `/v2/apps/space/${enc(spaceId)}`;

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toAppError(err);
  }
}

export function listApps(http: SignedHttp, spaceId: string): Promise<AppMeta[]> {
  return call(async () => (await http.get<{ apps: AppMeta[] }>(base(spaceId))).apps);
}

export function publishApp(http: SignedHttp, spaceId: string, appId: string, input: PublishInput): Promise<AppMeta> {
  return call(() => http.put<AppMeta>(`${base(spaceId)}/${enc(appId)}`, input as unknown as Record<string, unknown>));
}

export function updateAppSettings(http: SignedHttp, spaceId: string, appId: string, input: SettingsInput): Promise<AppMeta> {
  return call(() => http.post<AppMeta>(`${base(spaceId)}/${enc(appId)}/settings`, input as unknown as Record<string, unknown>));
}

export function deleteApp(http: SignedHttp, spaceId: string, appId: string): Promise<void> {
  return call(async () => {
    await http.delete(`${base(spaceId)}/${enc(appId)}`);
  });
}

export function getAppState<S = Record<string, unknown>>(http: SignedHttp, spaceId: string, appId: string): Promise<AppStateSnapshot<S>> {
  return call(() => http.get<AppStateSnapshot<S>>(`${base(spaceId)}/${enc(appId)}/state`));
}

export function getAppCode(http: SignedHttp, spaceId: string, appId: string): Promise<{ code: string; version: number; schema_version: number }> {
  return call(() => http.get(`${base(spaceId)}/${enc(appId)}/code`));
}

export interface AppVersionMeta {
  version: number;
  name: string;
  published_by: string;
  published_at: number;
  archived_at: number | null;
}

export interface AppVersion extends AppVersionMeta {
  app_id: string;
  schema_version: number;
  code: string;
  state: Record<string, unknown>;
  revision: number;
  current: number | null;
  /** The Home assets this version was published with; servers before version assets leave it out. */
  assets?: unknown;
}

/** Replaced versions this session has opened, as "space:app:version". They are read-only: no ops for them leave here. */
const keptVersions = new Set<string>();

/** Whether this version is a replaced one that this session opened, which takes no changes. */
export const isKeptVersion = (spaceId: string, appId: string, version: number) => keptVersions.has(`${spaceId}:${appId}:${version}`);

/**
 * One kept version, fetched once per session. Its code goes into the code cache, so an app frame given this version's
 * meta shows it without asking the server for the live code.
 */
export function getAppVersion(http: SignedHttp, spaceId: string, appId: string, version: number): Promise<AppVersion> {
  return call(() =>
    cachedRequest(
      `app-version:${spaceId}:${appId}:${version}`,
      async () => {
        const out = await http.get<AppVersion>(`${base(spaceId)}/${enc(appId)}/versions/${version}`);
        storeCachedRequest(codeKey(spaceId, { ...out, app_id: appId }), { code: out.code, version: out.version, schema_version: out.schema_version });
        // The server also answers with the live version (archived_at null), which stays writable.
        if (out.archived_at !== null) keptVersions.add(`${spaceId}:${appId}:${out.version}`);
        return out;
      },
      Infinity,
    ),
  );
}

const codeKey = (spaceId: string, meta: Pick<AppMeta, "app_id" | "version" | "schema_version">) => `app-code:${spaceId}:${meta.app_id}:${meta.version}:${meta.schema_version}`;

/** Code for this app version, fetched once per session; a response for another version is not kept. */
export async function cachedAppCode(
  http: SignedHttp,
  spaceId: string,
  meta: Pick<AppMeta, "app_id" | "version" | "schema_version">,
): Promise<{ code: string; version: number; schema_version: number }> {
  const key = codeKey(spaceId, meta);
  const out = await cachedRequest(key, () => getAppCode(http, spaceId, meta.app_id), Infinity);
  if (out.version !== meta.version || out.schema_version !== meta.schema_version) forgetCachedRequest(key);
  return out;
}

export function submitOps(http: SignedHttp, spaceId: string, appId: string, input: OpsInput): Promise<{ revision: number; replayed: boolean }> {
  if (input.app_version !== undefined && isKeptVersion(spaceId, appId, input.app_version))
    return Promise.reject(new AppError("READ_ONLY", `this is version ${input.app_version}, kept read-only; open the latest version to make changes`));
  return call(() => http.post(`${base(spaceId)}/${enc(appId)}/ops`, input as unknown as Record<string, unknown>));
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export interface AppUpdateFrame {
  type: "app_update";
  space_id: string;
  app_id: string;
  revision: number;
  version: number;
  updated_at?: number;
  base_revision?: number;
  ops?: PatchOp[];
  state_sha256?: string;
}

export function isAppUpdate(frame: unknown): frame is AppUpdateFrame {
  const f = frame as Partial<AppUpdateFrame> | null;
  return Boolean(f && f.type === "app_update" && typeof f.space_id === "string" && typeof f.app_id === "string" && typeof f.revision === "number");
}

const utf8 = new TextEncoder();

function compareKeys(a: string, b: string): number {
  const x = utf8.encode(a);
  const y = utf8.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort(compareKeys)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function stateSha256(state: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8.encode(canonicalJson(state)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function pointer(path: string): string[] {
  if (!path.startsWith("/")) throw new Error(`bad path ${path}`);
  return path
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function index(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === "-") return length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new Error(`bad index ${token}`);
  const i = Number(token);
  if (i > (allowEnd ? length : length - 1)) throw new Error(`index ${i} out of range`);
  return i;
}

export function applyPatchLocal<S>(state: S, ops: PatchOp[]): S {
  const next = structuredClone(state) as unknown;
  for (const op of ops) {
    if (op.op === "test") continue;
    const tokens = pointer(op.path);
    const last = tokens.pop() as string;
    let parent = next as Record<string, unknown> | unknown[];
    for (const t of tokens) {
      const child: unknown = Array.isArray(parent) ? parent[index(t, parent.length, false)] : parent[t];
      if (!child || typeof child !== "object") throw new Error(`missing ${t}`);
      parent = child as Record<string, unknown> | unknown[];
    }
    if (Array.isArray(parent)) {
      if (op.op === "add") parent.splice(index(last, parent.length, true), 0, structuredClone(op.value));
      else if (op.op === "replace") parent[index(last, parent.length, false)] = structuredClone(op.value);
      else parent.splice(index(last, parent.length, false), 1);
    } else {
      if (op.op !== "add" && !(last in parent)) throw new Error(`missing ${last}`);
      if (op.op === "remove") delete parent[last];
      else parent[last] = structuredClone(op.value);
    }
  }
  return next as S;
}
