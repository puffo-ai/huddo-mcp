import { HttpError } from "../http/types";
import { asSentence, errorText } from "./error-text";
import { queryMerged } from "../http/query-ids";
import type { SignedHttp } from "./presence";

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
  403: "not a member of this room",
  404: "no agent in this room is waiting with that code",
  409: "code already in use in this room; pick another",
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

/** What a six-box code entry says when the server refuses the code (pairing, linking a phone). */
export const INCORRECT_CODE_TEXT = "Incorrect code. Try again.";

// The Pair screen speaks to a person in sentences; FRIENDLY above stays as the CLI's short reasons.
const PAIR_SCREEN_TEXT: Record<number, string> = {
  403: "You're not a member of this room.",
  409: "That code is already in use in this room. Ask your agent for a new one.",
  429: "Too many wrong codes. Wait a few minutes, then try again.",
};

/**
 * What the Pair screens say when a code is refused. The server answers 404 for a wrong and an expired code alike,
 * so both read as one message; `wrong` marks it so the boxes can show it.
 */
export function pairErrorText(err: unknown): { text: string; wrong: boolean } {
  if (err instanceof PairingError && err.status === 404) return { text: INCORRECT_CODE_TEXT, wrong: true };
  if (err instanceof PairingError) {
    // A reason the server gave (such as an agent that is itself an operator) reads as a sentence; a bare status doesn't.
    const reason = PAIR_SCREEN_TEXT[err.status] ?? (err.message.startsWith("pairing failed (") ? "Pairing didn't work. Try again." : asSentence(err.message));
    return { text: reason, wrong: false };
  }
  return { text: errorText(err, "account"), wrong: false };
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

/**
 * Unpairs `agent` from `operator`. When the request fails, the pairing is read again first: an unpair whose answer
 * was lost may have gone through, and then it has nothing to retry. It still fails when the pair is there, or can't
 * be read.
 */
export async function unpairChecked(http: SignedHttp, agent: string, operator: string): Promise<void> {
  try {
    await unpairAgent(http, agent);
  } catch (err) {
    const pairs = await fetchPairs(http, [agent]).catch(() => null);
    if (!pairs || pairs[agent] === operator) throw err;
  }
}

export async function fetchPairs(http: SignedHttp, slugs: readonly string[]): Promise<PairMap> {
  return queryMerged(slugs, (chunk) => call(() => http.post<PairMap>("/v2/pairings/query", { slugs: chunk })));
}

export async function fetchPairDetails(http: SignedHttp, slugs: readonly string[]): Promise<PairDetails> {
  return queryMerged(slugs, (chunk) =>
    call(() => http.post<PairDetails>("/v2/pairings/query", { slugs: chunk, detail: true })),
  );
}

export function operatorOf(pairs: PairMap, slug: string): string | null {
  for (const [agent, operator] of Object.entries(pairs)) if (operator === slug) return agent;
  return null;
}

export function isPeer(sender: string, pairs: PairMap, self?: string | null): boolean {
  return Boolean(self && sender !== self && pairs[self] && pairs[sender] === pairs[self]);
}

export function operatorTag(sender: string, pairs: PairMap, self?: string | null): string {
  if (self && pairs[self] === sender) return "[paired with you]";
  if (isPeer(sender, pairs, self)) return "[peer]";
  const agent = operatorOf(pairs, sender);
  return agent ? `[paired with: ${agent}]` : "";
}

export function readPairingAnnouncement(content: unknown): PairingAnnouncement | null {
  const pairing = (content as { pairing?: unknown } | null)?.pairing as Partial<PairingAnnouncement> | undefined;
  return typeof pairing?.agent === "string" && typeof pairing.operator === "string"
    ? { agent: pairing.agent, operator: pairing.operator }
    : null;
}
