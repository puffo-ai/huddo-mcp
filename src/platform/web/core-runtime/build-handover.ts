import type { HostHandover } from "./host";
import type { Build } from "./protocol";

/** The build this bundle came from; `version.json` names the deployed one (formal/app/BuildHandover.tla). */
export const thisBuild: Build = { version: __APP_VERSION__, builtAt: __APP_BUILT_AT__ };

/** Dev and test bundles have no build time, so they never hand over or reload. */
export const handsOver = (build: Build): boolean => build.builtAt > 0 && !build.version.endsWith("-dev");

export const isNewer = (a: Build, b: Build): boolean => a.builtAt > b.builtAt;

/** The build `/version.json` names now; `null` when it can't be read or has no build time. */
export async function deployedBuild(fetchImpl: typeof fetch = fetch): Promise<Build | null> {
  try {
    const resp = await fetchImpl(`/version.json?t=${Date.now()}`, { cache: "no-store", credentials: "omit" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { version?: unknown; built_at?: unknown };
    return typeof data.version === "string" && typeof data.built_at === "number" ? { version: data.version, builtAt: data.built_at } : null;
  } catch {
    return null;
  }
}

const DB = "huddo-core-build";
const STORE = "builds";
const NEWEST = "newest";

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return settle(request);
}

const store = (db: IDBDatabase, mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);

/** The build time of the newest build that has run the runtime in this browser, 0 before any. */
export async function newestLed(factory: IDBFactory = indexedDB): Promise<number> {
  const db = await open(factory);
  try {
    const value = await settle<unknown>(store(db, "readonly").get(NEWEST));
    return typeof value === "number" ? value : 0;
  } finally {
    db.close();
  }
}

/** Records `builtAt` as the newest build that has led, unless a newer one already has. */
export async function recordLed(builtAt: number, factory: IDBFactory = indexedDB): Promise<void> {
  const db = await open(factory);
  try {
    const value = await settle<unknown>(store(db, "readonly").get(NEWEST));
    if (typeof value === "number" && value >= builtAt) return;
    await settle(store(db, "readwrite").put(builtAt, NEWEST));
  } finally {
    db.close();
  }
}

/** The Worker's handover, or none for a dev or test bundle. */
export function browserHandover(build: Build = thisBuild): HostHandover | undefined {
  if (!handsOver(build)) return undefined;
  return { build, newestLed: () => newestLed(), recordLed: (builtAt) => recordLed(builtAt), deployed: () => deployedBuild() };
}
