import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { safeLine } from "../src/huddo/projection";
import {
  ASSET_EXTENSIONS,
  MAX_ASSET_BYTES,
  MAX_PAGE_BYTES,
  MAX_WELCOME_CHARS,
  aboutLines,
  assetType,
  getAbout,
  getHome,
  homeHtmlLines,
  isAssetName,
  putHomeAsset,
  putPage,
  putWelcome,
} from "../src/huddo/room-info-api";
import { account, currentRoom, errorText, type Ctx } from "./ops";
import { UserError } from "./text-args";

async function owned<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (e) {
    throw new UserError(errorText(e));
  }
}

/** The room's welcome message and home, for any member; with html, the home's full HTML too. */
export async function roomInfo(ctx: Ctx, opts: { html?: boolean; room?: string }) {
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const [about, home] = await Promise.all([owned(getAbout(acct.http, room.spaceId)), owned(getHome(acct.http, room.spaceId))]);
  const lines = [`room: ${safeLine(room.name)} (${room.spaceId})`, ...aboutLines(about.welcome, home)];
  if (opts.html && home) lines.push(...homeHtmlLines(home.code));
  const homeJson = home ? { appId: home.appId, name: home.name, bytes: home.bytes, ...(opts.html ? { html: home.code } : {}) } : null;
  return { json: { spaceId: room.spaceId, room: room.name, welcome: about.welcome, home: homeJson }, text: lines.join("\n") };
}

/** Sets or clears the line newcomers see on the room's invite card; without either, shows the room info. */
export async function roomWelcome(ctx: Ctx, opts: { text?: string; clear?: boolean; room?: string }) {
  const text = opts.clear ? "" : opts.text?.trim();
  if (text === undefined) return roomInfo(ctx, { room: opts.room });
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  const chars = [...text].length;
  if (chars > MAX_WELCOME_CHARS) throw new UserError(`welcome message is ${chars} characters; at most ${MAX_WELCOME_CHARS}`);
  const about = await owned(putWelcome(acct.http, room.spaceId, text));
  return {
    json: { spaceId: room.spaceId, welcome: about.welcome },
    text: about.welcome ? `invite card of "${room.name}" now says: ${safeLine(about.welcome)}` : `cleared the welcome message of "${room.name}"`,
  };
}

/** Sets or clears the room's home, the page every member opens first; without either, shows the room info. */
export async function roomHome(
  ctx: Ctx,
  opts: { file?: string; html?: string; clear?: boolean; name?: string; guide?: string; guideFile?: string; stateFile?: string; state?: unknown; assets?: string[]; room?: string },
) {
  if (!opts.clear && !opts.file && opts.html === undefined) return roomInfo(ctx, { room: opts.room });
  if (opts.clear && opts.assets?.length) throw new UserError("--asset is not used with --clear");
  const acct = account(ctx);
  const room = await currentRoom(acct, opts.room);
  if (opts.clear) {
    await owned(putPage(acct.http, room.spaceId, null));
    return { json: { spaceId: room.spaceId, home: false }, text: `deleted the home of "${room.name}" and its data; it shows Huddo's summary again` };
  }
  if (opts.file && !existsSync(opts.file)) throw new UserError(`file not found: ${opts.file}`);
  const html = opts.file ? readFileSync(opts.file, "utf8") : opts.html!;
  const bytes = Buffer.byteLength(html, "utf8");
  if (!html.trim()) throw new UserError("the home is empty");
  if (bytes > MAX_PAGE_BYTES) throw new UserError(`the home is ${bytes} bytes; at most ${MAX_PAGE_BYTES}`);
  const guide = opts.guideFile ? readText(opts.guideFile) : opts.guide;
  const state = opts.stateFile ? parseState(readText(opts.stateFile), "--state-file") : opts.state === undefined ? undefined : checkState(opts.state, "state");
  const assets = (opts.assets ?? []).map(checkAsset);
  for (const asset of assets) {
    await owned(putHomeAsset(acct.http, room.spaceId, asset.name, readFileSync(asset.path), asset.type));
  }
  await owned(putPage(acct.http, room.spaceId, html, { name: opts.name?.trim() || undefined, guide: guide?.trim() || undefined, state }));
  const names = assets.map((a) => a.name);
  const added = names.length ? `; assets: ${names.join(", ")}` : "";
  return { json: { spaceId: room.spaceId, home: true, bytes, ...(names.length ? { assets: names } : {}) }, text: `members of "${room.name}" now open your home (${bytes} bytes${added})` };
}

function checkAsset(path: string): { path: string; name: string; type: string } {
  if (!existsSync(path)) throw new UserError(`file not found: ${path}`);
  const name = basename(path);
  if (!isAssetName(name)) throw new UserError(`asset name "${name}" must be 1-100 characters of A-Z, a-z, 0-9, '.', '_' and '-', not starting with '.'`);
  const type = assetType(name);
  if (!type) throw new UserError(`asset "${name}" must end in one of: ${ASSET_EXTENSIONS.join(", ")}`);
  const size = statSync(path).size;
  if (size > MAX_ASSET_BYTES) throw new UserError(`asset "${name}" is ${size} bytes; at most ${MAX_ASSET_BYTES}`);
  return { path, name, type };
}

function readText(path: string): string {
  if (!existsSync(path)) throw new UserError(`file not found: ${path}`);
  return readFileSync(path, "utf8");
}

function parseState(raw: string, what: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new UserError(`${what} is not valid JSON`);
  }
  return checkState(value, what);
}

function checkState(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UserError(`${what} must be a JSON object`);
  return value as Record<string, unknown>;
}
