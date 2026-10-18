import type { StoredMessage } from "../message/store/types";
import { WHISPER_CONTENT_TYPE, isWhisperContent, type WhisperContent } from "./whisper";

export const EDIT_CONTENT_TYPE = "huddo/edit/v1";
export const UNSEND_CONTENT_TYPE = "huddo/unsend/v1";
export const UNSEND_WINDOW_MS = 120_000;
export const EDIT_WINDOW_MS = 15 * 60_000;

export interface EditContent {
  type: "edit";
  target: string;
  text: string;
}

export interface UnsendContent {
  type: "unsend";
  target: string;
}

export type WhisperEditContent = WhisperContent & { edits: string };

export type ParsedRevision =
  | { kind: "edit"; target: string; text: string }
  | { kind: "unsend"; target: string }
  | { kind: "whisper-edit"; target: string; sealed: WhisperEditContent };

export type RevisionEvent = (
  | { kind: "edit"; target: string; text: string }
  | { kind: "unsend"; target: string }
  | { kind: "whisper-edit"; target: string; envelopeId: string; sealed: WhisperEditContent }
) & { sender: string; seq: number; sentAt: number };

export interface Revision {
  sender: string;
  text?: string;
  whisperEdit?: { id: string; sealed: WhisperEditContent };
  edited: boolean;
  unsent: boolean;
}

export function editContent(target: string, text: string): EditContent {
  return { type: "edit", target, text };
}

export function unsendContent(target: string): UnsendContent {
  return { type: "unsend", target };
}

export function whisperEditContent(sealed: WhisperContent, target: string): WhisperEditContent {
  return { ...sealed, edits: target };
}

function record(content: unknown): Record<string, unknown> | null {
  return content && typeof content === "object" ? (content as Record<string, unknown>) : null;
}

export function isRevisionContent(content: unknown): boolean {
  const c = record(content);
  if (!c) return false;
  if ((c.type === "edit" || c.type === "unsend") && typeof c.target === "string") return true;
  return c.type === "whisper" && typeof c.edits === "string";
}

export function parseRevision(contentType: unknown, content: unknown): ParsedRevision | null {
  const c = record(content);
  if (!c) return null;
  if (contentType === EDIT_CONTENT_TYPE) {
    if (c.type !== "edit" || typeof c.target !== "string" || typeof c.text !== "string" || !c.text.trim()) return null;
    return { kind: "edit", target: c.target, text: c.text };
  }
  if (contentType === UNSEND_CONTENT_TYPE) {
    if (c.type !== "unsend" || typeof c.target !== "string") return null;
    return { kind: "unsend", target: c.target };
  }
  if (contentType === WHISPER_CONTENT_TYPE && typeof c.edits === "string" && isWhisperContent(content)) {
    return { kind: "whisper-edit", target: c.edits, sealed: content as WhisperEditContent };
  }
  return null;
}

export function revisionFromStored(m: StoredMessage): RevisionEvent | null {
  const parsed = parseRevision(m.content_type, m.content);
  if (!parsed) return null;
  const meta = { sender: m.sender_slug, seq: m.seq ?? 0, sentAt: m.sent_at };
  if (parsed.kind === "whisper-edit") return { ...parsed, envelopeId: m.envelope_id, ...meta };
  return { ...parsed, ...meta };
}

const order = (e: RevisionEvent) => (e.seq > 0 ? e.seq : Number.MAX_SAFE_INTEGER);

export function foldRevisions(
  events: readonly RevisionEvent[],
  ownerOf: (target: string) => string | undefined = () => undefined,
): Map<string, Revision> {
  const out = new Map<string, Revision>();
  const sorted = [...events].sort((a, b) => order(a) - order(b) || a.sentAt - b.sentAt);
  for (const e of sorted) {
    const owner = ownerOf(e.target);
    if (owner !== undefined && owner !== e.sender) continue;
    const cur = out.get(e.target);
    if (cur && cur.sender !== e.sender) continue;
    const next: Revision = cur ?? { sender: e.sender, edited: false, unsent: false };
    if (next.unsent) continue;
    if (e.kind === "unsend") out.set(e.target, { sender: e.sender, edited: next.edited, unsent: true });
    else if (e.kind === "edit") out.set(e.target, { sender: e.sender, text: e.text, edited: true, unsent: false });
    else out.set(e.target, { sender: e.sender, whisperEdit: { id: e.envelopeId, sealed: e.sealed }, edited: true, unsent: false });
  }
  return out;
}

export function canUnsend(sentAt: number, now: number): boolean {
  return now - sentAt < UNSEND_WINDOW_MS;
}

export function unsendExpiresIn(sentAt: number, now: number): number {
  return sentAt + UNSEND_WINDOW_MS - now;
}

export function canEdit(sentAt: number, now: number): boolean {
  return now - sentAt < EDIT_WINDOW_MS;
}

export function editExpiresIn(sentAt: number, now: number): number {
  return sentAt + EDIT_WINDOW_MS - now;
}

export function revisionError(err: unknown): string | null {
  const raw = (err as { body?: unknown })?.body;
  const text = typeof raw === "string" ? raw : err instanceof Error ? err.message : String(err);
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  let body: { error?: string };
  try {
    body = JSON.parse(json) as typeof body;
  } catch {
    return null;
  }
  if (body.error === "UNSEND_WINDOW_PASSED") return "Messages can only be unsent within 2 minutes of sending.";
  if (body.error === "EDIT_WINDOW_PASSED") return "Messages can only be edited within 15 minutes of sending.";
  if (body.error === "GONE") return "That message was unsent.";
  return null;
}
