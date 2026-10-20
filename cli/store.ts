import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PuffoHttpClient } from "../src/http/client";
import { identityDir, readJson, writeJson } from "./home";
import { fetchPage, fetchSince, type Row } from "./rows";

export const JOIN_BACKFILL = 100;
export const JOIN_BACKFILL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 100;

export interface RoomMeta {
  channelId: string;
  seeded: boolean;
  complete: boolean;
  maxSeq: number;
  oldest: { sentAt: number; id: string } | null;
}

function roomDir(slug: string, channelId: string): string {
  return join(identityDir(slug), "store", "rooms", encodeURIComponent(channelId));
}

const metaPath = (slug: string, channelId: string) => join(roomDir(slug, channelId), "meta.json");
const linesPath = (slug: string, channelId: string) => join(roomDir(slug, channelId), "messages.jsonl");

export function loadMeta(slug: string, channelId: string): RoomMeta {
  return readJson<RoomMeta>(metaPath(slug, channelId)) ?? { channelId, seeded: false, complete: false, maxSeq: 0, oldest: null };
}

function saveMeta(slug: string, meta: RoomMeta): void {
  writeJson(metaPath(slug, meta.channelId), meta);
}

export function appendRows(slug: string, channelId: string, rows: Row[]): RoomMeta {
  const meta = loadMeta(slug, channelId);
  const kept = rows.filter((r) => r.seq > 0);
  if (!kept.length) return meta;
  const dir = roomDir(slug, channelId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  appendFileSync(
    linesPath(slug, channelId),
    kept.map(({ reactions: _reactions, ...row }) => `${JSON.stringify(row)}\n`).join(""),
    { mode: 0o600 },
  );
  for (const r of kept) {
    meta.maxSeq = Math.max(meta.maxSeq, r.seq);
    if (!meta.oldest || r.sentAt < meta.oldest.sentAt || (r.sentAt === meta.oldest.sentAt && r.id < meta.oldest.id)) {
      meta.oldest = { sentAt: r.sentAt, id: r.id };
    }
  }
  saveMeta(slug, meta);
  return meta;
}

export function storedRows(slug: string, channelId: string): Row[] {
  const path = linesPath(slug, channelId);
  if (!existsSync(path)) return [];
  const bySeq = new Map<number, Row>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as Row;
      bySeq.set(row.seq, row);
    } catch {}
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function mergeRevisions(rows: Row[]): Row[] {
  const byId = new Map<string, Row>();
  const out: Row[] = [];
  for (const row of rows) {
    if (row.revision) {
      const target = byId.get(row.revision.target);
      if (!target) continue;
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

export async function syncRoom(http: PuffoHttpClient, slug: string, channelId: string, now = Date.now()): Promise<RoomMeta> {
  let meta = loadMeta(slug, channelId);
  if (!meta.seeded) {
    const page = await fetchPage(http, channelId, JOIN_BACKFILL);
    const recent = page.rows.filter((r) => r.sentAt >= now - JOIN_BACKFILL_MAX_AGE_MS);
    meta = appendRows(slug, channelId, recent);
    meta.seeded = true;
    meta.complete = !page.next && recent.length === page.rows.length;
    meta.maxSeq = Math.max(meta.maxSeq, page.maxSeq);
    saveMeta(slug, meta);
  }
  if (meta.maxSeq) {
    const got = await fetchSince(http, channelId, meta.maxSeq, Infinity);
    meta = appendRows(slug, channelId, got.rows);
  }
  return meta;
}

export async function extendBack(http: PuffoHttpClient, slug: string, channelId: string): Promise<RoomMeta> {
  let meta = loadMeta(slug, channelId);
  if (meta.complete) return meta;
  const page = await fetchPage(http, channelId, PAGE, meta.oldest ? { before: meta.oldest.sentAt, beforeId: meta.oldest.id } : undefined);
  meta = appendRows(slug, channelId, page.rows);
  if (!page.next) {
    meta.complete = true;
    saveMeta(slug, meta);
  }
  return meta;
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

export interface SearchQuery {
  text?: string;
  from?: ReadonlySet<string>;
  since?: number;
  until?: number;
  hasFile?: boolean;
}

export function matches(row: Row, q: SearchQuery): boolean {
  if (row.system) return false;
  if (q.from && !q.from.has(row.sender)) return false;
  if (q.since !== undefined && row.sentAt < q.since) return false;
  if (q.until !== undefined && row.sentAt > q.until) return false;
  if (q.hasFile && !row.attachments.length) return false;
  if (q.text) {
    const needle = q.text.toLowerCase();
    const hay = [row.text, ...row.attachments.map((a) => a.filename)].join("\n").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}
