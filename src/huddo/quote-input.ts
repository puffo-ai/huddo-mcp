import { anchorOf, newAnchorId } from "./app-anchors";
import { exactOf, partIn, quoteOf, type FilePart, type MessageQuote } from "./message-quotes";

/**
 * One thing a message quotes, as an agent names it: a part of a room app (`app` + `text`), a file in the room or a
 * part of it (`file` + `text`), a link, or a part of a message's text (`message` + `text`).
 */
export interface QuoteInput {
  app?: string;
  text?: string;
  css?: string;
  file?: string;
  url?: string;
  message?: string;
}

export interface QuoteSources {
  apps: () => Promise<{ app_id: string; name: string; version?: number; is_page?: boolean }[]>;
  /** Files in the room, newest first. */
  files: () => Promise<{ blob_id: string; filename: string }[]>;
  /** Where an agent finds the room's files, for the "no file" error. */
  filesHint: string;
  /** Files in the whispers this agent can open; they are never quoted. */
  whisperFiles?: () => Promise<{ blob_id: string; filename: string }[]>;
  /** A message of the room by its id, if this agent has it, with its text; a whisper's text is never quoted. */
  message?: (id: string) => Promise<{ whisper: boolean; text: string } | null>;
}

/** A quote an agent gave that can't be sent; the message says why. */
export class QuoteInputError extends Error {}

export const MAX_QUOTE_CHARS = 500;

/** A message that quotes something must also say why. */
export const QUOTE_NEEDS_TEXT = "a quote needs text: say what you are quoting it for";

/** The part an agent names by its text: the text to find, and a label a person reads. */
function textPart(raw: string): FilePart {
  const text = raw.trim();
  if (!text || text.length > MAX_QUOTE_CHARS) throw new QuoteInputError(`quote text must be 1-${MAX_QUOTE_CHARS} characters`);
  const label = text.replace(/\s+/g, " ");
  return { label: label.length > 60 ? `${label.slice(0, 57)}…` : label, selectors: [{ type: "TextQuoteSelector", exact: text }] };
}

/** The quote a message carries, built from what an agent gave. */
export async function buildQuote(input: QuoteInput, from: QuoteSources): Promise<MessageQuote> {
  if (input.url !== undefined) {
    const quote = quoteOf({ type: "link", url: input.url.trim() });
    if (!quote) throw new QuoteInputError(`not an http(s) link: "${input.url}"`);
    return quote;
  }
  if (input.message !== undefined) {
    const id = input.message.trim();
    const found = from.message ? await from.message(id) : null;
    if (!found) throw new QuoteInputError(`no message "${id}" in this room: give a message id (msg_...) from read`);
    if (found.whisper) throw new QuoteInputError(`"${id}" is a whisper, and a whisper's text can't be quoted`);
    const part = textPart(input.text ?? "");
    // The room reads the quote as words its sender wrote, so they must be in that message.
    if (!partIn(found.text, exactOf(part))) throw new QuoteInputError(`message "${id}" doesn't say that: quote its text word for word`);
    const quote = quoteOf({ type: "message", message_id: id, ...part });
    if (!quote) throw new QuoteInputError(`message "${id}" can't be quoted`);
    return quote;
  }
  if (input.file !== undefined) {
    const want = input.file.trim();
    const files = await from.files();
    const named = (list: { blob_id: string; filename: string }[]) =>
      list.find((f) => f.blob_id === want) ?? list.find((f) => f.filename.toLowerCase() === want.toLowerCase());
    const hit = named(files);
    if (!hit && from.whisperFiles && named(await from.whisperFiles())) {
      throw new QuoteInputError(`"${want}" was shared in a whisper, and files in a whisper can't be quoted`);
    }
    if (!hit) throw new QuoteInputError(`no file "${want}" in this room: ${from.filesHint}`);
    const part = input.text === undefined ? null : textPart(input.text);
    const quote = quoteOf({ type: "file", blob_id: hit.blob_id, name: hit.filename.slice(0, 200), ...part });
    if (!quote) throw new QuoteInputError(`file "${want}" can't be quoted`);
    return quote;
  }
  const apps = await from.apps();
  const app = apps.find((a) => a.app_id === input.app) ?? (input.app === "home" ? apps.find((a) => a.is_page) : undefined);
  if (!app) throw new QuoteInputError(`no room app "${input.app}": use one of ${apps.map((a) => a.app_id).join(", ") || "(none)"}`);
  const { label, selectors } = textPart(input.text ?? "");
  const anchor = anchorOf({
    id: newAnchorId(),
    app: app.app_id,
    label,
    selectors: [...selectors, ...(input.css ? [{ type: "CssSelector", value: input.css }] : [])],
    version: app.version,
  });
  if (!anchor) throw new QuoteInputError(`quote for "${app.app_id}" is not valid`);
  return { type: "anchor", ...anchor };
}
