import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { quoteMark } from "../src/huddo/message-quotes";
import { neutralizeTags, safeLine } from "../src/huddo/projection";
import { getAppCode, toAppError } from "../src/huddo/room-apps";
import { locate } from "./message-links";
import { account, currentRoom, writeNewFile, type Ctx } from "./ops";
import { UserError } from "./text-args";

const IMAGE = /data:image\/(png|jpe?g|gif|webp|svg\+xml)(;base64)?,([^"')\s]+)/g;
const SVG = /<svg[\s\S]*?<\/svg>/g;
const NO_SCRIPTS = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`;
const EXT: Record<string, string> = { png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif", webp: "webp", "svg+xml": "svg" };

/** The HTML as files: itself, then each data: image and each inline SVG in it. */
export function codeFiles(name: string, html: string): { name: string; data: string | Buffer }[] {
  const files: { name: string; data: string | Buffer }[] = [{ name: `${name}.html`, data: `${NO_SCRIPTS}\n${html}` }];
  let n = 0;
  for (const m of html.matchAll(IMAGE)) {
    let data: string | Buffer;
    try {
      data = m[2] ? Buffer.from(m[3]!, "base64") : decodeURIComponent(m[3]!);
    } catch {
      continue;
    }
    files.push({ name: `${name}-image-${++n}.${EXT[m[1]!]}`, data: m[1] === "svg+xml" ? cleanCode(String(data)) : data });
  }
  let s = 0;
  for (const m of html.matchAll(SVG)) files.push({ name: `${name}-svg-${++s}.svg`, data: cleanCode(m[0]) });
  return files;
}

/** Quoted code comes from any room member: drop scripts, event handlers and javascript: links. */
export function cleanCode(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?(<\/script\s*>|$)/gi, "")
    .replace(/[\s/]+on[\w-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+([\w:-]+)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");
}

function save(out: string, name: string, html: string): string[] {
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  return codeFiles(name, html).map((f) => writeNewFile(dir, f.name, f.data));
}

const framed = (id: string, body: string) => `--- code ${id} (${body.length} chars) ---\n${body.replace(/^--- (end )?code /gm, "-- $1code ")}\n--- end code ${id} ---`;

/** A room app's HTML source, or the code of each part of an app that a message quotes. */
export async function appCode(ctx: Ctx, opts: { app?: string; fromMsg?: string; room?: string; out?: string }) {
  if (!opts.app === !opts.fromMsg) throw new UserError("give an app id or --from-msg <msgid>, not both: huddo app code <app-id> | huddo app code --from-msg <msgid>");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  if (opts.fromMsg) {
    const { merged, at } = await locate(acct, room, opts.fromMsg);
    const a = merged[at]?.quote;
    if (a?.type !== "anchor") throw new UserError(`${opts.fromMsg} does not quote a room app`);
    const head = safeLine(quoteMark(a));
    const json = { msgid: opts.fromMsg, quote: a.code ? { ...a, code: cleanCode(a.code) } : a };
    if (!a.code) return { json: { ...json, files: [] }, text: `${head}\nno code: it was quoted from the CLI or MCP, or the part was too large. Use huddo app code ${a.app}.` };
    const code = cleanCode(a.code);
    if (!opts.out) return { json: { ...json, files: [] }, text: `${head}\n${framed(a.id, neutralizeTags(code))}` };
    const files = save(opts.out, a.id, code);
    return { json: { ...json, files }, text: `${head}\n${files.join("\n")}` };
  }
  const app = await getAppCode(acct.http, room.spaceId, opts.app!).catch((err: unknown) => {
    const e = toAppError(err);
    throw new UserError(`${e.code}: ${e.message}`);
  });
  if (!opts.out) return { json: { app: opts.app, ...app }, text: framed(opts.app!, neutralizeTags(app.code)) };
  const paths = save(opts.out, opts.app!, app.code);
  return { json: { app: opts.app, version: app.version, files: paths }, text: `${opts.app} v${app.version} (${app.code.length} characters):\n${paths.join("\n")}` };
}
