import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, connect, type Server, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { transportSigningPort } from "../src/application/runtime/transport-signing-port";
import { PRESENCE_HEARTBEAT_MS } from "../src/huddo/presence";
import { homeDir, identityDir, loadConfig, loadState, readJson, writeJson, type Room } from "./home";
import { getRuntime, accountFor, activeSlug, type Account, type Runtime } from "./runtime";
import { fetchSince, latestSeqOf, rowFromEnvelope, type Row } from "./rows";
import { reportPresence } from "./presence";
import { fetchSystemRows, mergeByTime, sameCursor, type SystemCursor } from "./membership";
import {
  advanceCursor,
  setSystemCursor,
  cachedNames,
  errorText,
  resolveNames,
  resolveRoomArg,
  roomFor,
  sortedSpaces,
  UserError,
  type RoomMessages,
} from "./ops";
import { VERSION } from "./version";
import { buildStamp, daemonEndpoint, daemonLogPath, request as requestIpc } from "./ipc";

const BACKSTOP_MS = 30_000;
const POLL_WITHOUT_WS_MS = 3_000;
const IDENTITY_CHECK_MS = 5_000;
const HEALTHY_WINDOW_MS = 60_000;
const LOG_CAP_BYTES = 1024 * 1024;
const INBOX_CAP = 500;
const MAX_BACKOFF_MS = 30_000;

type LiveState = "online" | "busy";

interface Waiter {
  room: Room | null;
  resolve: () => void;
}

interface InboxFile {
  fetched?: Record<string, number>;
  rows?: Record<string, Row[]>;
}

let foreground = false;

function log(message: string): void {
  const line = `${new Date().toISOString()} [${process.pid}] ${message}\n`;
  if (foreground) process.stderr.write(line);
  try {
    const path = daemonLogPath();
    if (existsSync(path) && statSync(path).size > LOG_CAP_BYTES) renameSync(path, `${path}.1`);
    appendFileSync(path, line);
  } catch {}
}

class Session {
  readonly slug: string;
  private rooms = new Map<string, Room>();
  private fetched = new Map<string, number>();
  private inbox = new Map<string, Row[]>();
  private eventFetched = new Map<string, SystemCursor>();
  private pendingEvents = new Map<string, Row[]>();
  private waiters = new Set<Waiter>();
  private ws: WebSocket | null = null;
  private wsBackoff = 1_000;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private backfilling = new Map<string, Promise<void>>();
  private eventSyncing = new Map<string, Promise<void>>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  wsConnected = false;
  lastEventAt: number | null = null;
  lastOkAt: number | null = null;
  lastError: string | null = null;
  presence: LiveState = "online";
  readonly ready: Promise<void>;

  constructor(private readonly rt: Runtime, readonly acct: Account) {
    this.slug = acct.identity.slug;
    this.ready = this.start();
  }

  private get inboxPath() {
    return join(identityDir(this.slug), "inbox.json");
  }

  private async start(): Promise<void> {
    const saved = readJson<InboxFile>(this.inboxPath) ?? {};
    for (const [ch, seq] of Object.entries(saved.fetched ?? {})) this.fetched.set(ch, seq);
    for (const [ch, rows] of Object.entries(saved.rows ?? {})) this.inbox.set(ch, rows);
    await this.refreshRooms().catch((e) => this.fail(e));
    await this.backfillAll();
    this.synced = this.lastError === null;
    this.beat();
    this.every(PRESENCE_HEARTBEAT_MS, () => this.beat());
    this.every(BACKSTOP_MS, async () => {
      await this.refreshRooms().catch((e) => this.fail(e));
      await this.backfillAll();
    });
    if (typeof WebSocket === "undefined") {
      log("no global WebSocket in this Node version; polling instead");
      this.every(POLL_WITHOUT_WS_MS, () => this.backfillAll());
    } else {
      void this.connectWs();
    }
    log(`serving ${this.slug} with ${this.rooms.size} room(s)`);
  }

  private every(ms: number, work: () => unknown): void {
    const tick = () => {
      if (this.stopped) return;
      Promise.resolve()
        .then(work)
        .catch((e) => this.fail(e))
        .finally(() => {
          if (!this.stopped) this.timers.push(setTimeout(tick, ms));
        });
    };
    this.timers.push(setTimeout(tick, ms));
  }

  private ok(): void {
    this.lastOkAt = Date.now();
    this.lastError = null;
  }

  private fail(e: unknown): void {
    this.lastError = errorText(e);
    log(`error: ${this.lastError}`);
  }

  synced = false;

  failing(): boolean {
    if (this.wsConnected || this.lastError === null) return false;
    return this.lastOkAt === null || Date.now() - this.lastOkAt > HEALTHY_WINDOW_MS;
  }

  healthy(): boolean {
    return this.wsConnected || (this.lastOkAt !== null && Date.now() - this.lastOkAt < HEALTHY_WINDOW_MS && this.lastError === null);
  }

  roomList(): Room[] {
    return [...this.rooms.values()];
  }

  async refreshRooms(): Promise<void> {
    const spaces = await sortedSpaces(this.acct);
    const next = new Map<string, Room>();
    for (const space of spaces) {
      const room = await roomFor(this.acct, space).catch(() => null);
      if (room) next.set(room.channelId, room);
    }
    this.rooms = next;
    this.ok();
    const cursors = loadState(this.slug).cursors ?? {};
    for (const room of next.values()) {
      if (this.fetched.has(room.channelId)) continue;
      const cursor = cursors[room.channelId] ?? await latestSeqOf(this.acct.http, room.channelId);
      this.fetched.set(room.channelId, cursor);
      if (cursors[room.channelId] === undefined) advanceCursor(this.slug, room.channelId, cursor);
    }
  }

  async backfillAll(): Promise<void> {
    await Promise.all(this.roomList().map((room) => Promise.all([this.backfill(room.channelId), this.syncEvents(room)])));
  }

  private syncEvents(room: Room): Promise<void> {
    const prev = this.eventSyncing.get(room.channelId) ?? Promise.resolve();
    const work = prev.then(() => this.syncEventsOnce(room));
    this.eventSyncing.set(room.channelId, work);
    void work.finally(() => {
      if (this.eventSyncing.get(room.channelId) === work) this.eventSyncing.delete(room.channelId);
    });
    return work;
  }

  private async syncEventsOnce(room: Room): Promise<void> {
    const since = this.eventFetched.get(room.channelId) ?? loadState(this.slug).systemCursors?.[room.channelId];
    try {
      const got = await fetchSystemRows(this.acct.http, room, since);
      if (since === undefined) {
        this.eventFetched.set(room.channelId, got.cursor);
        setSystemCursor(this.slug, room.channelId, got.cursor);
        return;
      }
      if (sameCursor(got.cursor, since)) return;
      this.eventFetched.set(room.channelId, got.cursor);
      const fresh = got.rows.filter((r) => r.sender !== this.slug);
      if (!fresh.length) return;
      const pending = this.pendingEvents.get(room.channelId) ?? [];
      const known = new Set(pending.map((r) => r.id));
      this.pendingEvents.set(room.channelId, [...pending, ...fresh.filter((r) => !known.has(r.id))]);
      this.lastEventAt = Date.now();
      for (const w of [...this.waiters]) w.resolve();
    } catch (e) {
      this.fail(e);
    }
  }

  backfill(channelId: string): Promise<void> {
    const running = this.backfilling.get(channelId);
    if (running) return running.then(() => this.backfill(channelId));
    const work = (async () => {
      const cursor = Math.max(this.fetched.get(channelId) ?? 0, loadState(this.slug).cursors?.[channelId] ?? 0);
      try {
        const got = await fetchSince(this.acct.http, channelId, cursor);
        this.ok();
        this.synced = true;
        this.add(channelId, got.rows);
        this.fetched.set(channelId, Math.max(got.maxSeq, cursor));
        this.persist();
      } catch (e) {
        this.fail(e);
      }
    })().finally(() => this.backfilling.delete(channelId));
    this.backfilling.set(channelId, work);
    return work;
  }

  private add(channelId: string, rows: Row[]): void {
    if (!rows.length) return;
    const list = this.inbox.get(channelId) ?? [];
    const known = new Set(list.map((r) => r.seq));
    let added = false;
    for (const row of rows) {
      if (known.has(row.seq)) continue;
      list.push(row);
      known.add(row.seq);
      added = true;
      this.fetched.set(channelId, Math.max(this.fetched.get(channelId) ?? 0, row.seq));
    }
    if (!added) return;
    list.sort((a, b) => a.seq - b.seq);
    this.inbox.set(channelId, list.slice(-INBOX_CAP));
    this.lastEventAt = Date.now();
    this.persist();
    for (const w of [...this.waiters]) w.resolve();
  }

  private persist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const cursors = loadState(this.slug).cursors ?? {};
      const rows: Record<string, Row[]> = {};
      for (const [ch, list] of this.inbox) {
        const kept = list.filter((r) => r.seq > (cursors[ch] ?? 0));
        this.inbox.set(ch, kept);
        if (kept.length) rows[ch] = kept;
      }
      try {
        writeJson(this.inboxPath, { fetched: Object.fromEntries(this.fetched), rows });
      } catch (e) {
        this.fail(e);
      }
    }, 200);
  }

  private collect(room: Room | null): RoomMessages[] {
    const cursors = loadState(this.slug).cursors ?? {};
    const groups: RoomMessages[] = [];
    for (const r of room ? [room] : this.roomList()) {
      const cursor = cursors[r.channelId] ?? 0;
      const unread = (this.inbox.get(r.channelId) ?? []).filter((row) => row.seq > cursor);
      const fresh = unread.filter((row) => row.sender !== this.slug && !row.system);
      const events = this.pendingEvents.get(r.channelId) ?? [];
      if (fresh.length || events.length) groups.push({ room: r, rows: mergeByTime(fresh, events) });
    }
    return groups;
  }

  private consume(room: Room | null): void {
    for (const r of room ? [room] : this.roomList()) {
      const list = this.inbox.get(r.channelId) ?? [];
      const max = list.reduce((m, row) => Math.max(m, row.seq), 0);
      if (max) advanceCursor(this.slug, r.channelId, max);
      this.pendingEvents.delete(r.channelId);
      setSystemCursor(this.slug, r.channelId, this.eventFetched.get(r.channelId));
    }
    this.persist();
  }

  setPresence(state: LiveState): void {
    if (this.presence === state) return;
    this.presence = state;
    this.beat();
  }

  private beat(): void {
    void reportPresence(this.acct, this.presence);
  }

  async wait(roomArg: string | undefined, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    const bounded = <T>(work: Promise<T>) => {
      work.catch(() => undefined);
      return Promise.race([work, new Promise<undefined>((r) => setTimeout(() => r(undefined), Math.max(0, deadline - Date.now())))]);
    };
    await bounded(this.ready);
    let room: Room | null = null;
    if (roomArg) {
      room = this.roomList().find((r) => r.spaceId === roomArg) ?? null;
      if (!room) {
        room = (await bounded(resolveRoomArg(this.acct, roomArg))) ?? null;
        if (!room) return { groups: [], names: {}, synced: false };
        await bounded(this.refreshRooms().catch((e) => this.fail(e)));
      }
    }
    this.setPresence("online");
    if (!this.wsConnected) await bounded(this.backfillAll());
    for (;;) {
      const groups = this.collect(room);
      if (groups.length) {
        this.consume(room);
        this.setPresence("busy");
        const rows = groups.flatMap((g) => g.rows);
        const names = await Promise.race([
          resolveNames(this.acct, rows).catch(() => cachedNames()),
          new Promise<Record<string, string>>((r) => setTimeout(() => r(cachedNames()), Math.max(0, Math.min(2_000, deadline - Date.now())))),
        ]);
        return { groups, names, synced: true };
      }
      this.consume(room);
      const left = deadline - Date.now();
      if (left <= 0) {
        if (this.failing()) throw new NetworkErrorReply(this.lastError ?? "not connected to the Huddo server");
        return { groups: [], names: {}, synced: this.synced };
      }
      await new Promise<void>((resolveWait) => {
        const waiter: Waiter = {
          room,
          resolve: () => {
            clearTimeout(timer);
            this.waiters.delete(waiter);
            resolveWait();
          },
        };
        const timer = setTimeout(waiter.resolve, left);
        this.waiters.add(waiter);
      });
    }
  }

  private async connectWs(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.acct.http.ensureAccountSubkey();
      const session = await this.rt.keyStore.loadSession(this.slug);
      if (!session) throw new Error("no device session");
      const serverUrl = this.acct.identity.server_url.replace(/\/+$/, "");
      const ws = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/subscribe`);
      this.ws = ws;
      const renewAt = Math.max(60_000, session.expires_at - Date.now() - 10 * 60_000);
      const renew = setTimeout(() => ws.close(), Math.min(renewAt, 2 ** 31 - 1));
      ws.onopen = () => {
        ws.send(JSON.stringify(transportSigningPort().signWebSocket({
          serverUrl,
          slug: this.slug,
          credential: { deviceId: session.device_id, keyId: session.subkey_id, secretKey: session.subkey_secret_key },
          crypto: this.rt.crypto,
        })));
      };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(String(ev.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        this.onFrame(ws, frame);
      };
      ws.onclose = () => {
        clearTimeout(renew);
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.wsConnected) log("websocket closed");
        this.wsConnected = false;
        this.scheduleReconnect();
      };
      ws.onerror = () => undefined;
    } catch (e) {
      this.fail(e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.wsBackoff * (0.8 + Math.random() * 0.4);
    this.wsBackoff = Math.min(this.wsBackoff * 2, MAX_BACKOFF_MS);
    this.timers.push(setTimeout(() => void this.connectWs(), delay));
  }

  private onFrame(ws: WebSocket, frame: Record<string, unknown>): void {
    switch (frame.type) {
      case "connected":
        this.wsConnected = true;
        this.wsBackoff = 1_000;
        this.ok();
        log("websocket connected");
        void this.refreshRooms().catch((e) => this.fail(e)).then(() => this.backfillAll());
        break;
      case "message": {
        const envelope = frame.envelope as { type?: string; envelope_id?: string; signed_payload?: { payload?: { channel_id?: string } } } | undefined;
        if (envelope?.envelope_id) ws.send(JSON.stringify({ type: "ack", envelope_ids: [envelope.envelope_id] }));
        const channelId = envelope?.signed_payload?.payload?.channel_id;
        if (!channelId) break;
        this.lastEventAt = Date.now();
        if (this.rooms.has(channelId)) {
          const row = typeof frame.seq === "number" ? rowFromEnvelope(frame.seq, envelope, channelId) : null;
          if (row) this.add(channelId, [row]);
          void this.backfill(channelId);
        } else {
          void this.refreshRooms().catch((e) => this.fail(e)).then(() => this.backfill(channelId));
        }
        break;
      }
      case "event":
      case "space_update":
      case "channel_update":
      case "space_delete":
      case "channel_delete":
      case "space_membership_changed":
        void this.refreshRooms().catch((e) => this.fail(e)).then(() => this.backfillAll());
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.wsConnected = false;
    for (const w of [...this.waiters]) w.resolve();
  }
}

class NetworkErrorReply extends Error {}

export async function runDaemon(opts: { foreground: boolean }): Promise<void> {
  foreground = opts.foreground;
  try {
    mkdirSync(homeDir(), { recursive: true });
    appendFileSync(daemonLogPath(), "");
  } catch {}
  try {
    await serve();
  } catch (e) {
    log(`startup failed: ${errorText(e)}`);
    if (!foreground) process.exit(1);
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
    if (session && session.slug === slug) return session;
    if (session) {
      log(`switching from ${session.slug} to ${slug ?? "(none)"}`);
      session.stop();
      session = null;
    }
    if (slug) session = new Session(rt, accountFor(rt, slug));
    return session;
  };

  const handle = async (req: Record<string, unknown>): Promise<Record<string, unknown>> => {
    switch (req.op) {
      case "hello":
        sync();
        return { ok: true, pid: process.pid, build, home, slug: session?.slug ?? null, transport };
      case "status": {
        const s = sync();
        return {
          ok: true,
          pid: process.pid,
          home,
          build,
          version: VERSION,
          startedAt: new Date(startedAt).toISOString(),
          slug: s?.slug ?? null,
          wsConnected: s?.wsConnected ?? false,
          realtime: typeof WebSocket === "undefined" ? "polling" : "websocket",
          rooms: s?.roomList().map((r) => ({ spaceId: r.spaceId, name: r.name })) ?? [],
          lastEventAt: s?.lastEventAt ? new Date(s.lastEventAt).toISOString() : null,
          lastError: s?.lastError ?? null,
          presence: s?.presence ?? null,
          log: daemonLogPath(),
          transport,
        };
      }
      case "refresh": {
        const s = sync();
        if (s) await s.ready.then(() => s.refreshRooms()).then(() => s.backfillAll()).catch(() => undefined);
        return { ok: true };
      }
      case "presence": {
        const s = sync();
        if (s && req.slug === s.slug && (req.state === "online" || req.state === "busy")) s.setPresence(req.state);
        return { ok: true };
      }
      case "wait": {
        const s = sync();
        if (!s || s.slug !== req.slug) return { ok: false, code: "unserved", error: "daemon serves another identity" };
        try {
          const batch = await s.wait(typeof req.room === "string" ? req.room : undefined, Math.max(0, Number(req.timeoutMs) || 0));
          return { ok: true, ...batch };
        } catch (e) {
          if (e instanceof NetworkErrorReply) return { ok: false, code: "network", error: e.message };
          return { ok: false, code: e instanceof UserError ? "user" : "network", error: errorText(e) };
        }
      }
      case "stop":
        setTimeout(shutdown, 50);
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

  function shutdown(): void {
    log("stopping");
    session?.stop();
    server.close();
    if (transport === "unix") rmSync(endpoint, { force: true });
    rmSync(join(home, "daemon.json"), { force: true });
    setTimeout(() => process.exit(0), 100);
  }

  const infoPath = join(home, "daemon.json");
  const existing = readJson<{ transport?: string; port?: number; token?: string; pid?: number }>(infoPath);
  if (existing?.transport === "tcp" && existing.pid !== process.pid) {
    const reply = await requestIpc("hello", {}, { timeoutMs: 800 }).catch(() => null);
    if (reply?.ok) {
      log("another daemon is already running");
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
    if (loadConfig().active !== session?.slug) sync();
  }, IDENTITY_CHECK_MS);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("uncaughtException", (e) => log(`uncaught: ${errorText(e)}`));
  process.on("unhandledRejection", (e) => log(`unhandled: ${errorText(e)}`));
  await new Promise<void>(() => undefined);
}

function sameToken(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
