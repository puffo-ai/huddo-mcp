const PREFIX = "huddo.cache.v1:";
const INDEX_KEY = "huddo.cache.v1.index";
const ROOMS_KEPT = 30;
const MAX_VALUE_CHARS = 200_000;

function readIndex(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_VALUE_CHARS) return;
    localStorage.setItem(PREFIX + key, raw);
  } catch {
  }
}

export function readRoomCache<T>(kind: string, spaceId: string): T | null {
  return readCache<T>(`${kind}:${spaceId}`);
}

export function writeRoomCache(kind: string, spaceId: string, value: unknown): void {
  const index = readIndex();
  const rooms = [spaceId, ...(index[kind] ?? []).filter((id) => id !== spaceId)];
  for (const old of rooms.splice(ROOMS_KEPT)) {
    try {
      localStorage.removeItem(`${PREFIX}${kind}:${old}`);
    } catch {
    }
  }
  index[kind] = rooms;
  writeCache(`${kind}:${spaceId}`, value);
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
  }
}

export function clearLocalCaches(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(PREFIX) || key === INDEX_KEY)) localStorage.removeItem(key);
    }
  } catch {
  }
}
