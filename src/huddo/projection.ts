import { parseAttachmentsContent, type AttachmentReference } from "../features/attachments/domain/attachment";
import { isAppNoteContent } from "./app-note";
import { quoteMark, quoteOfContent, type MessageQuote } from "./message-quotes";
import { isAppTarget } from "./app-links";
import { choiceOf, closeTargetOf, isCloseContent, optionsOf, type Choice, type ChoiceOption } from "./choices";
import { formOf, formResponseOf, type FormField, type FormResponse } from "./forms";
import { previewOf, type LinkPreview } from "./link-preview";
import { isRevisionContent, parseRevision, type ParsedRevision } from "./revisions";
import { isWhisperContent, type WhisperContent } from "./whisper";
import { formatBytes } from "./format-bytes";

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text ?? "");
  }
  return "";
}

export interface MessageView {
  text: string;
  attachments: AttachmentReference[];
  options?: ChoiceOption[];
  choice?: Choice;
  form?: FormField[];
  formResponse?: FormResponse;
  preview?: LinkPreview;
  quote?: MessageQuote;
}

/** What one message's content means. Every client reads content through this, and only draws it differently. */
export type Projection =
  | { kind: "revision"; revision: ParsedRevision }
  | { kind: "close"; target: string }
  | { kind: "whisper"; to: string; sealed: WhisperContent }
  | { kind: "note"; text: string; via: { appId: string; name: string; link?: string } }
  | ({ kind: "message" } & MessageView);

export function projectContent(contentType: unknown, content: unknown): Projection | null {
  const revision = parseRevision(contentType, content);
  if (revision) return { kind: "revision", revision };
  const target = closeTargetOf(contentType, content);
  if (target) return { kind: "close", target };
  if (isRevisionContent(content) || isCloseContent(content)) return null;
  if (isWhisperContent(content)) return { kind: "whisper", to: content.to, sealed: content };
  if (isAppNoteContent(content)) {
    if (!content.text.trim()) return null;
    const via = { appId: content.app.id, name: content.app.name, ...(isAppTarget(content.link) ? { link: content.link } : {}) };
    return { kind: "note", text: content.text, via };
  }
  const parsed = parseAttachmentsContent(content);
  const text = parsed ? parsed.text : contentText(content);
  const attachments = parsed?.attachments ?? [];
  if (!text.trim() && attachments.length === 0) return null;
  const options = parsed ? optionsOf(content) : null;
  const choice = parsed ? choiceOf(content) : null;
  const form = parsed ? formOf(content) : null;
  const formResponse = parsed ? formResponseOf(content) : null;
  const preview = previewOf(content);
  const quote = parsed ? quoteOfContent(content) : null;
  return {
    kind: "message",
    text,
    attachments,
    ...(options ? { options } : {}),
    ...(choice ? { choice } : {}),
    ...(form ? { form } : {}),
    ...(formResponse ? { formResponse } : {}),
    ...(preview ? { preview } : {}),
    ...(quote ? { quote } : {}),
  };
}

export interface MarkedRow {
  via?: { appId: string; name: string };
  attachments?: readonly AttachmentReference[];
  closes?: string;
  options?: readonly ChoiceOption[];
  choice?: Choice;
  form?: readonly FormField[];
  formResponse?: FormResponse;
  quote?: MessageQuote;
}

const TAG_MARKER = /\[(\s*(?:paired\s*with\s*you|your\s*operator|peer)\s*)\]|\[(\s*(?:paired\s*with|operator_of)\s*:)/gi;
const LINE_BREAKS = /\s*[\r\n\v\f\u0085\u2028\u2029]+\s*/g;

/** Message text can't claim a tag that only Huddo sets. */
export function neutralizeTags(text: string): string {
  const neutral = (value: string) =>
    value.replace(TAG_MARKER, (_match, tag: string | undefined, prefix: string | undefined) =>
      tag !== undefined ? `(${tag})` : `(${prefix}`,
    );
  const once = neutral(text);
  const plain = once.normalize("NFKC").replace(/\p{Cf}/gu, "");
  return plain.search(TAG_MARKER) === -1 ? once : neutral(plain);
}

/** One line of output, so a sender's text can't look like a separate message. */
export function oneLine(text: string): string {
  return text.replace(LINE_BREAKS, " ");
}

/** One line of output with no tag it didn't earn, for text that holds names other people chose. */
export function safeLine(text: string): string {
  return neutralizeTags(oneLine(text));
}

/** The text form of a row's non-text parts, for the clients that draw rows as text. */
export function rowMarks(row: MarkedRow): string[] {
  const clean = safeLine;
  const marks: string[] = [];
  if (row.via) marks.push(`[via app ${clean(row.via.appId)} (${clean(row.via.name)})]`);
  if (row.attachments?.length) {
    marks.push(`[attachments: ${row.attachments.map((a) => `${clean(a.filename)} (${clean(a.mime_type)}, ${formatBytes(a.size)})`).join(", ")}]`);
  }
  if (row.closes) marks.push(`[closed choices on ${clean(row.closes)}]`);
  if (row.options) marks.push(`[options: ${row.options.map((o) => `${clean(o.key)}) ${clean(o.label)}`).join("  ")}]`);
  if (row.choice) {
    marks.push(row.choice.key ? `[chose ${clean(row.choice.key)} of ${clean(row.choice.questionId)}]` : `[own answer to ${clean(row.choice.questionId)}]`);
  }
  if (row.form) {
    const field = (f: FormField) => {
      const kind = f.type === "choice" ? `choice: ${f.options!.map(clean).join("|")}` : f.type;
      return `${clean(f.key)}) ${clean(f.label)} (${kind}${f.required ? ", required" : ""})`;
    };
    marks.push(`[form: ${row.form.map(field).join("  ")}]`);
  }
  if (row.formResponse) {
    const id = clean(row.formResponse.questionId);
    if (row.formResponse.skipped) marks.push(`[skipped form ${id}]`);
    else {
      const pairs = Object.entries(row.formResponse.values ?? {}).map(([k, v]) => `${clean(k)}=${clean(v.replace(/\r?\n/g, "\\n"))}`);
      marks.push(`[form answer to ${id}: ${pairs.join("; ")}]`);
    }
  }
  if (row.quote) marks.push(safeLine(quoteMark(row.quote)));
  return marks;
}
