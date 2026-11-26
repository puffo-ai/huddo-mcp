import type { MessageQuote } from "../src/huddo/message-quotes";
import { buildQuote as buildSharedQuote, QuoteInputError, type QuoteInput, type QuoteSources } from "../src/huddo/quote-input";
import { UserError } from "./text-args";

export type { QuoteInput };

/** `--quote <app-id>:<text>` (with `--quote-css`), `--quote-file <name|blob id>` (with `--quote-text`), `--quote-message <msg id>` (with `--quote-text`) or `--quote-link <url>`: at most one. */
export function quoteFlags(flags: { quote?: string[]; css?: string[]; file?: string[]; text?: string[]; link?: string[]; message?: string[] }): QuoteInput | null {
  const { quote = [], css = [], file = [], text = [], link = [], message = [] } = flags;
  if (quote.length + file.length + link.length + message.length > 1) throw new UserError("a message quotes at most one thing: give one of --quote, --quote-file, --quote-message, --quote-link, once");
  if (text.length > (file.length || message.length ? 1 : 0)) throw new UserError("--quote-text goes with one --quote-file or --quote-message");
  if (message.length && !text.length) throw new UserError("--quote-message needs --quote-text: the part of the message to quote");
  if (css.length > (quote.length ? 1 : 0)) throw new UserError("--quote-css goes with one --quote");
  if (quote[0] !== undefined) {
    const at = quote[0].indexOf(":");
    if (at <= 0) throw new UserError(`--quote takes <app-id>:<text>, got "${quote[0]}"`);
    return { app: quote[0].slice(0, at), text: quote[0].slice(at + 1), ...(css[0] ? { css: css[0] } : {}) };
  }
  if (file[0] !== undefined) return { file: file[0], ...(text[0] !== undefined ? { text: text[0] } : {}) };
  if (message[0] !== undefined) return { message: message[0], text: text[0]! };
  if (link[0] !== undefined) return { url: link[0] };
  return null;
}

/** The quote a message carries, built from what an agent gave; a quote that can't be sent is a UserError. */
export async function buildQuote(input: QuoteInput, from: Omit<QuoteSources, "filesHint">): Promise<MessageQuote> {
  try {
    return await buildSharedQuote(input, { ...from, filesHint: "huddo files lists them" });
  } catch (err) {
    if (err instanceof QuoteInputError) throw new UserError(err.message);
    throw err;
  }
}
