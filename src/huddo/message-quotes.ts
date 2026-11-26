import { ANCHOR_ID, APP_ID, anchorOf, pageOf, selectorsOf, type AnchorSelector, type AppAnchor } from "./app-anchors";
import { validId } from "./message-id";

/** A quoted part of a file: what it says (`label`) and where it is, with the selectors an app part has. */
export interface FilePart {
  label: string;
  selectors: AnchorSelector[];
}

/**
 * What a message quotes: a part of an app, a file or a part of it, a link, or a part of another message's text. A
 * reply to a whole message is `reply_to_id` instead. A message has at most one.
 */
export type MessageQuote =
  | ({ type: "anchor" } & AppAnchor)
  | ({ type: "file"; blob_id: string; name: string } & Partial<FilePart>)
  | { type: "link"; url: string; title?: string }
  | ({ type: "message"; message_id: string } & FilePart);

const BLOB_ID = /^b_[A-Za-z0-9_-]{1,80}$/;
const MAX_NAME = 200;
const MAX_URL = 2048;

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function webUrl(raw: unknown): string | null {
  if (!text(raw, MAX_URL)) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** A quote of a whole app has no selectors: a click opens the app at its start. */
function wholeApp(q: Record<string, unknown>): AppAnchor | null {
  const ok = text(q.id, 20) && ANCHOR_ID.test(q.id) && text(q.app, 40) && APP_ID.test(q.app) && text(q.label, 80) && Array.isArray(q.selectors) && q.selectors.length === 0;
  return ok ? { id: q.id as string, app: q.app as string, label: q.label as string, selectors: [] } : null;
}

export function quoteOf(raw: unknown): MessageQuote | null {
  const q = raw as Record<string, unknown> | null;
  if (!q || typeof q !== "object") return null;
  if (q.type === "anchor") {
    const anchor = anchorOf(q) ?? wholeApp(q);
    return anchor ? { type: "anchor", ...anchor } : null;
  }
  if (q.type === "file") {
    if (!text(q.blob_id, 84) || !BLOB_ID.test(q.blob_id) || !text(q.name, MAX_NAME)) return null;
    const file = { type: "file" as const, blob_id: q.blob_id, name: q.name };
    const part = filePartOf(q);
    return part ? { ...file, ...part } : file;
  }
  if (q.type === "link") {
    const url = webUrl(q.url);
    if (!url) return null;
    return text(q.title, MAX_NAME) ? { type: "link", url, title: q.title } : { type: "link", url };
  }
  if (q.type === "message") {
    const part = filePartOf(q);
    return validId(q.message_id) && part ? { type: "message", message_id: q.message_id, ...part } : null;
  }
  return null;
}

/** A file quote's part: its label and selectors, the text among them; a quote without one names the whole file. */
function filePartOf(q: Record<string, unknown>): FilePart | null {
  const selectors = selectorsOf(q.selectors);
  if (!text(q.label, 80) || !selectors.some((s) => s.type === "TextQuoteSelector")) return null;
  return { label: q.label, selectors };
}

const plain = (s: string) => s.replace(/[*_`~#>[\]\\]/g, "").replace(/\s+/g, " ").trim();

/**
 * Whether a message's text says the quoted part, word for word. Markdown marks and spacing don't count, since a
 * person selects the text as the message shows it.
 */
export const partIn = (text: string, exact: string) => plain(exact) !== "" && plain(text).includes(plain(exact));

/** The text a quote of a part of a message says it is: its TextQuoteSelector. */
export const exactOf = (quote: FilePart) => quote.selectors.find((s) => s.type === "TextQuoteSelector")?.exact ?? "";

/** How a quoted message part reads, made from the text that was checked against the message, never from its label. */
export function shownPart(quote: FilePart): string {
  const text = exactOf(quote).replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** The quote of a message's content: the first entry of `quotes`, if it is valid. */
export function quoteOfContent(content: unknown): MessageQuote | null {
  const list = (content as { quotes?: unknown } | null)?.quotes;
  return Array.isArray(list) && list.length ? quoteOf(list[0]) : null;
}

export function quoteContent(text: string, quote: MessageQuote, attachments: unknown[] = []) {
  return { text, attachments, quotes: [quote] };
}

/** The short name a person sees for a quote, for example in "Quoting …". */
export function quoteTitle(quote: MessageQuote, appName: (id: string) => string | undefined = () => undefined): string {
  if (quote.type === "file") return quote.label ? `${quote.name} › “${quote.label}”` : quote.name;
  if (quote.type === "link") return quote.title ?? quote.url;
  if (quote.type === "message") return `Message › “${quote.label}”`;
  const name = appName(quote.app) ?? quote.app;
  return quote.selectors.length ? `${name} › “${quote.label}”` : name;
}

/** One line for clients that draw rows as text, so an Agent can find what the message quotes. */
export function quoteMark(quote: MessageQuote): string {
  if (quote.type === "file") {
    const exact = quote.selectors?.find((s) => s.type === "TextQuoteSelector");
    const page = quote.selectors ? pageOf(quote.selectors) : null;
    const text = exact?.type === "TextQuoteSelector" ? exact : null;
    const part = [
      text ? `, quote ${JSON.stringify(text.exact)}` : "",
      text?.prefix ? `, prefix ${JSON.stringify(text.prefix)}` : "",
      text?.suffix ? `, suffix ${JSON.stringify(text.suffix)}` : "",
      page ? `, page ${page}` : "",
    ].join("");
    return `[quote file ${quote.blob_id}: ${JSON.stringify(quote.name)}${part}]`;
  }
  if (quote.type === "link") return `[quote link ${quote.url}${quote.title ? ` ${JSON.stringify(quote.title)}` : ""}]`;
  if (quote.type === "message") {
    const exact = quote.selectors.find((s) => s.type === "TextQuoteSelector");
    return `[quote message ${quote.message_id}${exact?.type === "TextQuoteSelector" ? `: quote ${JSON.stringify(exact.exact)}` : ""}]`;
  }
  const exact = quote.selectors.find((s) => s.type === "TextQuoteSelector");
  const css = quote.selectors.find((s) => s.type === "CssSelector");
  const parts = [`app:${quote.app}`];
  if (exact?.type === "TextQuoteSelector") parts.push(`quote ${JSON.stringify(exact.exact)}`);
  if (css?.type === "CssSelector") parts.push(`css ${JSON.stringify(css.value)}`);
  if (quote.code) parts.push("code");
  return `[quote anchor ${quote.id}: ${parts.join(", ")}]`;
}
