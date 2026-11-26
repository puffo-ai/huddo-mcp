import { awaitCoreMessageReader } from "../src/application/runtime/core-message-reader-port";
import type { StoredMessage } from "../src/features/messages/domain/message";
import type { AttachmentReference } from "../src/features/attachments/domain/attachment";
import {
  isMembershipSystemContent,
  parseMembershipSystemContent,
} from "../src/features/spaces/domain/membership-system-message";
import { isPlaintextEnvelope, type PlaintextMessageEnvelope } from "../src/message/core/types";
import type { WhisperBody, WhisperContent } from "../src/huddo/whisper";
import type { Choice, ChoiceOption } from "../src/huddo/choices";
import type { FormField, FormResponse } from "../src/huddo/forms";
import { neutralizeTags, oneLine, projectContent, rowMarks } from "../src/huddo/projection";
import type { MessageQuote } from "../src/huddo/message-quotes";
import { formatBytes } from "../src/huddo/format-bytes";

export { isPeer, operatorTag } from "../src/huddo/pairing";
export { formatBytes, neutralizeTags };

export type WhisperOpener = (sealed: WhisperContent, ctx: { spaceId: string; channelId: string; sender: string }) => WhisperBody | null;

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
  quote?: MessageQuote;
  closes?: string;
  reaction?: { emoji: string; target: string; add: boolean };
  new?: boolean;
}

type RowPayload = Pick<
  PlaintextMessageEnvelope["signed_payload"]["payload"],
  "envelope_kind" | "channel_id" | "space_id" | "sender_slug" | "sent_at" | "content_type" | "content" | "reply_to_id" | "thread_root_id" | "is_visible_to_human"
>;

export function rowFromEnvelope(seq: number, envelope: { type?: string }, channelId: string): Row | null {
  if (!isPlaintextEnvelope(envelope)) return null;
  const payload = (envelope as PlaintextMessageEnvelope).signed_payload?.payload;
  return payload ? rowFromPayload(seq, (envelope as PlaintextMessageEnvelope).envelope_id, payload, channelId) : null;
}

/** A message core stored in `channelId`; core keeps only what it verified. */
export function rowFromStored(message: StoredMessage, channelId: string): Row | null {
  if (message.seq == null || !message.channel_id) return null;
  return rowFromPayload(
    message.seq,
    message.envelope_id,
    {
      envelope_kind: message.envelope_kind as RowPayload["envelope_kind"],
      channel_id: message.channel_id,
      space_id: message.space_id,
      sender_slug: message.sender_slug,
      sent_at: message.sent_at,
      content_type: message.content_type,
      content: message.content,
      reply_to_id: message.reply_to_id ?? null,
      thread_root_id: message.thread_root_id ?? null,
      is_visible_to_human: message.is_visible_to_human,
    },
    channelId,
  );
}

function rowFromPayload(seq: number, id: string, payload: RowPayload, channelId: string): Row | null {
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
    id,
    sender: payload.sender_slug,
    sentAt: payload.sent_at,
    replyTo: typeof payload.reply_to_id === "string" ? payload.reply_to_id : null,
  };
  if (isMembershipSystemContent(payload.content_type)) {
    const event = parseMembershipSystemContent(payload.content);
    if (!event) return null;
    return { ...base, text: "", attachments: [], system: { action: event.action, actor: event.actor_slug } };
  }
  const projected = projectContent(payload.content_type, payload.content);
  if (!projected) return null;
  if (projected.kind === "close") return { ...base, text: "", attachments: [], closes: projected.target };
  if (projected.kind === "note") {
    return { ...base, text: projected.text, attachments: [], via: { appId: projected.via.appId, name: projected.via.name } };
  }
  const whisperRow = (sealed: WhisperContent, revises?: string): Row => {
    const opened = typeof payload.space_id === "string"
      ? whisperOpener?.(sealed, { spaceId: payload.space_id, channelId, sender: payload.sender_slug }) ?? null
      : null;
    return {
      ...base,
      text: opened?.text ?? "",
      attachments: opened?.attachments ?? [],
      ...(opened?.quote ? { quote: opened.quote } : {}),
      whisper: { to: sealed.to, readable: opened !== null },
      ...(revises ? { revision: { kind: "edit" as const, target: revises } } : {}),
    };
  };
  if (projected.kind === "whisper") return whisperRow(projected.sealed);
  if (projected.kind === "revision") {
    const { revision } = projected;
    if (revision.kind === "whisper-edit") return whisperRow(revision.sealed, revision.target);
    if (revision.kind === "edit") return { ...base, text: revision.text, attachments: [], revision: { kind: "edit", target: revision.target } };
    return { ...base, text: "", attachments: [], revision: { kind: "unsend", target: revision.target } };
  }
  const { kind: _kind, preview: _preview, ...view } = projected;
  return { ...base, ...view };
}

/** The room's newest rows, oldest first, after core has fetched the newest page. */
export async function recentRows(channelId: string, limit: number): Promise<Row[]> {
  const reader = await awaitCoreMessageReader();
  // Always a whole page: core's history window grows only from where its first page ends, so a 1-row page would
  // leave a small room looking incomplete.
  await reader.backfillChannel(channelId, Math.max(limit, HISTORY_PAGE));
  const messages = (await reader.getChannelHistory(channelId, limit)) ?? [];
  return messages.flatMap((message) => rowFromStored(message, channelId) ?? []).sort((a, b) => a.seq - b.seq);
}

/** The messages around one message; "unavailable" when it is missing, unsent, in another room or a whisper not
 *  to or from you. */
export async function rowsAround(channelId: string, id: string): Promise<Row[] | "unavailable"> {
  const window = await (await awaitCoreMessageReader()).fetchAround(channelId, id);
  if (!window) return "unavailable";
  return window.messages.flatMap((message) => rowFromStored(message, channelId) ?? []).sort((a, b) => a.seq - b.seq);
}

export const HISTORY_PAGE = 100;

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
  const who = (slug: string) => neutralizeTags(names[slug] ? `${slug} (${names[slug]})` : slug);
  const sender = `${who(row.sender)}${tag ? ` ${tag}` : ""}`;
  const head = `${neutralizeTags(prefix)}#${row.seq || "-"} ${row.id} | ${sender} | ${new Date(row.sentAt).toISOString()} | `;
  if (row.system) return oneLine(`${head}* ${who(row.system.actor)} ${row.system.action}${row.system.target ? ` ${who(row.system.target)}` : ""}`);
  const flat = neutralizeTags(row.text.replace(/\r?\n/g, "\\n"));
  const mark = row.revision ? `[${row.revision.kind === "edit" ? "edits" : "unsent"} ${neutralizeTags(row.revision.target)}]` : "";
  const parts = row.whisper ? [`[whisper to ${who(row.whisper.to)}]`, mark, row.whisper.readable ? flat : ""] : [mark, flat];
  if (row.unsent) parts.push("[unsent]");
  else if (row.edited) parts.push("[edited]");
  parts.push(...rowMarks(row.replyTo ? { ...row, quote: undefined } : row));
  if (row.reactions?.length) {
    parts.push(`[reactions: ${row.reactions.map((r) => `${neutralizeTags(r.emoji)} ${r.by.length}`).join(", ")}]`);
  }
  // A whisper someone else can't read says only who whispered to whom, as on the web: not what it replies to.
  if (row.replyTo && !(row.whisper && !row.whisper.readable)) {
    const parent = parents[row.replyTo];
    parts.push(
      parent
        ? `[reply_to: ${neutralizeTags(row.replyTo)} from ${who(parent.sender)}: ${JSON.stringify(neutralizeTags(parentPreview(parent, names)))}]`
        : `[reply_to: ${neutralizeTags(row.replyTo)}]`,
    );
  }
  return oneLine(head + parts.filter(Boolean).join(" "));
}
