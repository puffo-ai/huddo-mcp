import { queryMerged } from "../http/query-ids";

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

export async function fetchPresence(http: SignedHttp, slugs: readonly string[]): Promise<PresenceMap> {
  return queryMerged(slugs, (chunk) => http.post<PresenceMap>("/v2/presence/query", { slugs: chunk }));
}

export async function reportPresence(http: SignedHttp, state: LivePresenceState, note?: string | null): Promise<void> {
  await http.put("/v2/presence", { state, ...(note ? { note } : {}) });
}
