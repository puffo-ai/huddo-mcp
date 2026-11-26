// Small values kept in this browser. Storage can be missing or refuse (a private window, cookies blocked, a sandboxed
// frame) or be full; what is kept here is a convenience, so reading and writing it never throws.

type Area = "local" | "session";

/**
 * The storage itself, looked up on each call: with cookies blocked, just touching the global throws, and tests swap
 * the global for a stub.
 */
function storage(area: Area): Storage {
  return area === "session" ? sessionStorage : localStorage;
}

/**
 * Reads `key` through `parse`, which gets `null` when the key isn't there. `fallback` is for when storage refuses or
 * `parse` throws (bad JSON), so a caller can tell "never saved" from "can't read". Keep `parse` to parsing and shape
 * checks: anything it throws becomes `fallback`.
 */
export function readStored<T>(key: string, { parse, fallback, area = "local" }: { parse: (raw: string | null) => T; fallback: T; area?: Area }): T {
  try {
    return parse(storage(area).getItem(key));
  } catch {
    return fallback;
  }
}

/** Saves `value` under `key`; false when storage refused it or is full. */
export function writeStored(key: string, value: string, area: Area = "local"): boolean {
  try {
    storage(area).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Removes `key`; false when storage refused. */
export function removeStored(key: string, area: Area = "local"): boolean {
  try {
    storage(area).removeItem(key);
    return true;
  } catch {
    return false;
  }
}
