import type { SignedHttp } from "./presence";
import { neutralizeTags, safeLine } from "./projection";
import { listApps } from "./room-apps";

export interface RoomAbout {
  welcome: string;
  updated_by: string | null;
  updated_at: number | null;
}

export const MAX_WELCOME_CHARS = 200;
export const MAX_PAGE_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;

const enc = encodeURIComponent;
const welcomePath = (spaceId: string) => `/v2/space/${enc(spaceId)}/welcomeMessage`;
const homePath = (spaceId: string) => `/v2/apps/space/${enc(spaceId)}/home`;
const assetsPath = (spaceId: string) => `/v2/apps/space/${enc(spaceId)}/home-assets`;

export interface HomeAsset {
  name: string;
  blob_id: string;
  mime_type: string;
  size_bytes: number;
}

const ASSET_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

export const ASSET_EXTENSIONS = Object.keys(ASSET_TYPES);

export function isAssetName(name: string): boolean {
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/.test(name);
}

/** The asset's media type from its file extension, or null when the home cannot use the file. */
export function assetType(name: string): string | null {
  return ASSET_TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? null;
}

export async function listHomeAssets(http: SignedHttp, spaceId: string): Promise<HomeAsset[]> {
  return (await http.get<{ assets?: HomeAsset[] }>(assetsPath(spaceId))).assets ?? [];
}

export async function putHomeAsset(
  http: SignedHttp & { postBytes<T>(path: string, bytes: Uint8Array): Promise<T> },
  spaceId: string,
  name: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<HomeAsset> {
  const { blob_id } = await http.postBytes<{ blob_id: string }>("/blobs/upload?purpose=home_asset", bytes);
  return http.put<HomeAsset>(`${assetsPath(spaceId)}/${enc(name)}`, { blob_id, mime_type: mimeType });
}


export const getAbout = (http: SignedHttp, spaceId: string) => http.get<RoomAbout>(welcomePath(spaceId));
export const putWelcome = (http: SignedHttp, spaceId: string, welcome: string) => http.put<RoomAbout>(welcomePath(spaceId), { welcome });
export interface HomeExtras {
  name?: string;
  guide?: string;
  state?: Record<string, unknown>;
}

export const putPage = (http: SignedHttp, spaceId: string, html: string | null, extras: HomeExtras = {}) =>
  html === null
    ? http.delete<unknown>(homePath(spaceId))
    : http.post<unknown>(homePath(spaceId), {
        code: html,
        ...(extras.name ? { name: extras.name } : {}),
        ...(extras.guide ? { guide: extras.guide } : {}),
        ...(extras.state ? { initial_state: extras.state } : {}),
      });

export async function getPage(http: SignedHttp, spaceId: string): Promise<string | null> {
  try {
    const reply = await http.get<{ code?: unknown }>(`${homePath(spaceId)}/code`);
    return typeof reply?.code === "string" ? reply.code : null;
  } catch (e) {
    if ((e as { status?: unknown }).status === 404) return null;
    throw e;
  }
}

export interface RoomHome {
  appId: string;
  name: string;
  guide: string;
  code: string;
  bytes: number;
}

export async function getHome(http: SignedHttp, spaceId: string): Promise<RoomHome | null> {
  const code = await getPage(http, spaceId);
  if (code === null) return null;
  const meta = (await listApps(http, spaceId)).find((a) => a.is_page);
  return { appId: meta?.app_id ?? "home", name: meta?.name ?? "Room home", guide: meta?.guide ?? "", code, bytes: new TextEncoder().encode(code).length };
}

export const HOME_SUMMARY_CHARS = 1500;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** The home's visible text on one line, for join results: no scripts, styles or tags. */
export function homeSummary(html: string): string {
  const lower = html.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const parts: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      parts.push(html.slice(i));
      break;
    }
    if (!/[a-z/!?]/.test(lower[lt + 1] ?? "")) {
      parts.push(html.slice(i, lt + 1));
      i = lt + 1;
      continue;
    }
    parts.push(html.slice(i, lt), " ");
    const hidden = ["script", "style", "noscript"].find((tag) => lower.startsWith(tag, lt + 1) && !/[a-z0-9-]/.test(lower[lt + 1 + tag.length] ?? ""));
    const comment = lower.startsWith("<!--", lt);
    const from = comment ? lower.indexOf("-->", lt + 4) : hidden ? lower.indexOf(`</${hidden}`, lt + 1) : lt;
    const end = from < 0 ? -1 : comment ? from + 2 : html.indexOf(">", from);
    if (end < 0) break;
    i = end + 1;
  }
  const text = parts
    .join("")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]!)
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...text];
  return chars.length > HOME_SUMMARY_CHARS ? `${chars.slice(0, HOME_SUMMARY_CHARS).join("")}…` : text;
}

export const OWNER_WROTE = "written by the room owner";

/** The welcome and home lines that join and info print, the same on every surface; undefined means the read failed. */
export function aboutLines(welcome: string | undefined, home: RoomHome | null | undefined): string[] {
  const welcomeLine = welcome === undefined ? "welcome message: unavailable" : welcome ? `welcome message (${OWNER_WROTE}): ${safeLine(welcome)}` : "welcome message: none";
  const homeLine =
    home === undefined
      ? "home: unavailable"
      : home
        ? `home (${OWNER_WROTE}): ${safeLine(home.name)} (${home.bytes} bytes): ${safeLine(homeSummary(home.code))}`
        : "home: none, Huddo shows a summary";
  return [welcomeLine, homeLine];
}

export function homeHtmlLines(code: string): string[] {
  return ["--- html, written by the room's owner side ---", ...code.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/).map((l) => `  ${neutralizeTags(l)}`), "--- end of home ---"];
}
