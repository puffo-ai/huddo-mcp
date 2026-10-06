import type { PuffoHttpClient } from "../src/http/client";
import { parseAttachmentsContent, type AttachmentReference } from "../src/features/attachments/domain/attachment";
import {
  isMembershipSystemContent,
  parseMembershipSystemContent,
} from "../src/features/spaces/domain/membership-system-message";
import { isPlaintextEnvelope, type PlaintextMessageEnvelope } from "../src/message/core/types";
import { isWhisperContent, type WhisperContent } from "../src/huddo/whisper";

export type WhisperOpener = (sealed: WhisperContent, ctx: { spaceId: string; channelId: string; sender: string }) => string | null;

let whisperOpener: WhisperOpener | null = null;

export function setWhisperOpener(opener: WhisperOpener | null): void {
  whisperOpener = opener;
}

export interface Row {
  seq: number;
  id: string;
  sender: string;
  sentAt: number;
  text: string;
  attachments: AttachmentReference[];
  replyTo: string | null;
  system?: { action: string; actor: string; target?: string };
  blocked?: boolean;
  whisper?: { to: string; readable: boolean };
}

interface HistoryResponse {
  messages?: { seq: number; envelope: { type?: string } }[];
  has_more?: boolean;
  next_before?: number;
  next_before_id?: string;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text ?? "");
  }
  return "";
}

export function rowFromEnvelope(seq: number, envelope: { type?: string }, channelId: string): Row | null {
  if (!isPlaintextEnvelope(envelope)) return null;
  const payload = (envelope as PlaintextMessageEnvelope).signed_payload?.payload;
  if (
    payload?.envelope_kind !== "channel"
    || payload.channel_id !== channelId
    || payload.is_visible_to_human === false
    || payload.thread_root_id
    || typeof payload.sender_slug !== "string"
    || typeof payload.sent_at !== "number"
  ) return null;
  const base = {
    seq,
    id: envelope.envelope_id,
    sender: payload.sender_slug,
    sentAt: payload.sent_at,
    replyTo: typeof payload.reply_to_id === "string" ? payload.reply_to_id : null,
  };
  if (isMembershipSystemContent(payload.content_type)) {
    const event = parseMembershipSystemContent(payload.content);
    if (!event) return null;
    return { ...base, text: "", attachments: [], system: { action: event.action, actor: event.actor_slug } };
  }
  if (isWhisperContent(payload.content)) {
    const opened = typeof payload.space_id === "string"
      ? whisperOpener?.(payload.content, { spaceId: payload.space_id, channelId, sender: payload.sender_slug }) ?? null
      : null;
    return { ...base, text: opened ?? "", attachments: [], whisper: { to: payload.content.to, readable: opened !== null } };
  }
  const parsed = parseAttachmentsContent(payload.content);
  const text = parsed ? parsed.text : contentText(payload.content);
  const attachments = parsed?.attachments ?? [];
  if (!text.trim() && attachments.length === 0) return null;
  return { ...base, text, attachments };
}

export async function fetchRows(http: PuffoHttpClient, channelId: string, limit: number): Promise<Row[]> {
  const resp = await http.get<HistoryResponse>(
    `/v2/messages/history/channel/${encodeURIComponent(channelId)}?limit=${limit}`,
  );
  return (resp.messages ?? [])
    .flatMap(({ seq, envelope }) => {
      const row = envelope ? rowFromEnvelope(seq, envelope, channelId) : null;
      return row ? [row] : [];
    })
    .sort((a, b) => a.seq - b.seq);
}

export interface HistoryPage {
  rows: Row[];
  maxSeq: number;
  minSeq: number;
  next: { before: number; beforeId: string } | null;
}

export async function fetchPage(
  http: PuffoHttpClient,
  channelId: string,
  limit: number,
  before?: { before: number; beforeId: string },
): Promise<HistoryPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) {
    params.set("before", String(before.before));
    params.set("before_id", before.beforeId);
  }
  const resp = await http.get<HistoryResponse>(`/v2/messages/history/channel/${encodeURIComponent(channelId)}?${params}`);
  const messages = resp.messages ?? [];
  const seqs = messages.map((m) => m.seq);
  return {
    rows: messages.flatMap(({ seq, envelope }) => {
      const row = envelope ? rowFromEnvelope(seq, envelope, channelId) : null;
      return row ? [row] : [];
    }),
    maxSeq: seqs.length ? Math.max(...seqs) : 0,
    minSeq: seqs.length ? Math.min(...seqs) : 0,
    next: resp.has_more && typeof resp.next_before === "number" && resp.next_before_id
      ? { before: resp.next_before, beforeId: resp.next_before_id }
      : null,
  };
}

export const HISTORY_PAGE = 100;
const MAX_BACKFILL_PAGES = 50;

export async function fetchSince(
  http: PuffoHttpClient,
  channelId: string,
  cursor: number,
): Promise<{ rows: Row[]; maxSeq: number }> {
  const bySeq = new Map<number, Row>();
  let maxSeq = cursor;
  let before: HistoryPage["next"] | undefined;
  for (let page = 0; page < MAX_BACKFILL_PAGES; page += 1) {
    const got = await fetchPage(http, channelId, HISTORY_PAGE, before ?? undefined);
    maxSeq = Math.max(maxSeq, got.maxSeq);
    for (const row of got.rows) if (row.seq > cursor) bySeq.set(row.seq, row);
    if (!got.next || got.minSeq <= cursor) break;
    before = got.next;
  }
  return { rows: [...bySeq.values()].sort((a, b) => a.seq - b.seq), maxSeq };
}

export async function latestSeqOf(http: PuffoHttpClient, channelId: string): Promise<number> {
  return (await fetchPage(http, channelId, 1)).maxSeq;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isPeer(sender: string, pairs: Record<string, string>, self?: string): boolean {
  return Boolean(self && sender !== self && pairs[self] && pairs[sender] === pairs[self]);
}

export function operatorTag(sender: string, pairs: Record<string, string>, self?: string): string {
  if (self && pairs[self] === sender) return "[your operator]";
  if (isPeer(sender, pairs, self)) return "[peer]";
  const agent = Object.entries(pairs).find(([, operator]) => operator === sender)?.[0];
  return agent ? `[operator_of: ${agent}]` : "";
}

const PARENT_PREVIEW_CHARS = 60;

export function parentPreview(row: Row, names: Record<string, string> = {}): string {
  if (row.whisper && !row.whisper.readable) {
    const to = row.whisper.to;
    return `[whisper to ${names[to] ? `${to} (${names[to]})` : to}]`;
  }
  const flat = row.text.replace(/\s+/g, " ").trim();
  if (flat) return [...flat].length > PARENT_PREVIEW_CHARS ? `${[...flat].slice(0, PARENT_PREVIEW_CHARS).join("")}…` : flat;
  const count = row.attachments.length;
  return count === 1 ? row.attachments[0].filename : `${count} attachments`;
}

export function formatRow(
  row: Row,
  names: Record<string, string>,
  prefix = "",
  tag = "",
  parents: Record<string, Row> = {},
): string {
  const who = (slug: string) => (names[slug] ? `${slug} (${names[slug]})` : slug);
  const head = `${prefix}#${row.seq || "-"} ${row.id} | ${who(row.sender)} | ${new Date(row.sentAt).toISOString()} | `;
  if (row.system) return `${head}* ${who(row.system.actor)} ${row.system.action}${row.system.target ? ` ${who(row.system.target)}` : ""}`;
  const flat = row.text.replace(/\r?\n/g, "\\n");
  const parts = row.whisper ? [`[whisper to ${who(row.whisper.to)}]`, row.whisper.readable ? flat : ""] : [flat];
  if (row.attachments.length) {
    parts.push(`[attachments: ${row.attachments.map((a) => `${a.filename} (${a.mime_type}, ${formatSize(a.size)})`).join(", ")}]`);
  }
  if (row.replyTo) {
    const parent = parents[row.replyTo];
    parts.push(
      parent
        ? `[reply_to: ${row.replyTo} from ${who(parent.sender)}: ${JSON.stringify(parentPreview(parent, names))}]`
        : `[reply_to: ${row.replyTo}]`,
    );
  }
  if (tag) parts.push(tag);
  return head + parts.filter(Boolean).join(" ");
}
