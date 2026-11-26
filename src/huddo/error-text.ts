import { sendRefusal } from "../features/messages/ui";
import { UserFacingError } from "../shared/user-facing-error";
import { sendLimitError } from "./moderation";
import { revisionError } from "./revisions";

// Screens may not import the HTTP layer (.dependency-cruiser.cjs, ui-no-infrastructure), so its errors are read by
// their name and fields: HttpError has status and body, CoreRequestError has the runtime's code. UnknownOutcomeError
// (a call whose answer never came back) has only its name.
type Failed<T> = Error & T;
const httpError = (err: unknown) => (err instanceof Error && err.name === "HttpError" ? (err as Failed<{ status: number; body: string }>) : null);
const coreError = (err: unknown) => (err instanceof Error && err.name === "CoreRequestError" ? (err as Failed<{ code: string; status?: number }>) : null);
const statusOf = (err: unknown) => httpError(err)?.status ?? coreError(err)?.status ?? 0;

/**
 * Core refuses a whisper's key lookup with stale_local_state when a recipient has no active device (or its device
 * certs didn't sync), so nothing is sealed or sent. Read by its code only: the message is core's wording.
 */
export const recipientCantReceive = (err: unknown) => coreError(err)?.code === "stale_local_state";

const OFFLINE_TEXT = "Can't reach Huddo. Check your connection and try again.";
const RETRY_TEXT = "Something went wrong. Please try again.";
const TOO_MANY_TEXT = "Too many tries. Wait a minute, then try again.";
const BUSY_TEXT = "Huddo is busy. Try again in a moment.";
const LINK_GONE_TEXT = "This invite link no longer works. Ask for a new one.";
const NOT_IN_ROOM_TEXT = "You're not in this room anymore.";
const SEND_SIGNED_OUT_TEXT = "You're signed out. Sign in again to send.";
const ARCHIVED_TEXT = "This room is archived.";
/** A whisper's recipient whose devices can't take it now. */
export const recipientUnavailableText = (name: string) => `${name} can't get messages right now. Try again later.`;
/** A signed-out state outside sending, such as opening a file. */
export const SIGNED_OUT_TEXT = "You're signed out. Sign in again.";

/** What the person was doing. The same status means different things on different calls, so each has its own lines. */
export type ErrorOperation = "send-code" | "account" | "join" | "invite-link" | "send" | "delivery" | "revise" | "leave" | "remove-member" | "file" | "room-app" | "log-out" | "sms";

type Lines = (err: unknown) => string | null;

/** A server that refuses for now, whether it is busy or limiting tries. */
const busy: Lines = (err) => {
  const status = statusOf(err);
  if (status === 429) return TOO_MANY_TEXT;
  return status >= 500 ? BUSY_TEXT : null;
};

/** A room that is archived refuses every change to it with a 403 and this code. */
const archived: Lines = (err) => {
  const http = httpError(err);
  return http?.status === 403 && http.body.includes("SPACE_ARCHIVED") ? ARCHIVED_TEXT : null;
};

/** The server's sentence for a sender who isn't in the channel (a person, or an Agent no longer active in it). */
const MEMBERSHIP_REFUSAL = /\bis not (?:a|an active Agent) member of channel\b/;

/** 401 reasons after which core signs the device out; any other 401 is one core recovers from. */
const SIGNED_OUT_REASONS = new Set(["device_revoked", "device_expired", "operator_revoked"]);

/** Slow mode and the length limit: the room's own rules, which say when to send again or what to shorten. */
const sendLimit: Lines = (err) => sendLimitError(err)?.message ?? null;

/** A server id (ch_…, sp_…) or an account slug ending in its hex tag: a sentence naming one isn't for the screen. */
const INTERNAL_ID = /\b(?:ch|sp|msg|dev|inv)_[0-9a-z]|-(?=[0-9a-f]*\d)[0-9a-f]{4,}\b/i;

/** A TypeError from fetch means the request never got there; any other TypeError is a bug, not the connection. */
const NETWORK_TYPE_ERROR = /fetch|network|load failed/i;

/** A busy server comes first: it says nothing about the link, the file or the room. */
const withBusy = (lines: Lines): Lines => (err) => busy(err) ?? lines(err);

const OPERATIONS: Record<ErrorOperation, Lines> = {
  // Asking for a sign-in code is the one call whose rate limit is about codes.
  "send-code": (err) => (httpError(err)?.status === 429 ? "Please wait a minute before asking for another code." : null),
  // The profile, pairing, a code check and claiming a phone: the shared lines.
  account: () => null,
  join: withBusy((err) => {
    const status = httpError(err)?.status;
    // Only the redeem call (an HttpError) answers about the link and the room. Sign-up (a CoreRequestError) has its
    // own 404/410 for an expired sign-up, which says nothing about the link.
    if (status === 403) return archived(err) ?? "You can't join this room.";
    if (status === 404 || status === 410) return LINK_GONE_TEXT;
    return null;
  }),
  "invite-link": withBusy((err) => (httpError(err)?.status === 403 ? (archived(err) ?? "You can't invite people to this room.") : null)),
  // A message, reaction, answer or app note. A slow-mode 429 says how long to wait, so it comes before "busy".
  send: (err) => sendLimit(err) ?? archived(err) ?? busy(err),
  // A message the send adapter couldn't deliver. Core reports the server's refusal as its request line, read through
  // sendRefusal: the room's rules first, then a refusal of the sender. Anything else gets the retry line, never the
  // server's sentence.
  delivery: (err) => {
    const refusal = sendRefusal(err);
    if (!refusal) return busy(err);
    if (refusal.code === "SPACE_ARCHIVED") return ARCHIVED_TEXT;
    const limit = sendLimit({ body: refusal.body });
    if (limit) return limit;
    // The server refuses a sender who left the room and a sender whose device key it can't verify with the same 403
    // code, so only its membership sentence means "not in the room". A body core cut short fails safe to retry.
    if (refusal.status === 403) return MEMBERSHIP_REFUSAL.test(refusal.body) ? NOT_IN_ROOM_TEXT : RETRY_TEXT;
    // Core refreshes an expired or unknown subkey after a 401 and corrects a skewed clock, so trying again works; only
    // these reasons sign the device out.
    if (refusal.status === 401) return refusal.reason && SIGNED_OUT_REASONS.has(refusal.reason) ? SEND_SIGNED_OUT_TEXT : RETRY_TEXT;
    if (refusal.status === 429) return TOO_MANY_TEXT;
    return refusal.status >= 500 ? BUSY_TEXT : RETRY_TEXT;
  },
  // An edit or unsend: the time windows and an already unsent message come first.
  revise: (err) => revisionError(err) ?? sendLimit(err) ?? archived(err) ?? busy(err),
  leave: busy,
  "remove-member": busy,
  // Opening a file in the reader, under its "Couldn't open this file" heading. A file that came but couldn't be
  // decrypted or rendered is a preview failure, not a download failure, so it doesn't say to check the connection.
  file: withBusy((err) => {
    const http = httpError(err);
    if (http?.status === 404 || http?.status === 410) return "This file is no longer available.";
    if (http?.status === 403) return "You don't have access to this file.";
    if (http || coreError(err) || (err instanceof TypeError && NETWORK_TYPE_ERROR.test(err.message))) return null;
    return "Huddo can't show this file.";
  }),
  // Turning a room app on or off, or deleting it. room-apps.ts wraps each failure in an AppError for the app's bridge,
  // so the screen reads the failure inside it.
  "room-app": (err) => {
    const source = err instanceof Error && err.name === "AppError" ? (err as Failed<{ source: unknown }>).source : err;
    return busy(source) ?? sharedText(source);
  },
  // Their own failures are sentences we wrote (UserFacingError); anything else gets the shared lines.
  "log-out": () => null,
  sms: () => null,
};

/**
 * A failed operation as one short line for the person who started it. A sentence we wrote (UserFacingError) is
 * shown as written; anything else goes to the console, and the screen gets the operation's line or a shared one.
 * `npm run audit:error-text` fails on screen code that reads an error's text anywhere else.
 */
export function errorText(err: unknown, operation: ErrorOperation): string {
  if (err instanceof UserFacingError) return err.message;
  console.warn(`Huddo: ${operation} failed:`, err);
  return OPERATIONS[operation](err) ?? sharedText(err);
}

function sharedText(err: unknown): string {
  const http = httpError(err);
  if (http) {
    if (http.status === 429) return TOO_MANY_TEXT;
    try {
      const body = JSON.parse(http.body) as { message?: string };
      const readable = body.message && !INTERNAL_ID.test(body.message) ? body.message : null;
      if (readable && (http.status < 500 || http.status === 503)) return asSentence(readable);
    } catch {
    }
    return RETRY_TEXT;
  }
  const core = coreError(err);
  if (err instanceof TypeError && !NETWORK_TYPE_ERROR.test(err.message)) return RETRY_TEXT;
  if (err instanceof TypeError || core?.code === "network_unavailable") return OFFLINE_TEXT;
  if (core?.status === 429) return TOO_MANY_TEXT;
  // Their messages are the request line and the runtime's code, which mean nothing to a person.
  if (core || (err instanceof Error && err.name === "UnknownOutcomeError")) return RETRY_TEXT;
  // Anything else is an Error we didn't word for people (sentences we did are UserFacingErrors), so its text stays in
  // the console.
  return RETRY_TEXT;
}

/** A server's lowercase reason as a sentence: capital first letter, full stop at the end. */
export function asSentence(text: string): string {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
