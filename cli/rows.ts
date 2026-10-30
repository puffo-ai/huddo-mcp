import type { PuffoHttpClient } from "../src/http/client";
import { HttpError } from "../src/http/types";
import { parseAttachmentsContent, type AttachmentReference } from "../src/features/attachments/domain/attachment";
import {
  isMembershipSystemContent,
  parseMembershipSystemContent,
} from "../src/features/spaces/domain/membership-system-message";
import { isPlaintextEnvelope, type PlaintextMessageEnvelope } from "../src/message/core/types";
import { isAppNoteContent } from "../src/huddo/app-note";
import { isWhisperContent, type WhisperContent } from "../src/huddo/whisper";
import { parseRevision } from "../src/huddo/revisions";
import { choiceOf, closeTargetOf, optionsOf, type Choice, type ChoiceOption } from "../src/huddo/choices";
import { formOf, formResponseOf, type FormField, type FormResponse } from "../src/huddo/forms";

export { isPeer, operatorTag } from "../src/huddo/pairing";

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
  via?: { appId: string; name: string };
  reactions?: { emoji: string; by: string[] }[];
  revision?: { kind: "edit" | "unsend"; target: string };
  edited?: number;
  unsent?: boolean;
  options?: ChoiceOption[];
  choice?: Choice;
  form?: FormField[];
  formResponse?: FormResponse;
  closes?: string;
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
  const revision = parseRevision(payload.content_type, payload.content);
  if (revision?.kind === "edit") return { ...base, text: revision.text, attachments: [], revision: { kind: "edit", target: revision.target } };
  if (revision?.kind === "unsend") return { ...base, text: "", attachments: [], revision: { kind: "unsend", target: revision.target } };
  const closes = closeTargetOf(payload.content_type, payload.content);
  if (closes) return { ...base, text: "", attachments: [], closes };
  if (isWhisperContent(payload.content)) {
    const opened = typeof payload.space_id === "string"
      ? whisperOpener?.(payload.content, { spaceId: payload.space_id, channelId, sender: payload.sender_slug }) ?? null
      : null;
    return {
      ...base,
      text: opened ?? "",
      attachments: [],
      whisper: { to: payload.content.to, readable: opened !== null },
      ...(revision ? { revision: { kind: "edit" as const, target: revision.target } } : {}),
    };
  }
  if (isAppNoteContent(payload.content)) {
    if (!payload.content.text.trim()) return null;
    return { ...base, text: payload.content.text, attachments: [], via: { appId: payload.content.app.id, name: payload.content.app.name } };
  }
  const parsed = parseAttachmentsContent(payload.content);
  const text = parsed ? parsed.text : contentText(payload.content);
  const attachments = parsed?.attachments ?? [];
  if (!text.trim() && attachments.length === 0) return null;
  const options = parsed ? optionsOf(payload.content) : null;
  const choice = parsed ? choiceOf(payload.content) : null;
  const form = parsed ? formOf(payload.content) : null;
  const formResponse = parsed ? formResponseOf(payload.content) : null;
  return { ...base, text, attachments, ...(options ? { options } : {}), ...(choice ? { choice } : {}), ...(form ? { form } : {}), ...(formResponse ? { formResponse } : {}) };
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

interface AroundResponse extends HistoryResponse {
  anchor?: { id?: unknown };
}

/** The messages around one message, from the server's `around` window. "unavailable" is the server's one
 *  answer for a message that is missing, unsent, in another room or a whisper not to or from you;
 *  "unsupported" means the server predates `around` and ignored it. */
export async function fetchAround(
  http: PuffoHttpClient,
  channelId: string,
  id: string,
): Promise<Row[] | "unavailable" | "unsupported"> {
  let resp: AroundResponse;
  try {
    resp = await http.get<AroundResponse>(
      `/v2/messages/history/channel/${encodeURIComponent(channelId)}?around=${encodeURIComponent(id)}`,
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return "unavailable";
    throw e;
  }
  if (resp.anchor?.id !== id) return "unsupported";
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
  maxPages = MAX_BACKFILL_PAGES,
): Promise<{ rows: Row[]; maxSeq: number }> {
  const bySeq = new Map<number, Row>();
  let maxSeq = cursor;
  let before: HistoryPage["next"] | undefined;
  for (let page = 0; page < maxPages; page += 1) {
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

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

const TAG_MARKER = /\[(\s*(?:your\s+operator|peer)\s*)\]|\[(\s*operator_of\s*:)/gi;

export function neutralizeTags(text: string): string {
  return text.replace(TAG_MARKER, (_match, tag: string | undefined, prefix: string | undefined) =>
    tag !== undefined ? `(${tag})` : `(${prefix}`,
  );
}

export function formatRow(
  row: Row,
  names: Record<string, string>,
  prefix = "",
  tag = "",
  parents: Record<string, Row> = {},
): string {
  const who = (slug: string) => neutralizeTags(names[slug] ? `${slug} (${names[slug]})` : slug);
  const sender = `${who(row.sender)}${tag ? ` ${tag}` : ""}`;
  const head = `${neutralizeTags(prefix)}#${row.seq || "-"} ${row.id} | ${sender} | ${new Date(row.sentAt).toISOString()} | `;
  if (row.system) return `${head}* ${who(row.system.actor)} ${row.system.action}${row.system.target ? ` ${who(row.system.target)}` : ""}`;
  const flat = neutralizeTags(row.text.replace(/\r?\n/g, "\\n"));
  const mark = row.revision ? `[${row.revision.kind === "edit" ? "edits" : "unsent"} ${neutralizeTags(row.revision.target)}]` : "";
  const parts = row.whisper ? [`[whisper to ${who(row.whisper.to)}]`, mark, row.whisper.readable ? flat : ""] : [mark, flat];
  if (row.unsent) parts.push("[unsent]");
  else if (row.edited) parts.push("[edited]");
  if (row.via) parts.push(`[via app ${neutralizeTags(row.via.appId)} (${neutralizeTags(row.via.name)})]`);
  if (row.attachments.length) {
    parts.push(`[attachments: ${row.attachments.map((a) => `${a.filename} (${a.mime_type}, ${formatSize(a.size)})`).join(", ")}]`);
  }
  if (row.closes) parts.push(`[closed choices on ${neutralizeTags(row.closes)}]`);
  if (row.options) parts.push(`[options: ${row.options.map((o) => `${neutralizeTags(o.key)}) ${neutralizeTags(o.label)}`).join("  ")}]`);
  if (row.choice) parts.push(row.choice.key ? `[chose ${neutralizeTags(row.choice.key)} of ${neutralizeTags(row.choice.questionId)}]` : `[own answer to ${neutralizeTags(row.choice.questionId)}]`);
  if (row.form) parts.push(`[form: ${row.form.map(formatField).join("  ")}]`);
  if (row.formResponse) parts.push(formatResponse(row.formResponse));
  if (row.reactions?.length) {
    parts.push(`[reactions: ${row.reactions.map((r) => `${r.emoji} ${r.by.length}`).join(", ")}]`);
  }
  if (row.replyTo) {
    const parent = parents[row.replyTo];
    parts.push(
      parent
        ? `[reply_to: ${row.replyTo} from ${who(parent.sender)}: ${JSON.stringify(neutralizeTags(parentPreview(parent, names)))}]`
        : `[reply_to: ${row.replyTo}]`,
    );
  }
  return head + parts.filter(Boolean).join(" ");
}

function formatField(f: FormField): string {
  const kind = f.type === "choice" ? `choice: ${f.options!.map(neutralizeTags).join("|")}` : f.type;
  return `${neutralizeTags(f.key)}) ${neutralizeTags(f.label)} (${kind}${f.required ? ", required" : ""})`;
}

function formatResponse(r: FormResponse): string {
  const id = neutralizeTags(r.questionId);
  if (r.skipped) return `[skipped form ${id}]`;
  const pairs = Object.entries(r.values ?? {}).map(([k, v]) => `${neutralizeTags(k)}=${neutralizeTags(v.replace(/\r?\n/g, "\\n"))}`);
  return `[form answer to ${id}: ${pairs.join("; ")}]`;
}
