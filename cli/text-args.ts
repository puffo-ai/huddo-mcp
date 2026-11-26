import { readFileSync } from "node:fs";
import { SEARCH_TIME_HINT, searchTime } from "../src/huddo/search-match";

export class UserError extends Error {}

export function decodeNewlines(text: string): string {
  return text.replace(/\\\\n|\\n/g, (seq) => (seq.length === 2 ? "\n" : "\\n"));
}

export function messageText(words: string[], readStdin: () => string = () => readFileSync(0, "utf8")): string {
  if (words.length === 1 && words[0] === "-") return readStdin().replace(/\r?\n$/, "");
  return decodeNewlines(words.join(" "));
}

export function splitTrailingReplyTo(text: string): { text: string; replyTo?: string } {
  const m = /\s*--reply[-_]to[=\s]+(msg_[\w-]+)\s*$/.exec(text);
  return m ? { text: text.slice(0, m.index), replyTo: m[1] } : { text };
}

export function parseWhen(raw: string, now = Date.now()): number {
  const at = searchTime(raw, now);
  if (at === null) throw new UserError(`can't read the time "${raw}": ${SEARCH_TIME_HINT}`);
  return at;
}
