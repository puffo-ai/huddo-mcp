export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
  icon?: string;
}

const MAX_HTML_BYTES = 1536 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "Mozilla/5.0 (compatible; HuddoBot/1.0; +https://huddo.ai)";

export function unfurlTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal)$/.test(host)) return null;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return null;
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4]!;
  }
  return out;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(decode(href), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const clip = (text: string | undefined, max: number) => {
  if (!text) return undefined;
  const clean = decode(text);
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

export function parsePreview(html: string, base: string): LinkPreview {
  const end = html.search(/<\/head\s*>/i);
  const head = end >= 0 ? html.slice(0, end) : html;
  const meta = new Map<string, string>();
  let icon: string | undefined;
  for (const m of head.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const attrs = attributes(m[0]);
    if (m[1]!.toLowerCase() === "link") {
      const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
      if (!icon && attrs.href && (rel.includes("icon") || rel.includes("apple-touch-icon"))) icon = attrs.href;
      continue;
    }
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content !== undefined && !meta.has(key)) meta.set(key, attrs.content);
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  return {
    url: base,
    title: clip(meta.get("og:title") ?? meta.get("twitter:title") ?? title, 200),
    description: clip(meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"), 400),
    image: absolute(meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image"), base),
    site: clip(meta.get("og:site_name"), 80),
    icon: absolute(icon ?? "/favicon.ico", base),
  };
}

async function readCapped(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= limit) {
      await reader.cancel();
      size = limit;
      break;
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.subarray(0, size - at), at);
    at += chunk.byteLength;
  }
  return bytes;
}

export type HostGuard = (url: URL) => Promise<boolean>;

async function follow(target: URL, accept: string, fetchImpl: typeof fetch, guard?: HostGuard): Promise<{ response: Response; url: URL } | null> {
  let url = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (guard && !(await guard(url))) return null;
    const response = await fetchImpl(url.href, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = unfurlTarget(absolute(response.headers.get("location") ?? undefined, url.href) ?? null);
      await response.body?.cancel();
      if (!next) return null;
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    return { response, url };
  }
  return null;
}

export async function unfurl(target: URL, fetchImpl: typeof fetch = fetch, guard?: HostGuard): Promise<LinkPreview | null> {
  const found = await follow(target, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", fetchImpl, guard);
  if (!found) return null;
  const { response, url } = found;
  const type = response.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) {
    await response.body?.cancel();
    return { url: url.href, image: url.href };
  }
  if (!/html|xml/i.test(type)) {
    await response.body?.cancel();
    return { url: url.href };
  }
  return parsePreview(new TextDecoder().decode(await readCapped(response, MAX_HTML_BYTES)), url.href);
}

export interface UnfurlAnswer {
  status: number;
  body: string | Uint8Array;
  contentType: string;
}

const json = (status: number, body: string): UnfurlAnswer => ({ status, body, contentType: "application/json" });

export async function unfurlResponse(raw: string | null, fetchImpl: typeof fetch = fetch, guard?: HostGuard): Promise<UnfurlAnswer> {
  const target = unfurlTarget(raw);
  if (!target) return json(400, '{"error":"BAD_URL"}');
  try {
    const preview = await unfurl(target, fetchImpl, guard);
    return preview ? json(200, JSON.stringify(preview)) : json(502, '{"error":"UNREACHABLE"}');
  } catch {
    return json(502, '{"error":"UNREACHABLE"}');
  }
}

export async function unfurlImageResponse(raw: string | null, fetchImpl: typeof fetch = fetch, guard?: HostGuard): Promise<UnfurlAnswer> {
  const target = unfurlTarget(raw);
  if (!target) return json(400, '{"error":"BAD_URL"}');
  try {
    const found = await follow(target, "image/*", fetchImpl, guard);
    if (!found) return json(502, '{"error":"UNREACHABLE"}');
    const type = (found.response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!type.startsWith("image/")) {
      await found.response.body?.cancel();
      return json(415, '{"error":"NOT_AN_IMAGE"}');
    }
    const declared = Number(found.response.headers.get("content-length"));
    if (declared > MAX_IMAGE_BYTES) {
      await found.response.body?.cancel();
      return json(413, '{"error":"TOO_LARGE"}');
    }
    const bytes = await readCapped(found.response, MAX_IMAGE_BYTES + 1);
    if (bytes.byteLength > MAX_IMAGE_BYTES) return json(413, '{"error":"TOO_LARGE"}');
    return { status: 200, body: bytes, contentType: type };
  } catch {
    return json(502, '{"error":"UNREACHABLE"}');
  }
}

export const SAFE_HEADERS = {
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
} as const;

export function sameOrigin(headers: { get(name: string): string | null }): boolean {
  return headers.get("sec-fetch-site") === "same-origin";
}

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export function privateAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (!lower.includes(":")) return v4Private(lower);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
  if (mapped) return v4Private(mapped);
  return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

const CACHE_SECONDS = 24 * 60 * 60;

export async function serveUnfurl(request: Request, answer: (url: string | null) => Promise<UnfurlAnswer>, cache: Cache): Promise<Response> {
  if (!sameOrigin(request.headers)) return new Response('{"error":"FORBIDDEN"}', { status: 403, headers: { "content-type": "application/json" } });
  const key = new Request(request.url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const result = await answer(new URL(request.url).searchParams.get("url"));
  const response = new Response(result.body as BodyInit, {
    status: result.status,
    headers: {
      ...SAFE_HEADERS,
      "content-type": result.contentType,
      "cache-control": result.status === 200 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
    },
  });
  if (result.status === 200) await cache.put(key, response.clone());
  return response;
}
