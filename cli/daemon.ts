import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer, connect, type Server, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { PRESENCE_HEARTBEAT_MS } from "../src/huddo/presence";
import { acquireProcessLock, homeDir, readJson, releaseProcessLock, writeJson } from "./home";
import { getRuntime, accountFor, activeSlug, type Account, type Runtime } from "./runtime";
import { reportPresence } from "./presence";
import { log, logToStderr } from "./daemon-log";
import { errorText, sortedSpaces } from "./ops";
import { VERSION } from "./version";
import { buildStamp, daemonEndpoint, daemonLogPath, recordDaemonFailure, request as requestIpc, sameToken } from "./ipc";
import { subscribeCoreEvents } from "../src/platform/web/core-runtime/core-events";
import { attachCore, detachCore } from "./core";
import type { CoreSession } from "../src/platform/web/core-runtime/bridge";

const IDENTITY_CHECK_MS = 5_000;

/** Core signs the session out on these; the daemon stops and says why instead of serving a dead identity. */
const DEVICE_GONE = new Set(["device_revoked", "device_expired", "operator_revoked"]);

export function deviceGone(event: { type: string } & Record<string, unknown>, slug: string): string | null {
  if (event.type === "session_closed" && event.slug === slug) return "core closed this identity's session";
  if (event.type !== "sync_failed") return null;
  const code = String(event.code ?? (event.error as { code?: unknown } | undefined)?.code ?? "");
  return DEVICE_GONE.has(code) ? `the server rejected this device (${code})` : null;
}

type RealtimeStatus = { state?: string; last_error?: string | null };
type RuntimeStatus = { realtime?: RealtimeStatus; last_error?: string | null; last_sync_at_ms?: number | null };

/**
 * The long-lived leader for this home: core syncs and keeps the relay socket open for every process, and the
 * daemon keeps the active identity present.
 */
export class Session {
  readonly slug: string;
  private timers: ReturnType<typeof setInterval>[] = [];
  private core: CoreSession | null = null;
  private readonly unsubscribe: () => void;
  lastError: string | null = null;
  readonly ready: Promise<void>;

  constructor(rt: Runtime, readonly acct: Account, stop: (why: string) => void) {
    this.slug = acct.identity.slug;
    this.unsubscribe = subscribeCoreEvents((events) => {
      const why = events.map((event) => deviceGone(event, this.slug)).find(Boolean);
      if (why) stop(why);
    });
    this.ready = attachCore(rt, this.slug).then(
      (core) => {
        this.core = core;
        this.beat();
        this.timers.push(setInterval(() => this.beat(), PRESENCE_HEARTBEAT_MS));
        log(`serving ${this.slug} through core`);
      },
      (e: unknown) => this.fail(e),
    );
  }

  private fail(e: unknown): void {
    this.lastError = errorText(e);
    log(`error: ${this.lastError}`);
  }

  private beat(): void {
    void reportPresence(this.acct, (e) => this.fail(e));
  }

  async runtime(): Promise<RuntimeStatus | null> {
    const outcome = await this.core?.client.call("query", JSON.stringify({ type: "runtime_status" })).catch(() => null);
    if (outcome?.status !== "done") return null;
    return (JSON.parse(outcome.envelope) as { ok?: RuntimeStatus }).ok ?? null;
  }

  stop(): void {
    this.unsubscribe();
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    detachCore();
  }
}

export async function runDaemon(opts: { foreground: boolean }): Promise<void> {
  logToStderr(opts.foreground);
  try {
    mkdirSync(homeDir(), { recursive: true });
    appendFileSync(daemonLogPath(), "");
  } catch {}
  try {
    await serve();
  } catch (e) {
    log(`startup failed: ${errorText(e)}`);
    if (!opts.foreground) process.exit(1);
    throw e;
  }
}

async function serve(): Promise<void> {
  const home = resolve(homeDir());
  const endpoint = daemonEndpoint();
  let transport: "pipe" | "unix" | "tcp" = process.platform === "win32" ? "pipe" : "unix";
  let token: string | null = null;
  const rt = await getRuntime();
  let session: Session | null = null;
  const startedAt = Date.now();
  const build = buildStamp();

  const sync = (): Session | null => {
    const slug = activeSlug();
    const device = slug ? rt.keyStore.identity(slug)?.device_id : undefined;
    if (session && session.slug === slug && (!device || device === session.acct.identity.device_id)) return session;
    if (session) {
      log(session.slug === slug ? `restarting ${slug} on device ${device}` : `switching from ${session.slug} to ${slug ?? "(none)"}`);
      session.stop();
      session = null;
    }
    if (slug) session = new Session(rt, accountFor(rt, slug), shutdown);
    return session;
  };

  const handle = async (req: Record<string, unknown>): Promise<Record<string, unknown>> => {
    switch (req.op) {
      case "hello":
        sync();
        return { ok: true, pid: process.pid, build, home, slug: session?.slug ?? null, transport };
      case "status": {
        const s = sync();
        const core = await s?.runtime();
        const rooms = s ? await sortedSpaces(s.acct).catch(() => []) : [];
        return {
          ok: true,
          pid: process.pid,
          home,
          build,
          version: VERSION,
          startedAt: new Date(startedAt).toISOString(),
          slug: s?.slug ?? null,
          wsConnected: core?.realtime?.state === "live",
          realtime: typeof WebSocket === "undefined" ? "polling" : "websocket",
          rooms: rooms.map((r) => ({ spaceId: r.id, name: r.name })),
          lastEventAt: core?.last_sync_at_ms ? new Date(core.last_sync_at_ms).toISOString() : null,
          lastError: s?.lastError ?? core?.last_error ?? core?.realtime?.last_error ?? null,
          log: daemonLogPath(),
          transport,
        };
      }
      case "refresh":
        await sync()?.ready;
        return { ok: true };
      case "stop":
        setTimeout(() => shutdown(), 50);
        return { ok: true, pid: process.pid };
      default:
        return { ok: false, error: `unknown op ${String(req.op)}` };
    }
  };

  const server: Server = createServer((socket: Socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const nl = buffer.indexOf("\n");
      if (nl < 0) return;
      const line = buffer.slice(0, nl);
      buffer = "";
      let req: Record<string, unknown>;
      try {
        req = JSON.parse(line) as Record<string, unknown>;
      } catch {
        socket.end(`${JSON.stringify({ ok: false, error: "bad request" })}\n`);
        return;
      }
      if (token && !sameToken(req.token, token)) {
        socket.end(`${JSON.stringify({ ok: false, code: "auth", error: "bad token" })}\n`);
        return;
      }
      handle(req).then(
        (reply) => {
          if (!socket.destroyed) socket.end(`${JSON.stringify(reply)}\n`);
        },
        (e) => {
          if (!socket.destroyed) socket.end(`${JSON.stringify({ ok: false, error: errorText(e) })}\n`);
        },
      );
    });
    socket.on("error", () => undefined);
  });

  const lockPath = join(home, "daemon.lock");
  function shutdown(why?: string): void {
    log(why ? `error: stopping: ${why}` : "stopping");
    if (why) recordDaemonFailure(why, session?.acct.identity.device_id);
    session?.stop();
    server.close();
    if (transport === "unix") rmSync(endpoint, { force: true });
    rmSync(join(home, "daemon.json"), { force: true });
    releaseProcessLock(lockPath);
    setTimeout(() => process.exit(0), 100);
  }

  if (!acquireProcessLock(lockPath)) {
    log("another daemon is already running");
    return;
  }
  const infoPath = join(home, "daemon.json");
  const existing = readJson<{ transport?: string; port?: number; token?: string; pid?: number }>(infoPath);
  if (existing?.transport === "tcp" && existing.pid !== process.pid) {
    const reply = await requestIpc("hello", {}, { timeoutMs: 800 }).catch(() => null);
    if (reply?.ok) {
      log("another daemon is already running");
      releaseProcessLock(lockPath);
      return;
    }
  }

  const listenOn = (target: string | { host: string; port: number }) =>
    new Promise<void>((resolveListen, reject) => {
      const onError = (e: Error) => reject(e);
      server.once("error", onError);
      server.listen(target as never, () => {
        server.off("error", onError);
        resolveListen();
      });
    });

  let listenedOn = endpoint;
  let localError: string | null = null;
  if (process.env.HUDDO_DAEMON_TRANSPORT !== "tcp") {
    if (transport === "unix" && existsSync(endpoint)) {
      const alive = await new Promise<boolean>((r) => {
        const probe = connect(endpoint);
        probe.on("connect", () => {
          probe.destroy();
          r(true);
        });
        probe.on("error", () => r(false));
      });
      if (alive) {
        log("another daemon is already running");
        releaseProcessLock(lockPath);
        return;
      }
      rmSync(endpoint, { force: true });
    }
    try {
      await listenOn(endpoint);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "EADDRINUSE") {
        log("another daemon is already running");
        releaseProcessLock(lockPath);
        process.exit(0);
      }
      localError = `${transport === "pipe" ? "named pipe" : "unix socket"}: ${err.message}`;
      log(`local ${localError}; falling back to loopback TCP`);
      transport = "tcp";
    }
  } else {
    transport = "tcp";
  }
  if (transport === "tcp") {
    token = randomBytes(32).toString("hex");
    await listenOn({ host: "127.0.0.1", port: 0 }).catch((e: Error) => {
      throw new Error(`local IPC unavailable (${localError ? `${localError}; ` : ""}loopback TCP: ${e.message})`);
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    listenedOn = `127.0.0.1:${port}`;
    writeJson(infoPath, { pid: process.pid, transport, port, token, startedAt: new Date(startedAt).toISOString(), build });
  } else {
    writeJson(infoPath, { pid: process.pid, transport, endpoint, startedAt: new Date(startedAt).toISOString(), build });
  }
  log(`daemon listening on ${listenedOn} via ${transport} (active: ${activeSlug() ?? "none"})`);
  sync();

  setInterval(() => {
    if (!existsSync(home)) {
      log("HUDDO_HOME is gone");
      shutdown();
      return;
    }
    sync();
  }, IDENTITY_CHECK_MS);
  process.on("SIGTERM", () => shutdown());
  process.on("SIGINT", () => shutdown());
  process.on("uncaughtException", (e) => log(`uncaught: ${errorText(e)}`));
  process.on("unhandledRejection", (e) => log(`unhandled: ${errorText(e)}`));
  await new Promise<void>(() => undefined);
}
