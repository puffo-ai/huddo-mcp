import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { matchesSearch, type SearchQuery } from "../src/huddo/search-match";
import { awaitCoreMessageReader } from "../src/application/runtime/core-message-reader-port";
import { identityDir } from "./home";
import { rowFromStored, type Row } from "./rows";

const PAGE = 100;
/** Every row core holds for a room; a room's history is read whole, as the old local store was. */
const ALL_ROWS = 100_000;

export interface RoomMeta {
  channelId: string;
  complete: boolean;
}

/** The rows core holds for the room, oldest first. */
export async function storedRows(channelId: string): Promise<Row[]> {
  const reader = await awaitCoreMessageReader();
  const messages = (await reader.getChannelHistory(channelId, ALL_ROWS)) ?? [];
  const bySeq = new Map<number, Row>();
  for (const message of messages) {
    const row = rowFromStored(message, channelId);
    if (row) bySeq.set(row.seq, row);
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export async function loadMeta(channelId: string): Promise<RoomMeta> {
  const window = await (await awaitCoreMessageReader()).historyWindow(channelId);
  return { channelId, complete: window?.complete ?? false };
}

/** Brings the room's newest messages into core. */
export async function syncRoom(channelId: string): Promise<RoomMeta> {
  await (await awaitCoreMessageReader()).backfillChannel(channelId, PAGE);
  return loadMeta(channelId);
}

/** Brings one page of older messages into core. */
export async function extendBack(channelId: string): Promise<RoomMeta> {
  const { complete } = await (await awaitCoreMessageReader()).loadOlder(channelId, PAGE);
  return { channelId, complete };
}

export function mergeRevisions(rows: Row[]): Row[] {
  const byId = new Map<string, Row>();
  const out: Row[] = [];
  for (const row of rows) {
    if (row.revision) {
      const target = byId.get(row.revision.target);
      if (!target || target.sender !== row.sender) continue;
      if (row.revision.kind === "unsend") Object.assign(target, { text: "", attachments: [], unsent: true });
      else if (!target.unsent) Object.assign(target, { text: row.text, edited: row.sentAt });
      continue;
    }
    const copy = { ...row };
    byId.set(copy.id, copy);
    out.push(copy);
  }
  return out;
}

/** `rows` with the text and files of each unsent message removed; `known` holds the unsend events seen so far. */
export function hideUnsent(rows: Row[], known: Row[]): Row[] {
  const senders = new Map<string, string>();
  for (const row of [...known, ...rows]) {
    if (row.revision?.kind === "unsend") senders.set(row.revision.target, row.sender);
  }
  return rows.map((row) =>
    !row.revision && senders.get(row.id) === row.sender ? { ...row, text: "", attachments: [], unsent: true } : row,
  );
}

const legacyRoomsDir = (slug: string) => join(identityDir(slug), "store", "rooms");

/** Rooms the CLI kept in its own files before core, with how many rows each held. */
export function legacyRooms(slug: string): { channelId: string; rows: number }[] {
  const dir = legacyRoomsDir(slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => {
    const lines = join(dir, name, "messages.jsonl");
    const rows = existsSync(lines) ? readFileSync(lines, "utf8").split("\n").filter((line) => line.trim()).length : 0;
    return { channelId: decodeURIComponent(name), rows };
  });
}

/** Keeps the old files, renamed: they may hold the only readable copy of whispers to an old device. */
export function retireLegacyRooms(slug: string): void {
  renameSync(legacyRoomsDir(slug), `${legacyRoomsDir(slug)}.migrated-${Date.now()}`);
}

function filePath(slug: string, blobId: string): string {
  return join(identityDir(slug), "store", "files", encodeURIComponent(blobId));
}

export function cachedFile(slug: string, blobId: string): string | null {
  const path = filePath(slug, blobId);
  return existsSync(path) ? path : null;
}

export function cacheFile(slug: string, blobId: string, bytes: Uint8Array): string {
  const path = filePath(slug, blobId);
  mkdirSync(join(identityDir(slug), "store", "files"), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { mode: 0o600 });
  return path;
}

export type { SearchQuery };

export function matches(row: Row, q: SearchQuery): boolean {
  if (row.system) return false;
  return matchesSearch({ text: row.text, filenames: row.attachments.map((a) => a.filename), sender: row.sender, sentAt: row.sentAt }, q);
}
