export type LivePresenceState = "online" | "busy";
export type PresenceState = LivePresenceState | "offline";

export interface PresenceEntry {
  state: PresenceState;
  note?: string;
  at?: number;
}

export type PresenceMap = Record<string, PresenceEntry>;

export interface SignedHttp {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
  put<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
  delete<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
}

export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_POLL_MS = 20_000;

export const slugsQuery = (slugs: readonly string[]) =>
  [...new Set(slugs)].filter(Boolean).map(encodeURIComponent).join(",");

export async function fetchPresence(http: SignedHttp, slugs: readonly string[]): Promise<PresenceMap> {
  const q = slugsQuery(slugs);
  if (!q) return {};
  return http.get<PresenceMap>(`/v2/presence?slugs=${q}`);
}

export async function reportPresence(http: SignedHttp, state: LivePresenceState, note?: string | null): Promise<void> {
  await http.put("/v2/presence", { state, ...(note ? { note } : {}) });
}
