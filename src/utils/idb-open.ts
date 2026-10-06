// Hardened ``indexedDB.open`` wrapper.
//
// WebKit (iOS/macOS Safari) intermittently fires neither ``onsuccess``
// nor ``onerror`` for an ``open`` issued at page load — it hangs forever,
// which white-screens the tab. We race each attempt against a timeout and
// retry; the reopen almost always succeeds. ``onblocked`` is treated the
// same — escalate to a retry rather than wait indefinitely.

export class IdbOpenTimeoutError extends Error {
  constructor(dbName: string, ms: number) {
    super(`indexedDB.open("${dbName}") did not settle within ${ms}ms`);
    this.name = "IdbOpenTimeoutError";
  }
}

/// A healthy request on iOS measures 20-36ms, so this is ~60x headroom;
/// anything past it is stalled, not slow.
export const IDB_REQUEST_TIMEOUT_MS = 2000;

export class IdbRequestTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`IndexedDB ${what} did not settle within ${ms}ms`);
    this.name = "IdbRequestTimeoutError";
  }
}

/// The same stall that hits ``indexedDB.open`` hits requests and
/// transactions, and an unsettled one hangs its caller forever.
function bounded<T>(
  what: string,
  ms: number,
  attach: (resolve: (v: T) => void, reject: (e: unknown) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new IdbRequestTimeoutError(what, ms));
    }, ms);
    const once = <A>(fn: (a: A) => void) => (a: A) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(a);
    };
    attach(once(resolve), once(reject));
  });
}

export function idbRequest<T>(
  req: IDBRequest<T>,
  what = "request",
  ms = IDB_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return bounded<T>(what, ms, (resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbTxDone(
  tx: IDBTransaction,
  what = "transaction",
  ms = IDB_REQUEST_TIMEOUT_MS,
): Promise<void> {
  return bounded<void>(what, ms, (resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(`${what} aborted`));
  });
}

export interface IdbOpenOptions {
  /// Runs on ``onupgradeneeded`` to create/migrate object stores.
  onUpgradeNeeded?: (db: IDBDatabase, req: IDBOpenDBRequest) => void;
  /// Per-attempt hang timeout (ms). Default 3000.
  timeoutMs?: number;
  /// Extra attempts after the first. Default 2 (3 opens total).
  retries?: number;
}

export function openIdb(
  name: string,
  version?: number,
  options: IdbOpenOptions = {},
): Promise<IDBDatabase> {
  const timeoutMs = options.timeoutMs ?? 3000;
  const retries = options.retries ?? 2;

  const attempt = (n: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      let settled = false;
      const req = indexedDB.open(name, version);

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Reopening an already-upgraded DB just succeeds, so a retry is
        // safe even if we tripped on a slow (non-hung) upgrade.
        if (n < retries) resolve(attempt(n + 1));
        else reject(new IdbOpenTimeoutError(name, timeoutMs));
      }, timeoutMs);

      req.onupgradeneeded = () => options.onUpgradeNeeded?.(req.result, req);
      req.onsuccess = () => {
        if (settled) {
          // A retried-past attempt opened late; close it so the orphan
          // connection can't block a future version upgrade.
          req.result.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(req.error ?? new Error(`indexedDB.open("${name}") failed`));
      };
      // Another tab holds an older version open: neither success nor
      // error arrives until it closes. Let the timeout escalate to a
      // retry instead of hanging.
      req.onblocked = () => {};
    });

  return attempt(0);
}
