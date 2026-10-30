export const CLIENT_HEADER = "x-huddo-client";

export interface WebLabelEnv {
  pathname: string;
  webdriver: boolean;
  coarsePointer: boolean;
}

export function webClientLabel(env: WebLabelEnv): string {
  if (env.pathname === "/cmd" || env.pathname.startsWith("/cmd/")) return "cmd";
  if (env.webdriver) return "browser";
  return env.coarsePointer ? "web/mobile" : "web/desktop";
}

export function browserLabelEnv(win: Window = window): WebLabelEnv {
  return {
    pathname: win.location.pathname,
    webdriver: win.navigator.webdriver === true,
    coarsePointer: win.matchMedia?.("(pointer: coarse)").matches === true,
  };
}

export function currentWebClientLabel(): string {
  return webClientLabel(browserLabelEnv());
}

export function cliClientLabel(argv: readonly string[], version: string): string {
  return argv[0] === "mcp" ? `cli/mcp/${version}` : `cli/${version}`;
}

function prefixOf(target: string): string[] {
  try {
    const url = new URL(target);
    return [`${url.origin}${url.pathname}`];
  } catch {
    return [];
  }
}

/** Labels only requests under `targets` (the Huddo server, the signup proxy); S3 presigned URLs and other hosts never see the header. */
export function labelFetch(base: typeof fetch, targets: readonly string[], label: () => string, page?: string): typeof fetch {
  const prefixes = targets.flatMap(prefixOf);
  return (input, init) => {
    const href = input instanceof Request ? input.url : String(input);
    let resolved = "";
    try {
      resolved = new URL(href, page).href;
    } catch {
      resolved = "";
    }
    if (!prefixes.some((prefix) => resolved.startsWith(prefix))) return base(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(CLIENT_HEADER, label());
    return base(input, { ...init, headers });
  };
}

export function installClientLabel(
  targets: readonly string[],
  label: () => string,
  { target = globalThis, page }: { target?: { fetch: typeof fetch }; page?: string } = {},
): void {
  target.fetch = labelFetch(target.fetch.bind(target), targets, label, page);
}
