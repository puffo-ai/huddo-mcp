export type CoreHttpTransport = Readonly<{
  serverUrl: string;
  slug: string;
  send(method: string, path: string, body: Uint8Array): Promise<Response>;
}>;

let installed: CoreHttpTransport | null = null;

export function installCoreHttpTransport(transport: CoreHttpTransport | null): void {
  installed = transport;
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

/** Mirrors core's passthrough_path_allowed (providers/server/http/provider.rs). */
export function corePassthroughAllowed(method: string, path: string): boolean {
  const route = segments(path);
  const upper = method.toUpperCase();
  if (route[0] === "blobs" && route.length === 2) return route[1] === "upload" ? upper === "POST" : upper === "GET";
  const startsWith = (prefix: string) => segments(prefix).every((part, i) => route[i] === part);
  if (DENIED_PREFIXES.some(startsWith)) return false;
  if (route.length === 1 && route[0] === "messages") return false;
  if (route[0] === "messages" && route[2] === "processing") return false;
  if (route[0] === "spaces" && route[2] === "events") return false;
  if (route[0] === "spaces" && route[2] === "channels" && route[4] === "events") return false;
  if (route[0] === "invites") return upper === "GET";
  return true;
}

export function coreOwnsAcks(serverUrl: string, slug: string): boolean {
  return installed?.serverUrl === serverUrl.replace(/\/+$/, "") && installed.slug === slug;
}

export function coreHttpTransportFor(serverUrl: string, slug: string, method: string, path: string): CoreHttpTransport | null {
  if (!installed || installed.serverUrl !== serverUrl || installed.slug !== slug) return null;
  return corePassthroughAllowed(method, path) ? installed : null;
}
