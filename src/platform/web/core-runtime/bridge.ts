import { watchWake } from "./wake";
import type { PuffoHttpClient } from "../../../http/client";
import type { CoreMessageReader } from "../../../application/runtime/core-message-reader-port";
import type { CoreMessageSender } from "../../../application/runtime/core-message-sender-port";
import type { CoreReadState } from "../../../application/runtime/core-read-state-port";
import type { CoreSpaceEvents } from "../../../application/runtime/core-space-port";
import type { CoreWhisperKeys } from "../../../application/runtime/core-whisper-port";
import type { CoreHttpTransport } from "../../../http/core-transport-port";
import { CoreRequestError } from "../../../http/types";
import { fetchSenderEventChain } from "../../../message/recipients";
import { startCoreClient, type CoreClient } from "./client";
import { createCoreHttpTransport } from "./core-http";
import { createCoreMessageReader } from "./core-message-reader";
import { createCoreMessageSender } from "./core-message-sender";
import { createCoreReadState } from "./core-read-state";
import { createCoreSpaceEvents } from "./core-space-events";
import { createCoreWhisperKeys } from "./core-whisper-keys";
import { publishCoreEvents, registerRealtimeStateQuery, subscribeCoreEvents } from "./core-events";
import type { HostStatus } from "./host";
import type { LegacyCerts } from "./legacy-identity";
import {
  backfillLegacyChannels,
  ensureSession,
  importHistory,
  importIdentity,
  rowsMissingFromCore,
  type LegacyAccount,
  type LegacyRow,
  type MigrationReport,
} from "./migrate";
import { clearPendingCoreRemoval, pendingCoreRemovals } from "./pending-removals";
import { lostToLeaderChange, unknownOutcome, UnknownOutcomeError, type CoreEvent } from "./protocol";

export type BridgeEvent =
  | Readonly<{ type: "migrated"; report: MigrationReport }>
  | Readonly<{ type: "failed"; error: string }>
  /** Start-up finished after the tab had already reported that the runtime could not start. */
  | Readonly<{ type: "recovered" }>
  | Readonly<{ type: "host"; status: HostStatus }>
  | Readonly<{ type: "sync_failed"; error: unknown }>;

export type CoreSessionDeps = Readonly<{
  startClient: typeof startCoreClient;
  loadSession(slug: string): Promise<{ device_id: string; subkey_id: string } | null>;
  /** Writes a new TypeScript session for an account core has not imported yet; null when it can't. */
  refreshSession?(slug: string): Promise<{ device_id: string; subkey_id: string } | null>;
  fetchCerts(account: LegacyAccount): Promise<LegacyCerts | null>;
  installTransport(transport: CoreHttpTransport | null): void;
  installSender(sender: CoreMessageSender | null): void;
  installSpaceEvents(port: CoreSpaceEvents | null): void;
  installWhisperKeys(port: CoreWhisperKeys | null): void;
  installReadState(port: CoreReadState | null): void;
  readStateChanged(): void;
  messagesChanged(): void;
  report(event: BridgeEvent): void;
  pendingRemovals: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  sessionWaitMs?: number;
  /** Waits between tries when a start-up step is lost to a leader change. */
  leaderRetryMs?: readonly number[];
  /** How long a failed Worker or runtime may wait for another tab's leader before start-up fails. */
  hostFailureGraceMs?: number;
  watchWake?(onWake: () => void): () => void;
}>;

export const LEADER_RETRY_MS = [250, 1000, 3000] as const;
export const HOST_FAILURE_GRACE_MS = 5_000;

export type CoreHistoryDeps = Readonly<{
  listMessages(): Promise<readonly LegacyRow[]>;
  marker: Pick<Storage, "getItem" | "setItem">;
  installReader(reader: CoreMessageReader | null): void;
  messagesChanged(): void;
  arrived(envelopeIds: readonly string[]): void;
  report(event: BridgeEvent): void;
}>;

export type CoreSession = Readonly<{ slug: string; client: CoreClient }>;

const REFRESH_EVENTS = new Set(["snapshot_invalidated"]);
const READ_STATE_EVENTS = new Set(["read_state_changed", "message_committed", "message_display_changed", "sync_completed"]);

export const migratedKey = (slug: string) => `huddo.core-migrated.${slug}`;

let current: CoreSession | null = null;

type ClientHandlers = Required<NonNullable<Parameters<typeof startCoreClient>[1]>>;
type Warm = { apiUrl: string; client: CoreClient; relay: { current: ClientHandlers | null; status?: HostStatus; epoch?: string } };
let warm: Warm | null = null;

const sameServer = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** Starts the core Worker before anyone signs in, so a join or a new room does not wait for the wasm to load. */
export function prewarmCoreClient(apiUrl: string, start: typeof startCoreClient = startCoreClient): void {
  if (warm || current) return;
  warm = startWarm(apiUrl, start);
}

function startWarm(apiUrl: string, start: typeof startCoreClient): Warm {
  const relay: Warm["relay"] = { current: null };
  const client = start(
    { apiUrl, namespace: "huddo" },
    {
      onStatus: (status) => {
        relay.status = status;
        relay.current?.onStatus(status);
      },
      onLeader: (epoch) => {
        relay.epoch = epoch;
        relay.current?.onLeader(epoch);
      },
      onEvents: (epoch, events, truncated) => relay.current?.onEvents(epoch, events, truncated),
    },
  );
  return { apiUrl, client, relay };
}

export type CoreSignup = Readonly<{ username: string; displayName?: string; signupEndpoint: string }>;

/** Signs a new account up in core; the leader Worker also writes its keys into the TypeScript key store.
 * The warm client stays warm for startCoreSession to adopt. */
export async function signupThroughCore(
  apiUrl: string,
  signup: CoreSignup,
  start: typeof startCoreClient = startCoreClient,
): Promise<string> {
  return (await signupThroughCoreWithBackup(apiUrl, signup, false, start)).slug;
}

/** Signs up in core; with `backup`, the server stores the account's first backup in the same step and its key
 * comes back here. */
export async function signupThroughCoreWithBackup(
  apiUrl: string,
  signup: CoreSignup,
  backup: boolean,
  start: typeof startCoreClient = startCoreClient,
): Promise<{ slug: string; backupKey?: string }> {
  const client = clientFor(apiUrl, start);
  const outcome = await client.call(
    "signup",
    JSON.stringify({
      username: signup.username,
      display_name: signup.displayName ?? null,
      signup_endpoint: signup.signupEndpoint,
      server_url: apiUrl,
      backup,
    }),
  );
  if (outcome.status === "unknown") throw unknownOutcome("signup", outcome);
  const envelope = JSON.parse(outcome.envelope) as {
    ok?: { slug?: string; backup_key?: string };
    err?: { code?: string; message?: string };
  };
  if (!envelope.ok?.slug) {
    const message = envelope.err?.message ?? "Sign-up failed.";
    throw CoreRequestError.fromCore(envelope.err?.code ?? "unknown", message);
  }
  return { slug: envelope.ok.slug, ...(envelope.ok.backup_key ? { backupKey: envelope.ok.backup_key } : {}) };
}

/** The running account's core client, or a warm one for `apiUrl` when no account runs in this tab yet. */
function clientFor(apiUrl: string, start: typeof startCoreClient): CoreClient {
  if (warm && !sameServer(warm.apiUrl, apiUrl)) {
    warm.client.close();
    warm = null;
  }
  if (!current && !warm) warm = startWarm(apiUrl, start);
  return current?.client ?? warm!.client;
}

async function execute<T>(client: Pick<CoreClient, "call">, command: Readonly<{ type: string } & Record<string, unknown>>): Promise<T> {
  const outcome = await client.call("execute", JSON.stringify(command));
  if (outcome.status === "unknown") throw unknownOutcome(command.type, outcome);
  const envelope = JSON.parse(outcome.envelope) as { ok?: T; err?: { code?: string; message?: string } };
  if (envelope.ok === undefined) throw CoreRequestError.fromCore(envelope.err?.code ?? "unknown", envelope.err?.message ?? `${command.type} failed`);
  return envelope.ok;
}

/** Runs a command on the account's core session; its keys stay in core. Right after a sign-up the session is open
 * on the warm client before this tab adopts it; otherwise it waits for start-up. */
export async function executeForAccount<T>(
  slug: string,
  command: Readonly<{ type: string } & Record<string, unknown>>,
  waitMs = SESSION_WAIT_MS,
): Promise<T> {
  const client = current?.slug !== slug && warm ? warm.client : (await sessionFor(slug, waitMs))?.client;
  if (!client) throw new CoreRequestError("core_not_running", "the core runtime is not running for this account");
  return execute<T>(client, command);
}

const SESSION_WAIT_MS = 15_000;

/** The account's running session, waiting up to `timeoutMs` while core starts; null when it does not. */
function sessionFor(slug: string, timeoutMs: number): Promise<CoreSession | null> {
  if (current?.slug === slug) return Promise.resolve(current);
  return new Promise((resolve) => {
    const finish = (session: CoreSession | null) => {
      clearTimeout(timer);
      stop();
      resolve(session);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const stop = subscribeCoreSession(() => {
      if (current?.slug === slug) finish(current);
    });
  });
}

/** Runs a command that needs no signed-in account (opening a backup, recovering), on a warm client if needed. */
export function executeBeforeSignIn<T>(
  apiUrl: string,
  command: Readonly<{ type: string } & Record<string, unknown>>,
  start: typeof startCoreClient = startCoreClient,
): Promise<T> {
  return execute<T>(clientFor(apiUrl, start), command);
}

/** Lists what core holds through the client `executeBeforeSignIn` uses. */
export async function queryBeforeSignIn(apiUrl: string, query: string, start: typeof startCoreClient = startCoreClient): Promise<string> {
  const outcome = await clientFor(apiUrl, start).call("query", query);
  if (outcome.status === "unknown") throw unknownOutcome("query", outcome);
  return outcome.envelope;
}

function adoptWarmClient(apiUrl: string, handlers: ClientHandlers): CoreClient | null {
  const ready = warm;
  warm = null;
  if (!ready) return null;
  if (!sameServer(ready.apiUrl, apiUrl)) {
    ready.client.close();
    return null;
  }
  ready.relay.current = handlers;
  // What the warm client heard before anyone adopted it: a leader already answering, or a Worker that failed.
  if (ready.relay.epoch) handlers.onLeader(ready.relay.epoch);
  if (ready.relay.status?.type === "failed") handlers.onStatus(ready.relay.status);
  return ready.client;
}
const sessionListeners = new Set<() => void>();

function setCurrentSession(session: CoreSession | null): void {
  current = session;
  for (const listener of [...sessionListeners]) listener();
}

export function currentCoreSession(): CoreSession | null {
  return current;
}

export function subscribeCoreSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

const REMOVE_TIMEOUT_MS = 5_000;

/** Deletes the account's keys and rows from core in this browser; gives up quietly after a few seconds. */
export async function removeCoreIdentity(slug: string, timeoutMs = REMOVE_TIMEOUT_MS): Promise<boolean> {
  const session = currentCoreSession();
  if (session?.slug !== slug) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = session.client
    .call("execute", JSON.stringify({ type: "remove_from_this_device", slug }))
    .then((outcome) => outcome.status === "done" && Boolean((JSON.parse(outcome.envelope) as { ok?: unknown }).ok))
    .catch(() => false);
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Has core post a root-signed revocation of this device; throws with core's error code when it can't. */
export async function revokeCoreDevice(slug: string, timeoutMs: number): Promise<void> {
  const session = await sessionFor(slug, timeoutMs);
  if (!session) throw new Error("core_not_running: the core runtime is not running for this account");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
  });
  try {
    const outcome = await Promise.race([session.client.call("execute", JSON.stringify({ type: "revoke_this_device" })), timeout]);
    if (outcome.status !== "done") throw new Error(`revoke_this_device: ${outcome.status}`);
    const envelope = JSON.parse(outcome.envelope) as { ok?: unknown; err?: { code: string; message: string } };
    if (!envelope.ok) throw new Error(`${envelope.err?.code}: ${envelope.err?.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** The device and subkey core already holds for the account; null while only the TypeScript key store has it. */
async function heldByCore(client: Pick<CoreClient, "call">, slug: string): Promise<{ device_id: string; subkey_id: string } | null> {
  const outcome = await client.call("query", JSON.stringify({ type: "list_identities" }));
  if (outcome.status !== "done") return null;
  const items = (JSON.parse(outcome.envelope) as { ok?: { items?: Array<{ slug: string; local_device_id: string; active_subkey_id: string }> } }).ok?.items;
  const held = items?.find((item) => item.slug === slug);
  return held ? { device_id: held.local_device_id, subkey_id: held.active_subkey_id } : null;
}

async function lastSyncDone(client: Pick<CoreClient, "call">): Promise<boolean> {
  const outcome = await client.call("query", JSON.stringify({ type: "runtime_status" }));
  if (outcome.status !== "done") return false;
  return (JSON.parse(outcome.envelope) as { ok?: { last_sync_at_ms?: number | null } }).ok?.last_sync_at_ms != null;
}

/** Listens for full syncs from now on; next() resolves at once if one was already heard. */
function watchFullSync(): Readonly<{ next(): Promise<void>; stop(): void }> {
  let seen = false;
  let wake: (() => void) | null = null;
  const stop = subscribeCoreEvents((events) => {
    if (!events.some((event) => event.type === "sync_completed" && event.has_more === false)) return;
    seen = true;
    wake?.();
  });
  return { next: () => (seen ? Promise.resolve() : new Promise<void>((resolve) => (wake = resolve))), stop };
}

const failure = (error: unknown): BridgeEvent => ({
  type: "failed",
  error: error instanceof Error ? error.message : String(error),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchLegacyCerts(http: PuffoHttpClient, account: LegacyAccount): Promise<LegacyCerts | null> {
  const chain = await fetchSenderEventChain(http, {
    signer_slug: account.slug,
    signer_device_id: account.deviceId,
    signer_subkey_id: account.subkeyId,
    payload: { issued_at: Date.now() },
  });
  if (!chain) return null;
  return {
    slug: account.slug,
    identity_cert: chain.identity,
    slug_binding: chain.slug_binding,
    device_cert: chain.device,
    subkey_cert: chain.subkey,
  };
}

/** Runs the core runtime for the signed-in account and hands it HTTP, sends, space events and whispers. */
export function startCoreSession(slug: string, apiUrl: string, deps: CoreSessionDeps): () => void {
  let owned = false;
  let stopped = false;
  let leaderSeen = false;
  let hostFailure: string | null = null;
  let hostTimer: ReturnType<typeof setTimeout> | undefined;
  let abandoned = false;
  // Start-up timed out before any tab answered: a leader that was frozen, or that opens later, runs it again.
  let stalled = false;
  let synced!: () => void;
  const firstSync = new Promise<void>((resolve) => (synced = resolve));
  const handlers: ClientHandlers = {
    onStatus(status) {
      deps.report({ type: "host", status });
      if (status.type !== "failed") return;
      hostFailure = status.error;
      // Another tab's runtime can still serve this tab; give up only when none answers.
      if (leaderSeen || hostTimer) return;
      // A new leader or stopping clears the timer, so it fires only when no runtime answered in time.
      hostTimer = setTimeout(() => {
        abandoned = true;
        deps.report(failure(`the runtime could not start: ${status.error}`));
      }, deps.hostFailureGraceMs ?? HOST_FAILURE_GRACE_MS);
    },
    onLeader() {
      leaderSeen = true;
      clearTimeout(hostTimer);
      if (stalled) {
        stalled = false;
        startUp();
        return;
      }
      if (!owned) return;
      void retryOnLeaderChange(() => ensureSession(client, slug)).catch((error: unknown) => {
        if (!stopped) deps.report(failure(error));
      });
    },
    onEvents(_epoch, events, truncated) {
      publishCoreEvents(events);
      if (truncated) deps.messagesChanged();
      if (events.some((event) => READ_STATE_EVENTS.has(event.type))) deps.readStateChanged();
      for (const event of events) {
        if (event.type === "sync_failed") deps.report({ type: "sync_failed", error: event });
        if (event.type === "sync_completed" && event.has_more === false) synced();
        if (REFRESH_EVENTS.has(event.type)) deps.messagesChanged();
      }
    },
  };
  const client = adoptWarmClient(apiUrl, handlers) ?? deps.startClient({ apiUrl, namespace: "huddo" }, handlers);
  registerRealtimeStateQuery(async () => {
    const outcome = await client.call("query", JSON.stringify({ type: "runtime_status" }));
    if (outcome.status !== "done") return null;
    const envelope = JSON.parse(outcome.envelope) as { ok?: { realtime?: { state?: string } } };
    return envelope.ok?.realtime?.state ?? null;
  });
  const session: CoreSession = { slug, client };
  const stopWake = (deps.watchWake ?? watchWake)(() => {
    void client.call("execute", JSON.stringify({ type: "realtime_reconnect" })).catch(() => undefined);
  });
  startUp();
  return () => {
    stopped = true;
    clearTimeout(hostTimer);
    stopWake();
    deps.installTransport(null);
    deps.installSender(null);
    deps.installSpaceEvents(null);
    deps.installWhisperKeys(null);
    deps.installReadState(null);
    if (current === session) setCurrentSession(null);
    client.close();
  };

  function startUp(): void {
    void (async () => {
      const keys =
        (await deps.loadSession(slug)) ??
        (await heldByCore(client, slug)) ??
        (await deps.refreshSession?.(slug).catch(() => null)) ??
        (await waitForKeys());
      if (!keys) throw new Error(`no live session for ${slug}`);
      await retryOnLeaderChange(() =>
        importIdentity(client, account(keys), deps.fetchCerts, async () => {
          const fresh = await deps.loadSession(slug);
          return fresh ? account(fresh) : null;
        }),
      );
      owned = true;
      await removePendingIdentities();
      if (!stopped) {
        setCurrentSession(session);
        deps.installTransport(createCoreHttpTransport(client, apiUrl.replace(/\/+$/, ""), slug));
        deps.installSpaceEvents(createCoreSpaceEvents(client, slug));
      }
      if (await lastSyncDone(client)) synced();
      await firstSync;
    })().then(
      () => {
        if (stopped) return;
        deps.installSender(createCoreMessageSender(client));
        deps.installWhisperKeys(createCoreWhisperKeys(client, slug));
        deps.installReadState(createCoreReadState(client));
        // Giving up keeps start-up running, so a tab that opens later and leads can still rescue this one.
        if (abandoned) deps.report({ type: "recovered" });
      },
      (error: unknown) => {
        if (stopped || abandoned) return;
        if (!leaderSeen && timedOut(error)) {
          stalled = true;
          abandoned = true;
        }
        deps.report(failure(withCause(error)));
      },
    );
  }

  /** Importing the identity and opening the session check what the runtime already holds first, so a step whose
   * leader went away mid-call can run again on the next leader. */
  async function retryOnLeaderChange<T>(run: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const delays = deps.leaderRetryMs ?? LEADER_RETRY_MS;
      if (stopped || !lostToLeaderChange(error) || attempt >= delays.length) throw error;
      await sleep(delays[attempt]!);
      if (stopped) throw error;
      return retryOnLeaderChange(run, attempt + 1);
    }
  }

  /** A start-up call that timed out says why no answer came: the runtime that failed, or no tab running one. */
  function timedOut(error: unknown): error is UnknownOutcomeError {
    return error instanceof UnknownOutcomeError && error.reason === "timed_out";
  }

  function withCause(error: unknown): unknown {
    if (!timedOut(error)) return error;
    if (hostFailure) return `${error.message}; the runtime could not start: ${hostFailure}`;
    return leaderSeen ? error : `${error.message}; no tab is running the runtime`;
  }

  async function removePendingIdentities(): Promise<void> {
    for (const pending of pendingCoreRemovals(deps.pendingRemovals)) {
      const removed =
        pending === slug ||
        (await client
          .call("execute", JSON.stringify({ type: "remove_from_this_device", slug: pending }))
          .then((outcome) => outcome.status === "done" && Boolean((JSON.parse(outcome.envelope) as { ok?: unknown }).ok))
          .catch(() => false));
      if (removed) clearPendingCoreRemoval(pending, deps.pendingRemovals);
    }
  }

  function account(keys: { device_id: string; subkey_id: string }): LegacyAccount {
    return { slug, deviceId: keys.device_id, subkeyId: keys.subkey_id };
  }

  async function waitForKeys() {
    const deadline = Date.now() + (deps.sessionWaitMs ?? 30_000);
    for (;;) {
      const keys = await deps.loadSession(slug);
      if (keys || stopped || Date.now() >= deadline) return keys;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/** Moves the TypeScript store's history into core once (formal/app/LegacyImport.tla), then reads from core. */
export function startCoreHistory(slug: string, deps: CoreHistoryDeps): () => void {
  let attached: CoreSession | null = null;
  let unsubscribe: (() => void) | null = null;
  let stopWatch: (() => void) | null = null;
  const detach = () => {
    unsubscribe?.();
    unsubscribe = null;
    stopWatch?.();
    stopWatch = null;
    if (attached) deps.installReader(null);
    attached = null;
  };
  const attach = () => {
    const session = currentCoreSession();
    if (session === attached) return;
    detach();
    if (!session || session.slug !== slug) return;
    attached = session;
    const watch = watchFullSync();
    stopWatch = watch.stop;
    const live = () => attached === session;
    void migrateHistory(session.client, watch, live)
      .catch((error: unknown) => {
        if (live()) deps.report(failure(error));
        return null;
      })
      .then((finish) => {
        if (attached !== session) return;
        deps.installReader(createCoreMessageReader(session.client));
        unsubscribe = subscribeCoreEvents(announceArrivals);
        deps.messagesChanged();
        if (!finish) return watch.stop();
        return finish().then(() => {
          watch.stop();
          if (attached === session) deps.messagesChanged();
        });
      })
      .catch((error: unknown) => {
        if (live()) deps.report(failure(error));
      });
  };
  const stopListening = subscribeCoreSession(attach);
  attach();
  return () => {
    stopListening();
    detach();
  };

  /** Runs the first pass; returns the rest of the import when rows are still unsynced. */
  async function migrateHistory(
    client: CoreClient,
    watch: ReturnType<typeof watchFullSync>,
    live: () => boolean,
  ): Promise<(() => Promise<void>) | null> {
    if (deps.marker.getItem(migratedKey(slug)) === "1") return null;
    const syncedBefore = await lastSyncDone(client);
    const rows = await deps.listMessages();
    const first = await importHistory(client, rows);
    if (first.unsynced === 0) {
      finish(first, 0);
      return null;
    }
    return async () => {
      let last = first;
      if (!syncedBefore) {
        await watch.next();
        const second = await importHistory(client, rows);
        last = { ...second, imported: first.imported + second.imported };
      }
      const backfilled = last.unsynced > 0 ? await backfillLegacyChannels(client, await rowsMissingFromCore(client, rows)) : 0;
      if (live()) finish(last, backfilled);
    };
  }

  function finish(counts: Omit<MigrationReport, "identity" | "backfilled">, backfilled: number): void {
    deps.marker.setItem(migratedKey(slug), "1");
    deps.report({ type: "migrated", report: { identity: "present", ...counts, backfilled } });
  }

  function announceArrivals(events: readonly CoreEvent[]): void {
    const committed = events.flatMap((event) => (event.type === "message_committed" ? [event.envelope_id as string] : []));
    if (committed.length > 0) deps.arrived(committed);
  }
}

export { startCoreClient };
