import type { SignedHttp } from "./presence";

export const SLOW_MODE_STEPS = [1, 10, 60, 300] as const;
export const MAX_CHARS_STEPS = [200, 500, 1500, 3000] as const;
export const BLOCKED_TEXT = "A blocked message";

export interface HuddoLimits {
  slow_mode_s: number;
  max_message_chars: number;
}

export const DEFAULT_LIMITS: HuddoLimits = { slow_mode_s: 1, max_message_chars: 3000 };

const enc = encodeURIComponent;

export async function fetchLimits(http: SignedHttp, spaceId: string): Promise<HuddoLimits> {
  const space = await http.get<Partial<HuddoLimits>>(`/spaces/${enc(spaceId)}`);
  return {
    slow_mode_s: space.slow_mode_s ?? DEFAULT_LIMITS.slow_mode_s,
    max_message_chars: space.max_message_chars ?? DEFAULT_LIMITS.max_message_chars,
  };
}

export function setLimits(http: SignedHttp, spaceId: string, patch: Partial<HuddoLimits>): Promise<HuddoLimits> {
  return http.put<HuddoLimits>(`/v2/spaces/${enc(spaceId)}/limits`, { ...patch });
}

export async function fetchBlocks(http: SignedHttp): Promise<string[]> {
  return (await http.get<{ blocked: string[] }>("/v2/blocks")).blocked;
}

export async function setBlocked(http: SignedHttp, slug: string, blocked: boolean): Promise<string[]> {
  const path = `/v2/blocks/${enc(slug)}`;
  const resp = blocked ? await http.put<{ blocked: string[] }>(path) : await http.delete<{ blocked: string[] }>(path);
  return resp.blocked;
}

export const charCount = (text: string) => [...text].length;

export function formatSeconds(s: number): string {
  return s < 60 ? `${s}s` : `${s / 60} min`;
}

export type SendLimitError =
  | { kind: "slow_mode"; retryAfterMs: number; message: string }
  | { kind: "too_long"; message: string };

export function sendLimitError(err: unknown): SendLimitError | null {
  const raw = (err as { body?: unknown })?.body;
  const text = typeof raw === "string" ? raw : err instanceof Error ? err.message : String(err);
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  let body: { error?: string; message?: string; retry_after_ms?: number };
  try {
    body = JSON.parse(json) as typeof body;
  } catch {
    return null;
  }
  if (body.error === "SLOW_MODE") {
    const retryAfterMs = body.retry_after_ms ?? 1000;
    return { kind: "slow_mode", retryAfterMs, message: `Slow mode is on: you can send again in ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s.` };
  }
  if (body.error === "MESSAGE_TOO_LONG") {
    return { kind: "too_long", message: body.message ?? "Message is too long for this huddo." };
  }
  return null;
}
