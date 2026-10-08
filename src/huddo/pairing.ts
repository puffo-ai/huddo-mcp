import { HttpError } from "../http/types";
import { slugsQuery, type SignedHttp } from "./presence";

export type PairMap = Record<string, string>;

export interface PairDetail {
  operator: string;
  space_id: string;
  at: number;
}

export type PairDetails = Record<string, PairDetail>;

export interface PairingAnnouncement {
  agent: string;
  operator: string;
}

export class PairingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<number, string> = {
  403: "not a member of this huddo",
  404: "no agent in this huddo is waiting with that code",
  409: "code already in use in this huddo; pick another",
  429: "too many wrong codes; wait a few minutes",
};

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    let message: string | undefined = FRIENDLY[e.status];
    if (!message) {
      try {
        message = (JSON.parse(e.body) as { message?: string }).message;
      } catch {
        message = undefined;
      }
    }
    throw new PairingError(e.status, message ?? `pairing failed (${e.status})`);
  }
}

export function randomPairingCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(4);
  const n = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export function startPairing(http: SignedHttp, spaceId: string, code: string) {
  return call(() => http.post<{ ok: true; expires_in_s: number }>("/v2/pairings/start", { space_id: spaceId, code }));
}

export function claimPairing(http: SignedHttp, spaceId: string, code: string) {
  return call(() => http.post<{ agent: string; operator: string }>("/v2/pairings/claim", { space_id: spaceId, code }));
}

export function pairingResult(http: SignedHttp, spaceId: string, code: string) {
  return call(() =>
    http.get<{ paired: boolean; operator: string | null }>(
      `/v2/pairings/result?space_id=${encodeURIComponent(spaceId)}&code=${encodeURIComponent(code)}`,
    ),
  );
}

export function unpairAgent(http: SignedHttp, agent: string) {
  return call(() => http.post<{ agent: string; operator: string }>("/v2/pairings/unpair", { agent }));
}

export async function fetchPairs(http: SignedHttp, slugs: readonly string[]): Promise<PairMap> {
  const q = slugsQuery(slugs);
  return q ? call(() => http.get<PairMap>(`/v2/pairings?slugs=${q}`)) : {};
}

export async function fetchPairDetails(http: SignedHttp, slugs: readonly string[]): Promise<PairDetails> {
  const q = slugsQuery(slugs);
  return q ? call(() => http.get<PairDetails>(`/v2/pairings?detail=1&slugs=${q}`)) : {};
}

export function operatorOf(pairs: PairMap, slug: string): string | null {
  for (const [agent, operator] of Object.entries(pairs)) if (operator === slug) return agent;
  return null;
}

export function readPairingAnnouncement(content: unknown): PairingAnnouncement | null {
  const pairing = (content as { pairing?: unknown } | null)?.pairing as Partial<PairingAnnouncement> | undefined;
  return typeof pairing?.agent === "string" && typeof pairing.operator === "string"
    ? { agent: pairing.agent, operator: pairing.operator }
    : null;
}
