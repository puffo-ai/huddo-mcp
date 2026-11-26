import { CoreRequestError, HttpTimeoutError } from "./types";

export type CoreHttpTransport = Readonly<{
  serverUrl: string;
  slug: string;
  send(method: string, path: string, body: Uint8Array): Promise<Response>;
}>;

let installed: CoreHttpTransport | null = null;
let coreSignsAll = false;
const waiters = new Set<Readonly<{ wake(): void; fail(error: Error): void }>>();

export function installCoreHttpTransport(transport: CoreHttpTransport | null): void {
  installed = transport;
  if (transport) for (const waiter of [...waiters]) waiter.wake();
}

/** Core could not start: requests already waiting for it fail now instead of at their timeout. */
export function failCoreSigning(reason: string): void {
  for (const waiter of [...waiters]) waiter.fail(new CoreRequestError("core_not_running", reason));
}

/** The web client: requests core can sign wait for core instead of being signed with keys outside it. */
export function requireCoreSigning(required: boolean): void {
  coreSignsAll = required;
}

const DENIED_PREFIXES = [
  "/auth",
  "/signup",
  "/certs",
  "/blobs",
  "/cloud-key-backups",
  "/devices/enroll",
  "/devices/email-enroll",
  "/devices/subkeys",
  "/devices/chat-recoveries",
  "/messages/pending",
  "/messages/ack",
  "/spaces/events",
];

const segments = (path: string) => path.split(/[?#]/)[0]!.split("/").filter(Boolean);
const dotSegment = (segment: string) => [".", ".."].includes(segment.toLowerCase().replaceAll("%2e", "."));

/** Mirrors core's passthrough_path_allowed (providers/server/http/provider.rs). */
export function corePassthroughAllowed(method: string, path: string): boolean {
  const route = segments(path);
  if (route.some(dotSegment)) return false;
  const upper = method.toUpperCase();
  if (route[0] === "blobs") return blobRouteAllowed(route, upper);
  const startsWith = (prefix: string) => segments(prefix).every((part, i) => route[i] === part);
  if (DENIED_PREFIXES.some(startsWith)) return false;
  if (route.length === 1 && route[0] === "messages") return false;
  if (route[0] === "messages" && route[2] === "processing") return false;
  if (route[0] === "spaces" && route[2] === "events") return false;
  if (route[0] === "spaces" && route[2] === "channels" && route[4] === "events") return false;
  if (route[0] === "invites") return upper === "GET";
  return true;
}

function blobRouteAllowed(route: string[], method: string): boolean {
  if (route[1] === "uploads") {
    if (route.length === 2) return method === "POST";
    if (route.length === 3) return method === "DELETE";
    return route.length === 4 && (route[3] === "parts" || route[3] === "complete") && method === "POST";
  }
  if (route.length === 2) return route[1] === "upload" ? method === "POST" : method === "GET";
  return route.length === 3 && route[2] === "url" && method === "GET";
}

export function coreOwnsAcks(serverUrl: string, slug: string): boolean {
  return installed?.serverUrl === serverUrl.replace(/\/+$/, "") && installed.slug === slug;
}

/** Whether core signs this request, now or once its transport is installed. */
export function coreSignsRequest(serverUrl: string, slug: string, method: string, path: string): boolean {
  if (!corePassthroughAllowed(method, path)) return false;
  return coreSignsAll || matches(installed, serverUrl, slug);
}

const matches = (transport: CoreHttpTransport | null, serverUrl: string, slug: string): transport is CoreHttpTransport =>
  transport !== null && transport.serverUrl === serverUrl && transport.slug === slug;

/**
 * The transport that must sign this request, waiting for core when it signs every request it can; null when the
 * request stays with the caller (a path core refuses, or a host where core does not sign).
 */
export async function awaitCoreHttpTransportFor(
  serverUrl: string,
  slug: string,
  method: string,
  path: string,
  timeoutMs: number,
): Promise<CoreHttpTransport | null> {
  if (!corePassthroughAllowed(method, path)) return null;
  if (matches(installed, serverUrl, slug)) return installed;
  if (!coreSignsAll) return null;
  return new Promise((resolve, reject) => {
    const waiter = {
      wake() {
        if (!matches(installed, serverUrl, slug)) return;
        done();
        resolve(installed);
      },
      fail(error: Error) {
        done();
        reject(error);
      },
    };
    const done = () => {
      waiters.delete(waiter);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => waiter.fail(new HttpTimeoutError(method, path, timeoutMs)), timeoutMs);
    waiters.add(waiter);
  });
}
