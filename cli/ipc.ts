import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SERVER_URL, homeDir, listIdentitySlugs, loadConfig, readJson, removeFile, writeJson } from "./home";
import { Deadline, NetworkError } from "./deadline";
import type { MessageBatch, WaitOptions } from "./ops";

export interface DaemonHello {
  pid: number;
  build: string;
  home: string;
  slug: string | null;
  transport?: string;
}

export interface DaemonReply {
  ok: boolean;
  error?: string;
  code?: "network" | "user" | "unserved" | "auth";
  [key: string]: unknown;
}

export interface DaemonInfo {
  pid: number;
  transport: "pipe" | "unix" | "tcp";
  endpoint?: string;
  port?: number;
  token?: string;
  build?: string;
  startedAt?: string;
}

const HANDSHAKE_MS = 8_000;
const BACKGROUND_HANDSHAKE_MS = 3_000;
const FAILURE_BACKOFF_MS = 60_000;

export function daemonEnabled(): boolean {
  return process.env.HUDDO_DAEMON !== "0";
}

export function daemonEndpoint(): string {
  const home = resolve(homeDir());
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\huddo-${createHash("sha256").update(home.toLowerCase()).digest("hex").slice(0, 16)}`;
  }
  return join(home, "daemon.sock");
}

export const daemonInfoPath = () => join(homeDir(), "daemon.json");
const failurePath = () => join(homeDir(), "daemon-failed.json");

export function daemonLogPath(): string {
  return join(homeDir(), "daemon.log");
}

export function scriptPath(): string {
  return resolve(process.argv[1] ?? "");
}

export function buildStamp(): string {
  try {
    const st = statSync(scriptPath());
    return `${st.size}:${Math.floor(st.mtimeMs)}:${SERVER_URL}`;
  } catch {
    return "unknown";
  }
}

function openSocket(): { socket: Socket; token?: string } {
  const info = readJson<DaemonInfo>(daemonInfoPath());
  if (info?.transport === "tcp" && info.port && info.token) {
    return { socket: connect({ host: "127.0.0.1", port: info.port }), token: info.token };
  }
  return { socket: connect(daemonEndpoint()) };
}

export function request(
  op: string,
  payload: Record<string, unknown> = {},
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<DaemonReply> {
  return new Promise((resolvePromise, reject) => {
    let socket: Socket;
    let token: string | undefined;
    let buffer = "";
    let settled = false;
    const done = (error: Error | null, reply?: DaemonReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      socket?.destroy();
      if (error) reject(error);
      else resolvePromise(reply!);
    };
    const onAbort = () => done(new Error("aborted"));
    const timer = setTimeout(() => done(new Error("daemon did not answer in time")), opts.timeoutMs ?? 2_000);
    try {
      ({ socket, token } = openSocket());
    } catch (e) {
      clearTimeout(timer);
      reject(e as Error);
      return;
    }
    opts.signal?.addEventListener("abort", onAbort);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify({ op, ...payload, ...(token ? { token } : {}) })}\n`));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const nl = buffer.indexOf("\n");
      if (nl < 0) return;
      try {
        done(null, JSON.parse(buffer.slice(0, nl)) as DaemonReply);
      } catch (e) {
        done(e as Error);
      }
    });
    socket.on("error", (e) => done(e));
    socket.on("close", () => done(new Error("daemon closed the connection")));
  });
}

export async function hello(timeoutMs = 1_000): Promise<DaemonHello | null> {
  try {
    const reply = await request("hello", {}, { timeoutMs });
    return reply.ok ? (reply as unknown as DaemonHello) : null;
  } catch {
    return null;
  }
}

function lastLogProblem(): string | null {
  try {
    const lines = readFileSync(daemonLogPath(), "utf8").trim().split("\n").slice(-20).reverse();
    const hit = lines.find((l) => /startup failed|error:|uncaught/.test(l));
    return hit ? hit.replace(/^\S+ \[\d+\] /, "").replace(/^(startup failed|error): /, "") : null;
  } catch {
    return null;
  }
}

let warned = false;

export function warnDaemonUnavailable(reason: string): void {
  if (warned) return;
  warned = true;
  process.stderr.write(`warning: huddo daemon unavailable (${reason}); using direct mode\n`);
}

function recentFailure(): string | null {
  const failed = readJson<{ at: number; reason: string }>(failurePath());
  if (!failed || Date.now() - failed.at > FAILURE_BACKOFF_MS) return null;
  return failed.reason;
}

function spawnDaemon(): { exited: () => string | null } {
  let exitReason: string | null = null;
  const child = spawn(process.execPath, [scriptPath(), "daemon", "run"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    cwd: tmpdir(),
    env: { ...process.env, HUDDO_HOME: resolve(homeDir()) },
  });
  child.on("error", (e) => {
    exitReason = `spawn failed: ${e.message}`;
  });
  child.on("exit", (code, signal) => {
    exitReason = `daemon exited during startup (${signal ?? `code ${code}`})`;
  });
  child.unref();
  return { exited: () => exitReason };
}

export interface EnsureResult {
  hello: DaemonHello | null;
  reason?: string;
}

export async function ensureDaemon(opts: { wait: boolean; timeoutMs?: number; background?: boolean }): Promise<EnsureResult> {
  if (!daemonEnabled()) return { hello: null, reason: "disabled by HUDDO_DAEMON=0" };
  if (!existsSync(homeDir()) || !scriptPath().endsWith(".mjs")) return { hello: null, reason: "not running from the huddo.mjs bundle" };
  const running = await hello(opts.wait ? 1_000 : 400);
  if (running && running.build === buildStamp()) return { hello: running };
  const failed = running ? null : recentFailure();
  if (failed) return { hello: null, reason: failed };
  if (running) {
    await request("stop", {}, { timeoutMs: 1_000 }).catch(() => undefined);
    const gone = Date.now() + 1_500;
    while (Date.now() < gone && (await hello(300))) await new Promise((r) => setTimeout(r, 50));
  }
  const child = spawnDaemon();
  if (!opts.wait) return { hello: null };
  const limit = opts.background ? BACKGROUND_HANDSHAKE_MS : HANDSHAKE_MS;
  const deadline = Date.now() + Math.min(opts.timeoutMs ?? limit, limit);
  let reason: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const up = await hello(Math.max(100, Math.min(1_000, deadline - Date.now())));
    if (up && up.build === buildStamp()) {
      removeFile(failurePath());
      return { hello: up };
    }
    if ((reason = child.exited())) break;
  }
  const detail = lastLogProblem() ?? reason ?? `no handshake within ${Math.round((Date.now() - deadline + limit) / 1000)}s`;
  const why = reason && detail !== reason ? `${detail}; ${reason}` : detail;
  if (reason) writeJson(failurePath(), { at: Date.now(), reason: why });
  return { hello: null, reason: why };
}

export async function ensureDaemonReporting(opts: { background: boolean }): Promise<void> {
  const result = await ensureDaemon({ wait: true, background: opts.background });
  if (!result.hello && result.reason && daemonEnabled()) warnDaemonUnavailable(result.reason);
}

export function hasActiveIdentity(): boolean {
  const active = loadConfig().active;
  return !!active && listIdentitySlugs().includes(active);
}

export async function notifyDaemon(op: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (!daemonEnabled()) return;
  await request(op, payload, { timeoutMs: 1_500 }).catch(() => undefined);
}

export async function waitViaDaemon(slug: string, opts: WaitOptions): Promise<MessageBatch | null> {
  const dl = new Deadline(opts.deadline, opts.signal);
  const ensured = await ensureDaemon({ wait: true, timeoutMs: Math.max(0, dl.remaining() - 500) });
  if (!ensured.hello) {
    if (ensured.reason) warnDaemonUnavailable(ensured.reason);
    return null;
  }
  if (dl.expired()) return { groups: [], names: {}, synced: false };
  let reply: DaemonReply;
  try {
    reply = await request(
      "wait",
      { slug, room: opts.room, timeoutMs: Math.max(0, dl.remaining() - 250) },
      { timeoutMs: dl.remaining() + 1_000, signal: opts.signal },
    );
  } catch (e) {
    if (dl.expired()) return { groups: [], names: {}, synced: false };
    warnDaemonUnavailable(`local IPC failed: ${(e as Error).message}`);
    return null;
  }
  if (reply.ok) {
    return {
      groups: reply.groups as MessageBatch["groups"],
      names: (reply.names ?? {}) as Record<string, string>,
      synced: reply.synced !== false,
    };
  }
  if (reply.code === "unserved") return null;
  if (reply.code === "network") throw new NetworkError(`cannot reach the Huddo server: ${reply.error ?? "unknown error"}`);
  throw new Error(reply.error ?? "daemon error");
}
