import { createServer, type AddressInfo, type Server } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import type { MessagePort } from "node:worker_threads";
import { initSync, WasmCoreRuntime } from "puffo-core-wasm";
import { HUDDO_SIGNS_EVERY_MESSAGE_WITHOUT_SEALING, runCoreHost, type HostDeps, type HostStatus } from "../../web/core-runtime/host";
import type { SocketLike } from "../../web/core-runtime/leader";
import { sendSigned } from "../../web/core-runtime/signed-send";
import { nodeHostServices } from "./host-services";
import { serverChannel } from "./socket-channel";
import { syncHttpClient } from "./sync-http";

/** What the process hands its core worker; the storage key never leaves the two threads. */
export type NodeCoreWorkerData = Readonly<{
  apiUrl: string;
  directory: string;
  /** Named pipe or Unix socket that other processes reach the leader on. */
  endpoint: string;
  /** Where the leader writes the token every connection must send, and its loopback port when the endpoint is refused. */
  fallbackFile: string;
  port: MessagePort;
  signal: Int32Array;
  storageKey: Uint8Array;
  syncIntervalMs?: number;
}>;

export type NodeCoreWorkerHooks = Readonly<{
  wasm: BufferSource;
  migrate?: HostDeps["migrate"];
  signup?: HostDeps["signup"];
  report(status: HostStatus): void;
}>;

export function nodeProfile(apiUrl: string, directory: string, syncIntervalMs?: number): string {
  return JSON.stringify({
    profile: "node",
    api_url: apiUrl,
    directory,
    sync_interval_ms: syncIntervalMs ?? null,
    // Node 20 and 21 have no global WebSocket: core then syncs on its interval only.
    realtime: typeof WebSocket !== "undefined",
    plaintext_messages: HUDDO_SIGNS_EVERY_MESSAGE_WITHOUT_SEALING,
  });
}

function listenOn(target: string | { host: string; port: number }): Promise<Server> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(target, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

/**
 * The endpoint, or loopback TCP when the endpoint is refused (for example EPERM in a sandbox). Either way a
 * connection must first send the token from the 0600 file: a named pipe's default ACL is not this home's.
 */
async function listen(data: NodeCoreWorkerData): Promise<{ server: Server; token: string }> {
  if (process.platform !== "win32") rmSync(data.endpoint, { force: true });
  rmSync(data.fallbackFile, { force: true });
  const token = randomBytes(32).toString("hex");
  let server: Server;
  let port: number | undefined;
  try {
    server = await listenOn(data.endpoint);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") throw error;
    server = await listenOn({ host: "127.0.0.1", port: 0 });
    port = (server.address() as AddressInfo).port;
  }
  writeFileSync(data.fallbackFile, JSON.stringify(port === undefined ? { token } : { port, token }), { mode: 0o600 });
  return { server, token };
}

/** Runs in the leader process's worker thread: core, the leader, and the channel the other processes call it on. */
export async function runNodeCoreWorker(data: NodeCoreWorkerData, hooks: NodeCoreWorkerHooks): Promise<void> {
  (globalThis as { huddoNodeHost?: unknown }).huddoNodeHost = nodeHostServices(syncHttpClient(data.port, data.signal));
  let listening: Awaited<ReturnType<typeof listen>>;
  try {
    listening = await listen(data);
  } catch (error) {
    hooks.report({ type: "failed", error: `core could not listen on ${data.endpoint}: ${(error as Error).message}` });
    return;
  }
  const { server, token } = listening;
  await runCoreHost(
    { apiUrl: data.apiUrl, namespace: "node", syncIntervalMs: data.syncIntervalMs },
    {
      // The process takes the leader lock before it starts this worker.
      locks: { request: (_name, run) => run() },
      async loadRuntime(configJson) {
        initSync({ module: hooks.wasm });
        try {
          return await WasmCoreRuntime.start(configJson, data.storageKey);
        } finally {
          data.storageKey.fill(0);
        }
      },
      profile: (config) => nodeProfile(config.apiUrl, data.directory, config.syncIntervalMs),
      channel: () => serverChannel(server, token),
      openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      send: sendSigned,
      migrate: hooks.migrate,
      signup: hooks.signup,
      newEpoch: () => randomUUID(),
      every: (ms, run) => void setInterval(run, ms),
      report: hooks.report,
    },
  );
}
