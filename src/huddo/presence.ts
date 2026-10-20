import { queryMerged } from "../http/query-ids";

export type PresenceState = "online" | "offline";

export interface PresenceEntry {
  state: PresenceState;
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
  const raw = await queryMerged(slugs, (chunk) =>
    http.post<Record<string, { state?: string; at?: number }>>("/v2/presence/query", { slugs: chunk }),
  );
  const map: PresenceMap = {};
  for (const [slug, p] of Object.entries(raw)) {
    map[slug] = { state: p.state === "offline" ? "offline" : "online", ...(p.at !== undefined ? { at: p.at } : {}) };
  }
  return map;
}

export async function reportPresence(http: SignedHttp): Promise<void> {
  await http.put("/v2/presence", { state: "online" });
}
