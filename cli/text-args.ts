import { readFileSync } from "node:fs";

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
  const rel = /^(\d+)([mhdw])$/.exec(raw.trim());
  if (rel) {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[rel[2] as "m" | "h" | "d" | "w"];
    return now - Number(rel[1]) * unit;
  }
  const at = Date.parse(raw);
  if (Number.isNaN(at)) throw new UserError(`can't read the time "${raw}": use a date like 2026-10-19 or a span like 3d, 12h, 2w`);
  return at;
}
