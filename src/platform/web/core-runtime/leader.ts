import { StaleLegacyKeysError, STALE_LEGACY_KEYS } from "./legacy-identity";
import type { Build, CallKind, Channel, ChannelMessage, CoreEvent } from "./protocol";

export type RuntimeHandle = Readonly<{
  nextOperationId(): bigint;
  execute(operationId: bigint, timeoutMs: bigint, commandJson: string): string;
  query(queryJson: string): string;
  request(requestJson: string): string;
  eventsSince(afterSeq: bigint): string;
  poll(): void;
  stop(): void;
}>;

export type SocketLike = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { reason: string }) => void) | null;
  send(text: string): void;
  close(): void;
};

export type SignedSend = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: Uint8Array },
) => Promise<{ status: number; body: Uint8Array }>;

export type LeaderOptions = Readonly<{
  epoch: string;
  /** Announced with the epoch, so a tab of a newer build can ask this leader to step down. */
  build?: Build;
  onStepDown?(): void;
  openSocket(url: string): SocketLike;
  /** With `apiUrl`, core only signs `signed_request` and the Worker sends it, so core is free while it waits. */
  send?: SignedSend;
  apiUrl?: string;
  /** Runs queued calls after the channel messages already waiting; defaults to a MessageChannel hop. */
  defer?(run: () => void): void;
  now?(): number;
  migrate?(payload: string): Promise<string>;
  signup?(payload: string, execute: (command: string) => string, query: (query: string) => string): Promise<string>;
}>;

type EventsEnvelope = { ok?: { events: CoreEvent[]; truncated: boolean; latest_seq: number } };

const REMEMBERED_CALLS = 512;
export const MAX_IN_FLIGHT = 16;
/** Ticks background sync may yield in a row to waiting calls before it runs anyway. */
export const MAX_YIELDED_TICKS = 8;
/** The relay pings every 30 s; this long without a frame means the socket died without closing. */
export const SOCKET_SILENCE_MS = 75_000;

type QueuedCall = { id: string; kind: CallKind; payload: string; network: NetworkCall | null };

function nextTask(run: () => void): void {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    port1.close();
    run();
  };
  port2.postMessage(null);
}
type SignedTarget = { target: string; headers: Record<string, string>; body_b64: string | null };
type Reply<T> = { ok: T } | { envelope: string };

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** One GET by id: core signs with the first name, the Worker sends, core stores the reply with the second. */
const FETCHES: Readonly<Record<string, readonly [string, string]>> = {
  fetch_message: ["message_request", "store_message"],
  fetch_history_around: ["history_around_request", "store_history_around"],
};
const WORKER_SENT = new Set(["signed_request", "backfill_channel_history", ...Object.keys(FETCHES)]);

type NetworkCall = { v: number; name: string; payload: Record<string, unknown> };

function networkCall(kind: CallKind, payload: string): NetworkCall | null {
  if (kind !== "request") return null;
  try {
    const parsed = JSON.parse(payload) as Partial<NetworkCall>;
    return parsed.name && WORKER_SENT.has(parsed.name) ? { v: parsed.v ?? 2, name: parsed.name, payload: parsed.payload ?? {} } : null;
  } catch {
    return null;
  }
}

const errorEnvelope = (code: string, error: unknown) =>
  JSON.stringify({
    v: 2,
    err: { code, category: "internal", retryable: false, message: error instanceof Error ? error.message : String(error) },
  });

/** Leader side of formal/app/TabLeader.tla: accept, then execute, then answer; a repeated call id is answered from memory. */
export class CoreLeader {
  private lastSeq = 0n;
  private socket: { generation: number; socket: SocketLike; heardAt: number } | null = null;
  private stopListening: (() => void) | null = null;
  private readonly calls = new Map<string, string | null>();
  private readonly queued: QueuedCall[] = [];
  private draining = false;
  private inFlight = 0;
  private yieldedTicks = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly runtime: RuntimeHandle,
    private readonly channel: Channel,
    private readonly options: LeaderOptions,
  ) {}

  start(): void {
    this.stopListening = this.channel.listen((message) => this.receive(message));
    this.announce();
  }

  private announce(): void {
    const { epoch, build } = this.options;
    this.channel.post(build ? { type: "leader", epoch, build } : { type: "leader", epoch });
  }

  /** Background sync waits while tab calls are queued: those run first, sync resumes on the next tick. */
  tick(): void {
    if (!this.queued.length || this.yieldedTicks >= MAX_YIELDED_TICKS) {
      this.yieldedTicks = 0;
      this.runtime.poll();
    } else {
      this.yieldedTicks += 1;
    }
    this.drain();
    const socket = this.socket;
    if (socket && this.clock() - socket.heardAt > SOCKET_SILENCE_MS) {
      socket.heardAt = this.clock();
      this.command({ type: "realtime_reconnect" });
    }
  }

  private clock(): number {
    return (this.options.now ?? Date.now)();
  }

  stop(): void {
    this.stopListening?.();
    this.stopListening = null;
    this.closeSocket();
    this.runtime.stop();
  }

  private receive(message: ChannelMessage): void {
    if (message.type === "hello") {
      this.announce();
    } else if (message.type === "step_down") {
      this.options.onStepDown?.();
    } else if (message.type === "call") {
      const { id, kind, payload } = message;
      this.channel.post({ type: "accepted", id, epoch: this.options.epoch });
      if (this.calls.has(id)) {
        const envelope = this.calls.get(id);
        if (envelope != null) this.channel.post({ type: "result", id, epoch: this.options.epoch, envelope });
        return;
      }
      this.remember(id, null);
      const network = this.options.send && this.options.apiUrl ? networkCall(kind, payload) : null;
      this.queued.push({ id, kind, payload, network });
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.draining) return;
    this.draining = true;
    (this.options.defer ?? nextTask)(() => this.runQueued());
  }

  /**
   * Queries and passthrough requests first: queries only read core's store and a passthrough only asks core to
   * sign, so the UI never waits behind a write, and page requests never wait one tick each.
   */
  private runQueued(): void {
    this.draining = false;
    for (let i = 0; i < this.queued.length; ) {
      const call = this.queued[i]!;
      if (call.kind === "query" || call.network?.name === "signed_request") this.dispatch(this.queued.splice(i, 1)[0]!);
      else i++;
    }
    const next = this.queued.shift();
    if (next) this.dispatch(next);
    if (this.queued.length) this.schedule();
  }

  private dispatch({ id, kind, payload, network }: QueuedCall): void {
    if (kind === "migrate") void this.migrate(payload).then((envelope) => this.answer(id, envelope));
    else if (kind === "signup") void this.signup(payload).then((envelope) => this.answer(id, envelope));
    else if (network?.name === "signed_request") void this.signedRequest(network).then((envelope) => this.answer(id, envelope));
    else if (network && FETCHES[network.name]) void this.fetchOne(network, FETCHES[network.name]!).then((envelope) => this.answer(id, envelope));
    else if (network) void this.backfill(network).then((envelope) => this.answer(id, envelope));
    else this.answer(id, this.run(kind, payload));
  }

  private core<T>(v: number, name: string, payload: Record<string, unknown>): Reply<T> {
    try {
      const envelope = this.runtime.request(JSON.stringify({ v, name, payload }));
      const parsed = JSON.parse(envelope) as { ok?: T };
      return parsed.ok === undefined ? { envelope } : { ok: parsed.ok };
    } catch (error) {
      return { envelope: errorEnvelope("runtime_threw", error) };
    }
  }

  private async send(v: number, method: string, { target, headers, body_b64 }: SignedTarget): Promise<Reply<{ status: number; body_b64: string }>> {
    await this.slot();
    const reply = await this.options.send!(`${this.options.apiUrl!.replace(/\/+$/, "")}${target}`, {
      method,
      headers,
      ...(body_b64 ? { body: fromBase64(body_b64) } : {}),
    }).then(
      (response): Reply<{ status: number; body_b64: string }> => ({ ok: { status: response.status, body_b64: toBase64(response.body) } }),
      (error: unknown) => ({
        envelope: JSON.stringify({
          v,
          err: { code: "network_unavailable", category: "network", retryable: true, message: error instanceof Error ? error.message : String(error) },
        }),
      }),
    );
    this.release();
    return reply;
  }

  /** Core signs; the Worker sends, so core keeps serving other calls while the request is out. */
  private async signedRequest({ v, payload }: NetworkCall): Promise<string> {
    const signed = this.core<SignedTarget>(v, "sign_request", payload);
    if ("envelope" in signed) return signed.envelope;
    const reply = await this.send(v, String(payload.method ?? "GET").toUpperCase(), signed.ok);
    return "envelope" in reply ? reply.envelope : JSON.stringify({ v, ok: reply.ok });
  }

  /** Core signs the GET, the Worker fetches it, core stores the reply. */
  private async fetchOne({ v, payload }: NetworkCall, [sign, store]: readonly [string, string]): Promise<string> {
    const signed = this.core<{ request: SignedTarget }>(v, sign, payload);
    if ("envelope" in signed) return signed.envelope;
    const reply = await this.send(v, "GET", signed.ok.request);
    if ("envelope" in reply) return reply.envelope;
    const stored = this.core<unknown>(v, store, { ...payload, ...reply.ok });
    return "envelope" in stored ? stored.envelope : JSON.stringify({ v, ok: stored.ok });
  }

  /** Each page: core signs the GET, the Worker fetches it, core stores it and says where to go next. */
  private async backfill({ v, payload }: NetworkCall): Promise<string> {
    let cursor: unknown = null;
    for (;;) {
      const page = this.core<{ skipped?: boolean; complete?: boolean; request?: SignedTarget | null; cursor?: unknown }>(
        v,
        "history_page_request",
        { ...payload, ...(cursor ? { cursor } : {}) },
      );
      if ("envelope" in page) return page.envelope;
      if (page.ok.skipped) return JSON.stringify({ v, ok: { stored: 0, skipped: true } });
      if (!page.ok.request) return this.backfilled(v, payload, 0);
      cursor = page.ok.cursor ?? cursor;
      const reply = await this.send(v, "GET", page.ok.request);
      if ("envelope" in reply) return reply.envelope;
      const stored = this.core<{ total: number; next: unknown }>(v, "store_history_page", {
        ...payload,
        ...(cursor ? { cursor } : {}),
        ...reply.ok,
      });
      if ("envelope" in stored) return stored.envelope;
      if (!stored.ok.next) return this.backfilled(v, payload, stored.ok.total);
      cursor = stored.ok.next;
    }
  }

  /** A "load older" run also says whether the server has anything older left. */
  private backfilled(v: number, payload: Record<string, unknown>, stored: number): string {
    if (!payload.resume) return JSON.stringify({ v, ok: { stored } });
    const window = this.core<{ window: { complete?: boolean } | null }>(v, "history_window", payload);
    if ("envelope" in window) return window.envelope;
    return JSON.stringify({ v, ok: { stored, complete: Boolean(window.ok.window?.complete) } });
  }

  private slot(): Promise<void> {
    if (this.inFlight < MAX_IN_FLIGHT) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Hands a finished send's slot straight to the next waiting one. */
  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.inFlight -= 1;
  }

  private remember(id: string, envelope: string | null): void {
    this.calls.delete(id);
    this.calls.set(id, envelope);
    if (this.calls.size > REMEMBERED_CALLS) this.calls.delete(this.calls.keys().next().value as string);
  }

  private answer(id: string, envelope: string): void {
    this.remember(id, envelope);
    this.channel.post({ type: "result", id, epoch: this.options.epoch, envelope });
    this.drain();
  }

  private async migrate(payload: string): Promise<string> {
    try {
      if (!this.options.migrate) throw new Error("this host cannot migrate legacy identities");
      const command = await this.options.migrate(payload);
      return this.runtime.execute(this.runtime.nextOperationId(), 0n, command);
    } catch (error) {
      return errorEnvelope(error instanceof StaleLegacyKeysError ? STALE_LEGACY_KEYS : "migration_failed", error);
    }
  }

  private async signup(payload: string): Promise<string> {
    try {
      if (!this.options.signup) throw new Error("this host cannot sign up");
      return await this.options.signup(
        payload,
        (command) => this.runtime.execute(this.runtime.nextOperationId(), 0n, command),
        (query) => this.runtime.query(query),
      );
    } catch (error) {
      return errorEnvelope("signup_failed", error);
    }
  }

  private run(kind: CallKind, payload: string): string {
    try {
      if (kind === "query") return this.runtime.query(payload);
      if (kind === "request") return this.runtime.request(payload);
      return this.runtime.execute(this.runtime.nextOperationId(), 0n, payload);
    } catch (error) {
      return errorEnvelope("runtime_threw", error);
    }
  }

  private command(command: Record<string, unknown>): void {
    this.runtime.execute(this.runtime.nextOperationId(), 0n, JSON.stringify(command));
    this.drain();
  }

  private drain(): void {
    const envelope = JSON.parse(this.runtime.eventsSince(this.lastSeq)) as EventsEnvelope;
    if (!envelope.ok || envelope.ok.events.length === 0) return;
    const { events, truncated, latest_seq } = envelope.ok;
    this.lastSeq = BigInt(latest_seq);
    this.channel.post({ type: "events", epoch: this.options.epoch, events, truncated });
    for (const event of events) this.bridge(event);
  }

  private bridge(event: CoreEvent): void {
    const generation = event.generation as number;
    if (event.type === "realtime_open") {
      this.openSocket(generation, event.url as string);
    } else if (event.type === "realtime_send") {
      if (this.socket?.generation === generation) this.socket.socket.send(event.text as string);
    } else if (event.type === "realtime_close") {
      if (this.socket?.generation === generation) this.closeSocket();
    }
  }

  private openSocket(generation: number, url: string): void {
    this.closeSocket();
    const socket = this.options.openSocket(url);
    const current = { generation, socket, heardAt: this.clock() };
    this.socket = current;
    socket.onopen = () => {
      current.heardAt = this.clock();
      this.command({ type: "realtime_opened", generation });
    };
    socket.onmessage = (event) => {
      current.heardAt = this.clock();
      if (typeof event.data === "string") this.command({ type: "realtime_frame", generation, text: event.data });
    };
    socket.onclose = (event) => {
      if (this.socket?.socket !== socket) return;
      this.socket = null;
      this.command({ type: "realtime_closed", generation, reason: event.reason || null });
    };
  }

  private closeSocket(): void {
    const current = this.socket;
    if (!current) return;
    this.socket = null;
    current.socket.onopen = null;
    current.socket.onmessage = null;
    current.socket.onclose = null;
    current.socket.close();
  }
}
