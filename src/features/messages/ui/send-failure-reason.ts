import { HttpError, HttpTimeoutError, SessionRecoveryError } from "../../../http/types";

export function sendErrorMayHaveReachedServer(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const mapped = error as { code?: string; httpStatus?: number };
    if (mapped.code === "http_status") {
      return typeof mapped.httpStatus === "number" && mapped.httpStatus >= 500;
    }
    return mapped.code !== "offline";
  }
  if (error instanceof HttpTimeoutError || error instanceof SessionRecoveryError) {
    return true;
  }
  if (error instanceof HttpError) return error.status >= 500;
  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  ) {
    return true;
  }
  return false;
}

export function sendFailureReason(error: unknown): string {
  if (error instanceof HttpTimeoutError) return "connection timed out";
  if (
    error instanceof TypeError &&
    /fetch|network|load failed/i.test(error.message)
  ) {
    return "connection error";
  }
  if (error instanceof HttpError) {
    const limit = sendLimitMessage(error);
    if (limit) return limit;
    if (error.status === 401) return "session expired";
    if (error.status === 403) return "permission denied";
    if (error.status === 429) return "too many requests";
    if (error.status >= 500) return "server error";
  }
  if (error instanceof Error) {
    const rejected = serverRejectionMessage(error.message);
    if (rejected) return rejected;
    if (/no recipient devices/i.test(error.message))
      return "recipient unavailable";
    if (/identity|session|send not ready/i.test(error.message))
      return "session unavailable";
  }
  return "send failed";
}

/**
 * A refused send's HTTP status, server code, auth reason and response body. Core reports a refusal as its request line
 * ("send_message: server_rejected: server rejected request: … http_status_401 reason=subkey_expired body="{\"reason\":…}"")
 * with the body's quotes escaped, so all four are read from that text. Core may cut the body short.
 */
export function sendRefusal(error: unknown): { status: number; code: string | null; reason: string | null; body: string } | null {
  if (error instanceof HttpError) {
    return { status: error.status, code: refusalCode(error.body), reason: refusalReason(error.body), body: error.body };
  }
  if (!(error instanceof Error)) return null;
  const head = /\bhttp_status_(\d{3})(?: reason=([a-z_]+))?/.exec(error.message);
  if (!head) return null;
  const body = (/\bbody="(.*)"$/.exec(error.message)?.[1] ?? "").replace(/\\"/g, '"');
  return { status: Number(head[1]), code: refusalCode(body), reason: head[2] ?? refusalReason(body), body };
}

/** The longest slow-mode wait a send waits out by itself before it counts as failed. */
export const SLOW_MODE_RETRY_MAX_MS = 3_000;

/** How long to wait before sending again when slow mode refused the send; null for any other failure. */
export function slowModeRetryDelay(error: unknown): number | null {
  const refusal = sendRefusal(error);
  if (refusal?.status !== 429 || refusal.code !== "SLOW_MODE") return null;
  if (/"retryable"\s*:\s*false/.test(refusal.body)) return null;
  const after = Number(/"retry_after_ms"\s*:\s*(\d+)/.exec(refusal.body)?.[1] ?? 1_000);
  return after <= SLOW_MODE_RETRY_MAX_MS ? after + 50 : null;
}

const refusalCode = (body: string) => /"error"\s*:\s*"([A-Z_]+)"/.exec(body)?.[1] ?? null;
const refusalReason = (body: string) => /"reason"\s*:\s*"([a-z_]+)"/.exec(body)?.[1] ?? null;

const PASSTHROUGH_ERRORS = new Set(["SLOW_MODE", "MESSAGE_TOO_LONG", "SPACE_ARCHIVED"]);

function sendLimitMessage(error: HttpError): string | null {
  if (error.status !== 429 && error.status !== 413 && error.status !== 403) return null;
  try {
    const body = JSON.parse(error.body) as { error?: string; message?: string };
    return body.error && PASSTHROUGH_ERRORS.has(body.error) ? body.message ?? null : null;
  } catch {
    return null;
  }
}

const REJECTION_FALLBACK: Record<string, string> = {
  MESSAGE_TOO_LONG: "message too long",
  SLOW_MODE: "slow mode: wait before sending again",
  SPACE_ARCHIVED: "room is archived",
};

function serverRejectionMessage(text: string): string | null {
  const code = Object.keys(REJECTION_FALLBACK).find((name) => text.includes(name));
  if (!code) return null;
  const detail = /"message\\?"\s*:\s*\\?"([^"\\]+)/.exec(text)?.[1];
  return detail ?? REJECTION_FALLBACK[code]!;
}
