/** W3C Web Annotation selectors that point at a part of a room app or of a file; a PDF's part also names its page. */
export type AnchorSelector =
  | { type: "CssSelector"; value: string; refinedBy?: { type: "TextPositionSelector"; start: number; end: number } }
  | { type: "TextQuoteSelector"; exact: string; prefix?: string; suffix?: string }
  | { type: "FragmentSelector"; value: string };

const PAGE_FRAGMENT = /^page=[1-9][0-9]{0,4}$/;

export interface AppAnchor {
  id: string;
  app: string;
  label: string;
  selectors: AnchorSelector[];
  /** The HTML of the part a person quoted, as the app showed it. */
  code?: string;
  /** The app version the part was quoted from. */
  version?: number;
}

export const MAX_CODE = 8192;
const MAX_TEXT = 500;
export const ANCHOR_ID = /^a_[A-Za-z0-9]{4,16}$/;
export const APP_ID = /^[a-z0-9-]{1,40}$/;

const str = (v: unknown, max = MAX_TEXT): v is string => typeof v === "string" && v.length <= max;
const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000;

function selectorOf(raw: unknown): AnchorSelector | null {
  const s = raw as Record<string, unknown> | null;
  if (!s || typeof s !== "object") return null;
  if (s.type === "CssSelector" && str(s.value) && s.value) {
    const r = s.refinedBy as Record<string, unknown> | undefined;
    const refined = r && r.type === "TextPositionSelector" && count(r.start) && count(r.end) && r.start <= r.end ? { type: "TextPositionSelector" as const, start: r.start, end: r.end } : undefined;
    return { type: "CssSelector", value: s.value, ...(refined ? { refinedBy: refined } : {}) };
  }
  if (s.type === "FragmentSelector" && typeof s.value === "string" && PAGE_FRAGMENT.test(s.value)) return { type: "FragmentSelector", value: s.value };
  if (s.type === "TextQuoteSelector" && str(s.exact) && s.exact) {
    return {
      type: "TextQuoteSelector",
      exact: s.exact,
      ...(str(s.prefix, 64) ? { prefix: s.prefix } : {}),
      ...(str(s.suffix, 64) ? { suffix: s.suffix } : {}),
    };
  }
  return null;
}

/** Up to three valid selectors, in order; anything else is dropped. */
export function selectorsOf(raw: unknown): AnchorSelector[] {
  return Array.isArray(raw) ? raw.slice(0, 3).map(selectorOf).filter((s): s is AnchorSelector => s !== null) : [];
}

/** The page a PDF part is on, from its FragmentSelector. */
export function pageOf(selectors: readonly AnchorSelector[]): number | null {
  const fragment = selectors.find((s) => s.type === "FragmentSelector");
  return fragment?.type === "FragmentSelector" ? Number(fragment.value.slice("page=".length)) : null;
}

export function anchorOf(raw: unknown): AppAnchor | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a !== "object" || !str(a.id, 20) || !ANCHOR_ID.test(a.id) || !str(a.app, 40) || !APP_ID.test(a.app) || !str(a.label, 80)) return null;
  const selectors = selectorsOf(a.selectors);
  if (!selectors.length) return null;
  const code = typeof a.code === "string" && a.code && a.code.length <= MAX_CODE ? a.code : undefined;
  const version = Number.isInteger(a.version) && (a.version as number) > 0 ? (a.version as number) : undefined;
  return { id: a.id, app: a.app, label: a.label, selectors, ...(code ? { code } : {}), ...(version ? { version } : {}) };
}

/** The app version a quote's open target was taken from, if it names one. */
export function quotedVersion(target: string | null): number | null {
  if (!target?.startsWith("{")) return null;
  try {
    const v = (JSON.parse(target) as { version?: unknown }).version;
    return Number.isInteger(v) && (v as number) > 0 ? (v as number) : null;
  } catch {
    return null;
  }
}

export function newAnchorId(random: () => number = Math.random): string {
  let id = "a_";
  for (let i = 0; i < 8; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}

export function parseAnchorHref(href: string): { app: string; anchorId: string } | null {
  const m = /^app:([a-z0-9-]{1,40})#(a_[A-Za-z0-9]{4,16})$/.exec(href);
  return m ? { app: m[1]!, anchorId: m[2]! } : null;
}
