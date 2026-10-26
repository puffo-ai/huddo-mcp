import { openIdb } from "../../utils/idb-open";
import { currentContextFromStatusEvent } from "./context-telemetry";
import { setProjectedCurrentContext, watchAgentIntegrationToken, type AgentIntegrationOwnerToken } from "../stores/agent-integration-store";

const DB_NAME = "puffo-agent-status-history";
const STORE = "events";
const CHECKPOINTS = "machine_checkpoints";
const BY_AGENT = "by_agent";
const MAX_PER_AGENT = 100;

export type StatusKind = "working" | "ready" | "error" | "turn";

export interface StatusHistoryEntry {
  agent_slug: string;
  machine_message_id?: string;
  kind: StatusKind;
  current_message_id?: string | null;
  duration_ms?: number | null;
  error_text?: string | null;
  event?: string;
  message?: string;
  tool_name?: string;
  tool_content?: string;
  assistant_text?: string;
  tokens?: { input: number; output: number } | null;
  last_heartbeat_at: number;
  recorded_at: number;
}

export interface StatusFrame {
  agent_slug: string;
  status: string;
  current_message_id?: string | null;
  error_text?: string | null;
  last_heartbeat_at: number;
  recorded_at: number;
}

interface AgentState {
  prevStatus: "idle" | "busy" | "error" | null;
  prevMsgId: string | null;
  prevErr: string | null;
  idleStreak: number;
  readyLogged: boolean;
  lastHeartbeat: number;
}

const agentState = new Map<string, AgentState>();
const contextRecordedAt = new Map<string, number>();

function stateFor(slug: string): AgentState {
  let s = agentState.get(slug);
  if (!s) {
    s = {
      prevStatus: null,
      prevMsgId: null,
      prevErr: null,
      idleStreak: 0,
      readyLogged: false,
      lastHeartbeat: 0,
    };
    agentState.set(slug, s);
  }
  return s;
}

async function openDb(): Promise<IDBDatabase> {
  return openIdb(DB_NAME, 2, {
    onUpgradeNeeded: (db) => {
      if (!db.objectStoreNames.contains(CHECKPOINTS)) db.createObjectStore(CHECKPOINTS);
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex(BY_AGENT, "agent_slug", { unique: false });
      }
    },
  });
}

export async function processStatusFrame(frame: StatusFrame, assertActive?: () => void, ownerToken?: AgentIntegrationOwnerToken): Promise<void> {
  assertActive?.();
  const current = agentState.get(frame.agent_slug);
  const s: AgentState = current ? { ...current } : {
    prevStatus: null, prevMsgId: null, prevErr: null, idleStreak: 0, readyLogged: false, lastHeartbeat: 0,
  };
  if (frame.last_heartbeat_at < s.lastHeartbeat) return;
  const prevStatus = s.prevStatus;
  const prevMsgId = s.prevMsgId;
  const prevErr = s.prevErr;
  s.lastHeartbeat = frame.last_heartbeat_at;
  s.prevStatus = frame.status === "busy" || frame.status === "error" ? frame.status : "idle";
  s.prevMsgId = frame.current_message_id ?? null;
  s.prevErr = frame.error_text ?? null;

  const base = {
    agent_slug: frame.agent_slug,
    last_heartbeat_at: frame.last_heartbeat_at,
    recorded_at: frame.recorded_at,
  };
  let changed = false;
  let committed = false;
  const commit = (didChange: boolean) => {
    assertActive?.();
    agentState.set(frame.agent_slug, s);
    if (didChange) notify(frame.agent_slug);
    committed = true;
  };

  if (frame.status === "busy") {
    const msg = frame.current_message_id ?? null;
    s.idleStreak = 0;
    s.readyLogged = false;
    if (prevStatus !== "busy" || prevMsgId !== msg) {
      changed = await appendEntry({ ...base, kind: "working", current_message_id: msg, duration_ms: null }, assertActive, ownerToken, commit);
    }
  } else if (frame.status === "error") {
    const err = frame.error_text ?? null;
    s.idleStreak = 0;
    s.readyLogged = false;
    if (prevStatus !== "error" || prevErr !== err) {
      changed = await appendEntry({ ...base, kind: "error", error_text: err }, assertActive, ownerToken, commit);
    }
  } else {
    s.idleStreak += 1;
    if (prevStatus === "busy") {
      changed = await stampWorkingDone(frame.agent_slug, frame.last_heartbeat_at, assertActive, ownerToken, commit);
    } else if (s.idleStreak >= 2 && !s.readyLogged) {
      s.readyLogged = true;
      changed = await appendEntry({ ...base, kind: "ready" }, assertActive, ownerToken, commit);
    }
  }

  if (!committed) commit(changed);
}

export async function recordAgentTurn(
  agentSlug: string,
  event: string,
  payload: Record<string, unknown>,
  recordedAt: number,
  machineMessageId: string | undefined,
  assertActive: (() => void) | undefined,
  ownerToken: AgentIntegrationOwnerToken,
): Promise<void> {
  assertActive?.();
  const currentContext = currentContextFromStatusEvent(event, payload);
  const base = { agent_slug: agentSlug, machine_message_id: machineMessageId, kind: "turn" as const, event, last_heartbeat_at: recordedAt, recorded_at: recordedAt };
  let entry: StatusHistoryEntry | null = null;
  if (event === "turn_start") {
    entry = { ...base, message: typeof payload.message === "string" ? payload.message : "" };
  } else if (event === "tool_use") {
    entry = {
      ...base,
      tool_name: typeof payload.tool === "string" ? payload.tool : "",
      tool_content: typeof payload.content === "string" ? payload.content : undefined,
    };
  } else if (event === "assistant_text") {
    const text = typeof payload.text === "string" ? payload.text : "";
    if (!text.trim()) return;
    entry = { ...base, assistant_text: text };
  } else if (event === "turn_complete") {
    const tokens = payload.tokens as { input?: number; output?: number } | undefined;
    entry = { ...base, tokens: tokens ? { input: tokens.input ?? 0, output: tokens.output ?? 0 } : null };
  } else if (event === "error") {
    entry = {
      agent_slug: agentSlug,
      machine_message_id: machineMessageId,
      kind: "error",
      error_text: typeof payload.error === "string" ? payload.error : "",
      last_heartbeat_at: recordedAt,
      recorded_at: recordedAt,
    };
  }
  if (!entry) return;
  const body = entry.assistant_text ?? entry.tool_content ?? null;
  if (body && !machineMessageId) {
    if (lastTurnBody.get(agentSlug) === body) return;
  }
  await appendEntry(entry, assertActive, ownerToken, (changed) => {
    assertActive?.();
    if (currentContext !== null && recordedAt >= (contextRecordedAt.get(agentSlug) ?? -Infinity)) {
      if (!setProjectedCurrentContext(ownerToken, agentSlug, currentContext)) {
        throw new Error("stale agent integration projection owner");
      }
      contextRecordedAt.set(agentSlug, recordedAt);
    }
    if (body && !machineMessageId) lastTurnBody.set(agentSlug, body);
    if (changed) notify(agentSlug);
  });
}

const lastTurnBody = new Map<string, string>();

function dedupKey(e: StatusHistoryEntry): string {
  if (e.kind === "working") return `working:${e.current_message_id ?? ""}`;
  if (e.kind === "error") return `error:${e.error_text ?? ""}`;
  return "ready";
}

function turnIdentity(e: StatusHistoryEntry): string | null {
  if (e.machine_message_id) return `envelope:${e.machine_message_id}`;
  if (e.kind !== "turn") return null;
  const disc =
    e.event === "turn_start" ? (e.message ?? "")
    : e.event === "tool_use" ? `${e.tool_name ?? ""}\0${e.tool_content ?? ""}`
    : e.event === "assistant_text" ? (e.assistant_text ?? "")
    : e.event === "turn_complete" ? `${e.tokens?.input ?? ""}:${e.tokens?.output ?? ""}`
    : "";
  return `${e.recorded_at}\0${e.event ?? ""}\0${disc}`;
}

const TURN_DEDUP_SCAN = MAX_PER_AGENT;

async function appendEntry(
  entry: StatusHistoryEntry,
  assertActive?: () => void,
  ownerToken?: AgentIntegrationOwnerToken,
  onCommitted?: (wrote: boolean) => void,
): Promise<boolean> {
  try {
    const db = await openDb();
    if (assertActive) {
      try { assertActive(); } catch (error) { db.close(); throw error; }
    }
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      let invalidated = false;
      const unwatch = ownerToken ? watchAgentIntegrationToken(ownerToken, () => {
        invalidated = true;
        try { tx.abort(); } catch {}
      }) : () => {};
      if (invalidated) { unwatch(); db.close(); reject(new Error("stale agent integration projection owner")); return; }
      const store = tx.objectStore(STORE);
      const index = store.index(BY_AGENT);
      const range = IDBKeyRange.only(entry.agent_slug);
      const key = dedupKey(entry);
      const incomingTurnId = turnIdentity(entry);
      let wrote = false;
      let scanned = 0;

      const cursorReq = index.openCursor(range, "prev");
      cursorReq.onsuccess = () => {
        try { assertActive?.(); } catch (error) { tx.abort(); reject(error); return; }
        const cursor = cursorReq.result;
        if (incomingTurnId !== null) {
          if (cursor && scanned < TURN_DEDUP_SCAN) {
            if (turnIdentity(cursor.value as StatusHistoryEntry) === incomingTurnId) {
              return;
            }
            scanned += 1;
            cursor.continue();
            return;
          }
          store.add(entry);
          wrote = true;
          trimOldest(store, range, assertActive, tx);
          return;
        }
        const latest = cursor?.value as StatusHistoryEntry | undefined;
        if (latest && dedupKey(latest) === key) return;
        store.add(entry);
        wrote = true;
        trimOldest(store, range, assertActive, tx);
      };

      tx.oncomplete = () => {
        db.close();
        if (invalidated) { unwatch(); reject(new Error("stale agent integration projection owner")); return; }
        try { assertActive?.(); onCommitted?.(wrote); } catch (error) { unwatch(); reject(error); return; }
        unwatch();
        resolve(wrote);
      };
      tx.onabort = tx.onerror = () => {
        unwatch();
        db.close();
        reject(tx.error ?? new Error("Log storage transaction aborted"));
      };
    });
  } catch (error) {
    if (assertActive) throw error;
    return false;
  }
}

async function stampWorkingDone(
  slug: string,
  idleHeartbeatAt: number,
  assertActive?: () => void,
  ownerToken?: AgentIntegrationOwnerToken,
  onCommitted?: (updated: boolean) => void,
): Promise<boolean> {
  try {
    const db = await openDb();
    if (assertActive) {
      try { assertActive(); } catch (error) { db.close(); throw error; }
    }
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      let invalidated = false;
      const unwatch = ownerToken ? watchAgentIntegrationToken(ownerToken, () => {
        invalidated = true;
        try { tx.abort(); } catch {}
      }) : () => {};
      if (invalidated) { unwatch(); db.close(); reject(new Error("stale agent integration projection owner")); return; }
      const index = tx.objectStore(STORE).index(BY_AGENT);
      let updated = false;
      const cur = index.openCursor(IDBKeyRange.only(slug), "prev");
      cur.onsuccess = () => {
        try { assertActive?.(); } catch (error) { tx.abort(); reject(error); return; }
        const c = cur.result;
        if (!c) return;
        const row = c.value as StatusHistoryEntry;
        if (row.kind === "working" && row.duration_ms == null) {
          row.duration_ms = Math.max(0, idleHeartbeatAt - row.last_heartbeat_at);
          c.update(row);
          updated = true;
        }
      };
      tx.oncomplete = () => {
        db.close();
        if (invalidated) { unwatch(); reject(new Error("stale agent integration projection owner")); return; }
        try { assertActive?.(); onCommitted?.(updated); } catch (error) { unwatch(); reject(error); return; }
        unwatch();
        resolve(updated);
      };
      tx.onabort = tx.onerror = () => {
        unwatch();
        db.close();
        reject(tx.error);
      };
    });
  } catch (error) {
    if (assertActive) throw error;
    return false;
  }
}

function trimOldest(store: IDBObjectStore, range: IDBKeyRange, assertActive?: () => void, tx?: IDBTransaction): void {
  const rows: { key: IDBValidKey; at: number }[] = [];
  const cur = store.index(BY_AGENT).openCursor(range);
  cur.onsuccess = () => {
    try { assertActive?.(); } catch { try { tx?.abort(); } catch {} return; }
    const c = cur.result;
    if (c) {
      rows.push({ key: c.primaryKey, at: (c.value as StatusHistoryEntry).recorded_at });
      c.continue();
      return;
    }
    rows.sort((a, b) => a.at - b.at);
    for (const row of rows.slice(0, Math.max(0, rows.length - MAX_PER_AGENT))) {
      store.delete(row.key);
    }
  };
}

export async function getStatusHistory(
  slug: string,
  limit = MAX_PER_AGENT,
): Promise<StatusHistoryEntry[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const index = tx.objectStore(STORE).index(BY_AGENT);
      const out: StatusHistoryEntry[] = [];
      const cur = index.openCursor(IDBKeyRange.only(slug), "prev");
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) {
          db.close();
          resolve(out.sort((a, b) => b.recorded_at - a.recorded_at).slice(0, limit));
          return;
        }
        out.push(c.value as StatusHistoryEntry);
        c.continue();
      };
      cur.onerror = () => {
        db.close();
        reject(cur.error);
      };
    });
  } catch {
    return [];
  }
}

const listeners = new Map<string, Set<() => void>>();

export function subscribeStatusHistory(slug: string, cb: () => void): () => void {
  let set = listeners.get(slug);
  if (!set) {
    set = new Set();
    listeners.set(slug, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(slug);
  };
}

function notify(slug: string): void {
  listeners.get(slug)?.forEach((cb) => {
    try {
      cb();
    } catch {
    }
  });
}

export async function clearAll(): Promise<void> {
  agentState.clear();
  lastTurnBody.clear();
  contextRecordedAt.clear();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, CHECKPOINTS], "readwrite");
      tx.objectStore(STORE).clear();
      tx.objectStore(CHECKPOINTS).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
  }
}

export async function machineHistoryCheckpoint<T>(key: string, assertActive: () => void, value?: T, signal?: AbortSignal): Promise<T | undefined> {
  const db = await openDb();
  try { assertActive(); } catch (error) { db.close(); throw error; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHECKPOINTS, value === undefined ? "readonly" : "readwrite");
    const abort = () => tx.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const store = tx.objectStore(CHECKPOINTS);
    let request: IDBRequest;
    const close = () => { signal?.removeEventListener("abort", abort); db.close(); };
    tx.oncomplete = () => {
      close();
      try { assertActive(); } catch (error) { reject(error); return; }
      resolve(value === undefined ? request.result as T | undefined : value);
    };
    tx.onabort = tx.onerror = () => {
      close();
      try { assertActive(); } catch (error) { reject(error); return; }
      reject(tx.error ?? new Error("Log checkpoint storage failed"));
    };
    try {
      request = value === undefined ? store.get(key) : store.put(value, key);
      if (signal?.aborted) abort();
    } catch (error) {
      close();
      try { assertActive(); } catch (inactiveError) { reject(inactiveError); return; }
      reject(error);
    }
  });
}
