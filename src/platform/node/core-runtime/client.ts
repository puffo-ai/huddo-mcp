import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { MessageChannel, type Worker } from "node:worker_threads";
import type { CoreClient } from "../../web/core-runtime/client";
import { CoreForwarder, type ForwarderEvents } from "../../web/core-runtime/forwarder";
import type { HostStatus } from "../../web/core-runtime/host";
import type { Channel, ChannelMessage } from "../../web/core-runtime/protocol";
import { readFileSync } from "node:fs";
import { readMessages, tokenLine } from "./socket-channel";
import { serveSyncHttp } from "./sync-http";
import type { NodeCoreWorkerData } from "./worker";

export type NodeCoreClientDeps = Readonly<{
  endpoint: string;
  /** The token the leader requires, and its loopback port when its endpoint is refused. */
  fallbackFile: string;
  /** Takes the leader lock for this process; false while another process holds it. */
  lead(): boolean;
  /** Starts the core worker; it reports `HostStatus` messages. */
  createWorker(data: Omit<NodeCoreWorkerData, "port" | "signal">, port: NodeCoreWorkerData["port"], signal: Int32Array): Worker;
  workerData(): Omit<NodeCoreWorkerData, "port" | "signal">;
  onStatus?(status: HostStatus): void;
  retryMs?: number;
  timeoutMs?: number;
}>;

export type NodeCoreClient = CoreClient & Readonly<{ leading(): boolean }>;

function tryConnect(target: string | { host: string; port: number }): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = connect(target as never);
    const fail = () => {
      socket.destroy();
      resolve(null);
    };
    socket.once("error", fail);
    socket.once("connect", () => {
      socket.off("error", fail);
      resolve(socket);
    });
  });
}

/**
 * A process joins the leader the other processes share, or becomes it: the lock winner runs core in a worker thread
 * and then calls it over the same channel as everyone else (formal/app/TabLeader.tla, one process per tab). When
 * the leader process ends, the others connect again, one of them leads, and the forwarder finds the new epoch.
 */
export async function startNodeCoreClient(handlers: ForwarderEvents, deps: NodeCoreClientDeps): Promise<NodeCoreClient> {
  const retryMs = deps.retryMs ?? 100;
  const listeners = new Set<(message: ChannelMessage) => void>();
  const queued: string[] = [];
  let worker: Worker | null = null;
  let failure: string | null = null;
  let socket: Socket | null = null;
  let closed = false;
  let forwarder: CoreForwarder | null = null;

  const channel: Channel = {
    post(message) {
      const line = `${JSON.stringify(message)}\n`;
      if (socket?.writable) socket.write(line);
      else queued.push(line);
    },
    listen(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };

  use(await connectOrLead());
  forwarder = new CoreForwarder(channel, handlers, randomUUID);
  return {
    leading: () => worker !== null,
    call: (kind, payload) => forwarder!.call(kind, payload),
    close() {
      closed = true;
      forwarder?.dispose();
      socket?.destroy();
      void worker?.terminate();
      worker = null;
    },
  };

  async function connectOrLead(): Promise<Socket> {
    const deadline = Date.now() + (deps.timeoutMs ?? 30_000);
    for (;;) {
      const connected = await tryLeader();
      if (connected) return connected;
      if (!worker && deps.lead()) worker = startWorker();
      if (failure) throw new Error(failure);
      if (Date.now() > deadline) throw new Error(`the core runtime did not start on ${deps.endpoint}`);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  /** The leader's endpoint (or loopback port), joined with its token; null while no leader has written one. */
  async function tryLeader(): Promise<Socket | null> {
    let leader: { port?: number; token: string };
    try {
      leader = JSON.parse(readFileSync(deps.fallbackFile, "utf8")) as { port?: number; token: string };
    } catch {
      return null;
    }
    const socket = await tryConnect(leader.port === undefined ? deps.endpoint : { host: "127.0.0.1", port: leader.port });
    socket?.write(tokenLine(leader.token));
    return socket;
  }

  function use(next: Socket): void {
    socket = next;
    next.on("error", () => next.destroy());
    next.on("close", () => {
      if (socket === next) socket = null;
      if (closed) return;
      void connectOrLead().then(
        (again) => {
          use(again);
          forwarder?.rediscover();
        },
        (error: unknown) => deps.onStatus?.({ type: "failed", error: error instanceof Error ? error.message : String(error) }),
      );
    });
    readMessages(next, (message) => {
      for (const listener of [...listeners]) listener(message);
    });
    for (const line of queued.splice(0)) next.write(line);
  }

  function startWorker(): Worker {
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    serveSyncHttp(port1, signal);
    const started = deps.createWorker(deps.workerData(), port2, signal);
    started.on("message", (status: HostStatus) => {
      if (status.type === "failed") failure = status.error;
      deps.onStatus?.(status);
    });
    started.on("error", (error) => {
      failure = error.message;
    });
    started.on("exit", () => {
      port1.close();
      if (worker === started) worker = null;
    });
    started.unref();
    return started;
  }
}
