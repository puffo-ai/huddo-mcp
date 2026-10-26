export const REQUEST_TTL_MS = 60_000;

type Entry = { at: number; value: Promise<unknown> };

const entries = new Map<string, Entry>();

/** One request per key within `ttlMs`, shared across remounts; a failed request is not kept. */
export function cachedRequest<T>(key: string, load: () => Promise<T>, ttlMs = REQUEST_TTL_MS): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

export function storeCachedRequest<T>(key: string, value: T): void {
  entries.set(key, { at: Date.now(), value: Promise.resolve(value) });
}

export function forgetCachedRequest(key: string): void {
  entries.delete(key);
}

export function clearCachedRequests(): void {
  entries.clear();
}
