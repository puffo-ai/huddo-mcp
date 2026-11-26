import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import wasmBytes from "puffo-core-wasm/puffo_core_bg.wasm?url";
import {
  currentCoreSession,
  fetchLegacyCerts,
  startCoreSession,
  subscribeCoreSession,
  type BridgeEvent,
  type CoreSession,
} from "../src/platform/web/core-runtime/bridge";
import type { CoreClient } from "../src/platform/web/core-runtime/client";
import type { ForwarderEvents } from "../src/platform/web/core-runtime/forwarder";
import type { HostStatus } from "../src/platform/web/core-runtime/host";
import { legacyIdentityCommand } from "../src/platform/web/core-runtime/legacy-identity";
import { startNodeCoreClient, type NodeCoreClient } from "../src/platform/node/core-runtime/client";
import { runNodeCoreWorker, type NodeCoreWorkerData } from "../src/platform/node/core-runtime/worker";
import { installCoreMessageSender } from "../src/application/runtime/core-message-sender-port";
import { installCoreSpaceEvents } from "../src/application/runtime/core-space-port";
import { installCoreWhisperKeys } from "../src/application/runtime/core-whisper-port";
import { installCoreReadState } from "../src/application/runtime/core-read-state-port";
import { awaitCoreMessageReader, installCoreMessageReader } from "../src/application/runtime/core-message-reader-port";
import { createCoreMessageReader } from "../src/platform/web/core-runtime/core-message-reader";
import { failCoreSigning, installCoreHttpTransport } from "../src/http/core-transport-port";
import { SERVER_URL, acquireProcessLock, homeDir, localEndpoint, readJson, writeJson } from "./home";
import { FileKeyStore } from "./keystore";
import { legacyRooms, retireLegacyRooms } from "./store";
import { log } from "./daemon-log";
import { activeSlug, type Runtime } from "./runtime";

const WORKER_MARK = "huddo-core-worker";
const STORAGE_KEY_BYTES = 32;
const SESSION_TIMEOUT_MS = 60_000;

export const coreDir = () => join(homeDir(), "core");

export const coreEndpoint = () => localEndpoint("core");

/** The key that seals core's key store and database key; it stays in this home like the old identity files did. */
function storageKey(): Uint8Array {
  const path = join(coreDir(), "storage.key");
  if (!existsSync(path)) writeJson(path, { key: randomBytes(STORAGE_KEY_BYTES).toString("base64") });
  const { key } = JSON.parse(readFileSync(path, "utf8")) as { key: string };
  return new Uint8Array(Buffer.from(key, "base64"));
}

/** The worker thread of the process that leads; `huddo.ts` calls this before anything else. */
export function runCoreWorkerIfAsked(): boolean {
  if (isMainThread || (workerData as { mark?: string } | null)?.mark !== WORKER_MARK) return false;
  const keys = new FileKeyStore();
  void runNodeCoreWorker(workerData as NodeCoreWorkerData, {
    wasm: wasmBytes as unknown as Uint8Array<ArrayBuffer>,
    migrate: (payload) => legacyIdentityCommand(payload, keys),
    report: (status) => parentPort?.postMessage(status),
  });
  return true;
}

function nodeClient(handlers: ForwarderEvents & { onStatus?(status: HostStatus): void }): Promise<NodeCoreClient> {
  return startNodeCoreClient(handlers, {
    endpoint: coreEndpoint(),
    fallbackFile: join(coreDir(), "endpoint.json"),
    lead: () => acquireProcessLock(join(coreDir(), "leader.lock")),
    workerData: () => ({
      apiUrl: SERVER_URL,
      directory: coreDir(),
      endpoint: coreEndpoint(),
      fallbackFile: join(coreDir(), "endpoint.json"),
      storageKey: storageKey(),
    }),
    createWorker: (data, port, signal) =>
      new Worker(new URL(import.meta.url), {
        workerData: { ...data, port, signal, mark: WORKER_MARK },
        transferList: [port],
      }),
    onStatus: handlers.onStatus,
  });
}

/** A client the bridge can use at once; calls wait for this process to join or become the leader. */
function deferredClient(handlers: ForwarderEvents & { onStatus?(status: HostStatus): void }): CoreClient {
  const ready = nodeClient(handlers);
  ready.catch((error: unknown) => handlers.onStatus?.({ type: "failed", error: error instanceof Error ? error.message : String(error) }));
  return {
    call: async (kind, payload) => (await ready).call(kind, payload),
    close: () => void ready.then((client) => client.close(), () => undefined),
  };
}

const removalsPath = () => join(coreDir(), "pending-removals.json");

const pendingRemovals: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: (key) => readJson<Record<string, string>>(removalsPath())?.[key] ?? null,
  setItem(key, value) {
    writeJson(removalsPath(), { ...readJson<Record<string, string>>(removalsPath()), [key]: value });
  },
  removeItem(key) {
    const next = { ...readJson<Record<string, string>>(removalsPath()) };
    delete next[key];
    writeJson(removalsPath(), next);
  },
};

function report(event: BridgeEvent, fail: (error: string) => void): void {
  if (event.type === "failed") {
    log(`core: ${event.error}`);
    failCoreSigning(event.error);
    fail(event.error);
  } else if (event.type === "sync_failed") log(`core sync failed: ${JSON.stringify(event.error)}`);
  else if (event.type === "host" && event.status.type !== "leading") log(`core host: ${JSON.stringify(event.status)}`);
}

let attached: { slug: string; session: Promise<CoreSession>; stop(): void } | null = null;

/**
 * Runs the account in core: imports the identity the first time, then core signs every request it can and owns
 * sends, space events, whispers and read state, as in the web app.
 */
export function attachCore(rt: Runtime, slug: string, serverUrl = SERVER_URL): Promise<CoreSession> {
  if (attached?.slug === slug) return attached.session;
  attached?.stop();
  let fail!: (error: string) => void;
  const failed = new Promise<never>((_, reject) => (fail = (error) => reject(new Error(error))));
  const stop = startCoreSession(slug, serverUrl, {
    startClient: (_config, handlers) => deferredClient(handlers ?? {}),
    loadSession: (account) => rt.keyStore.loadSession(account),
    fetchCerts: (account) => fetchLegacyCerts(rt.http(slug, serverUrl), account),
    installTransport: installCoreHttpTransport,
    installSender: installCoreMessageSender,
    installSpaceEvents: installCoreSpaceEvents,
    installWhisperKeys: installCoreWhisperKeys,
    installReadState: installCoreReadState,
    readStateChanged: () => undefined,
    messagesChanged: () => undefined,
    pendingRemovals,
    report: (event) => report(event, fail),
    watchWake: () => () => undefined,
  });
  const ready = new Promise<CoreSession>((resolveSession, reject) => {
    const timer = setTimeout(() => reject(new Error(`core did not open ${slug} in time`)), SESSION_TIMEOUT_MS);
    const check = () => {
      const session = currentCoreSession();
      if (session?.slug !== slug) return;
      clearTimeout(timer);
      unsubscribe();
      resolveSession(session);
    };
    const unsubscribe = subscribeCoreSession(check);
    check();
  });
  const session = Promise.race([ready, failed]).then(async (opened) => {
    installCoreMessageReader(createCoreMessageReader(opened.client));
    await migrateLegacyHistory(slug);
    return opened;
  });
  attached = { slug, session, stop };
  return session;
}

/** Fetches into core every room the CLI kept in its own files, as deep as it kept it, then renames those files. */
async function migrateLegacyHistory(slug: string): Promise<void> {
  const rooms = legacyRooms(slug);
  if (!rooms.length) return;
  const reader = await awaitCoreMessageReader();
  for (const room of rooms) {
    const stored = await reader.backfillChannel(room.channelId, Math.max(room.rows, 1)).catch((error: unknown) => {
      log(`history of ${room.channelId} not moved to core yet: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (stored === null) return;
  }
  retireLegacyRooms(slug);
  log(`moved the history of ${rooms.length} room(s) into core`);
}

/** Commands that read only this home's files, so they don't start core. */
const CORE_FREE_COMMANDS = new Set(["changelog", "connect", "guide"]);

/** Runs the command's identity in core first, unless the command needs no account. */
export async function attachForCommand(rt: Runtime, command: string, as?: string): Promise<void> {
  const slug = activeSlug(as);
  if (slug && !CORE_FREE_COMMANDS.has(command)) await attachCore(rt, slug);
}

export function detachCore(): void {
  installCoreMessageReader(null);
  attached?.stop();
  attached = null;
}
