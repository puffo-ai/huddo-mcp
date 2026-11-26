export interface SignedHttp {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
  put<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
  delete<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
}

export const PRESENCE_HEARTBEAT_MS = 30_000;

export async function reportPresence(http: SignedHttp): Promise<void> {
  await http.put("/v2/presence", { state: "online" });
}
