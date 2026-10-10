export class IdbOpenTimeoutError extends Error {
  constructor(dbName: string, ms: number) {
    super(`indexedDB.open("${dbName}") did not settle within ${ms}ms`);
    this.name = "IdbOpenTimeoutError";
  }
}

export const IDB_REQUEST_TIMEOUT_MS = 2000;

export class IdbRequestTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`IndexedDB ${what} did not settle within ${ms}ms`);
    this.name = "IdbRequestTimeoutError";
  }
}

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
  onUpgradeNeeded?: (db: IDBDatabase, req: IDBOpenDBRequest) => void;
  timeoutMs?: number;
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
        if (n < retries) resolve(attempt(n + 1));
        else reject(new IdbOpenTimeoutError(name, timeoutMs));
      }, timeoutMs);

      req.onupgradeneeded = () => options.onUpgradeNeeded?.(req.result, req);
      req.onsuccess = () => {
        if (settled) {
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
      req.onblocked = () => {};
    });

  return attempt(0);
}
