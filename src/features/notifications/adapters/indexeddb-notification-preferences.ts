import type { PushPayload } from "./service-worker-notification";
import { idbRequest, idbTxDone, openIdb } from "../../../utils/idb-open";
import {
  EMPTY_NOTIFICATION_PREFERENCES,
  modeRequiresSubscription,
  withDmToggled,
  withDmsBulkSet,
  withMode,
  withSpaceToggled,
  withSpacesBulkSet,
  type NotificationMode,
  type NotificationPreferences,
} from "../domain/notification";
import type { NotificationPreferencesPort } from "../application/ports";

export { modeRequiresSubscription, withDmToggled, withDmsBulkSet, withMode, withSpaceToggled, withSpacesBulkSet };
export type { NotificationMode };
export type NotificationPrefs = NotificationPreferences;

const DB_NAME = "puffo-push-prefs";
const STORE = "prefs";
const KEY = "current";
const CHANNEL = "puffo-push-prefs";

export const EMPTY_PREFS = EMPTY_NOTIFICATION_PREFERENCES;

export function createIndexedDbNotificationPreferencesPort(): NotificationPreferencesPort {
  return {
    read: readPrefs,
    async update(change, canCommit) {
      const current = await readPrefs();
      if (!canCommit()) return null;
      const next = change(current);
      return await writePrefs(next, canCommit) && canCommit() ? next : null;
    },
    subscribe: subscribePrefsChanges,
  };
}

async function openDB(): Promise<IDBDatabase> {
  return openIdb(DB_NAME, 1, {
    onUpgradeNeeded: (db) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
}

export async function readPrefs(): Promise<NotificationPrefs> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        const stored = req.result as Partial<NotificationPrefs> | undefined;
        resolve({ ...EMPTY_PREFS, ...(stored ?? {}) });
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return EMPTY_PREFS;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function writePrefs(
  prefs: NotificationPrefs,
  canCommit: () => boolean = () => true,
): Promise<boolean> {
  const write = writeQueue.then(() => commitPrefs(prefs, canCommit));
  writeQueue = write.then(() => undefined, () => undefined);
  return write;
}

async function commitPrefs(prefs: NotificationPrefs, canCommit: () => boolean): Promise<boolean> {
  if (!canCommit()) return false;
  try {
    const db = await openDB();
    if (!canCommit()) {
      db.close();
      return false;
    }
    const committed = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const snapshotRequest = store.get(KEY);
      let previous: NotificationPrefs | undefined;
      let rejectedAsStale = false;
      snapshotRequest.onsuccess = () => {
        previous = snapshotRequest.result as NotificationPrefs | undefined;
        if (!canCommit()) {
          rejectedAsStale = true;
          tx.abort();
          return;
        }
        const writeRequest = store.put(prefs, KEY);
        writeRequest.onsuccess = () => {
          if (!canCommit()) {
            rejectedAsStale = true;
            tx.abort();
          }
        };
      };
      tx.oncomplete = () => {
        if (canCommit()) {
          db.close();
          resolve(true);
          return;
        }
        db.close();
        void restorePrefs(prefs, previous).then(
          () => resolve(false),
          reject,
        );
      };
      tx.onabort = () => {
        db.close();
        if (rejectedAsStale) resolve(false);
        else reject(tx.error);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    if (!committed) return false;
    broadcastChange();
    return true;
  } catch {
    return false;
  }
}

async function restorePrefs(stale: NotificationPrefs, previous: NotificationPrefs | undefined): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let db: IDBDatabase | null = null;
    try {
      db = await openDB();
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const current = await idbRequest(store.get(KEY), "notification preference rollback read");
      if (samePrefs(current, stale)) {
        if (previous === undefined) store.delete(KEY);
        else store.put(previous, KEY);
      }
      await idbTxDone(tx, "notification preference rollback");
      db.close();
      return;
    } catch (error) {
      db?.close();
      lastError = error;
    }
  }
  throw lastError ?? new Error("notification preference rollback failed");
}

function samePrefs(left: unknown, right: NotificationPrefs): boolean {
  if (!left || typeof left !== "object") return false;
  const candidate = left as Partial<NotificationPrefs>;
  return candidate.mode === right.mode
    && JSON.stringify(candidate.enabledSpaces ?? []) === JSON.stringify(right.enabledSpaces)
    && JSON.stringify(candidate.enabledDms ?? []) === JSON.stringify(right.enabledDms);
}

let bc: BroadcastChannel | null = null;
function getBc(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!bc) {
    try {
      bc = new BroadcastChannel(CHANNEL);
    } catch {
      return null;
    }
  }
  return bc;
}

const localBus: EventTarget =
  typeof EventTarget !== "undefined" ? new EventTarget() : ({} as EventTarget);

function broadcastChange(): void {
  getBc()?.postMessage("prefs-changed");
  try {
    localBus.dispatchEvent(new Event("prefs-changed"));
  } catch {
  }
}

export function subscribePrefsChanges(cb: () => void): () => void {
  const channel = getBc();
  const onMessage = () => cb();
  channel?.addEventListener("message", onMessage);
  try {
    localBus.addEventListener("prefs-changed", onMessage);
  } catch {
  }
  return () => {
    channel?.removeEventListener("message", onMessage);
    try {
      localBus.removeEventListener("prefs-changed", onMessage);
    } catch {
    }
  };
}

export function shouldRing(
  prefs: NotificationPrefs,
  _payload: PushPayload,
  foreground: boolean,
): boolean {
  if (prefs.mode === "off") return false;
  if (prefs.mode === "wake_only" && foreground) return false;
  return true;
}

export async function toggleSpaceMute(spaceId: string, on: boolean): Promise<NotificationPrefs> {
  const next = withSpaceToggled(await readPrefs(), spaceId, on);
  await writePrefs(next);
  return next;
}

export async function toggleDmMute(peerSlug: string, on: boolean): Promise<NotificationPrefs> {
  const next = withDmToggled(await readPrefs(), peerSlug, on);
  await writePrefs(next);
  return next;
}
