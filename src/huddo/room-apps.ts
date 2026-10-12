import { HttpError } from "../http/types";
import type { SignedHttp } from "./presence";

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
  banner: boolean;
  description: string;
  guide: string;
  revision: number;
  published_by: string;
  updated_at: number;
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
  banner?: boolean;
  description?: string;
  guide?: string;
  initial_state?: Record<string, unknown>;
  reset_state?: boolean;
}

export interface SettingsInput {
  enabled?: boolean;
  banner?: boolean;
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
      return new AppError(code, body.message ?? err.message, err.status);
    } catch {
      return new AppError("UNKNOWN", err.message, err.status);
    }
  }
  return new AppError("UNKNOWN", err instanceof Error ? err.message : String(err));
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

export function submitOps(http: SignedHttp, spaceId: string, appId: string, input: OpsInput): Promise<{ revision: number; replayed: boolean }> {
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
