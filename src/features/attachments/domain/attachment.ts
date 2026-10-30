export interface AttachmentReference {
  blob_id: string;
  filename: string;
  mime_type: string;
  size: number;
  key: string;
  nonce: string;
  type?: "file_reference";
  version?: 1 | 2;
  content_type?: string;
  size_bytes?: number;
  content_key?: string;
  aead_nonce?: string;
  sha256?: string;
  chunk_size?: number;
  width?: number;
  height?: number;
  thumbnail?: AttachmentReference;
}

export interface AttachmentsContent {
  text: string;
  attachments: AttachmentReference[];
}

export const ATTACHMENT_CONTENT_TYPE = "puffo/message+attachments/v1";
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/** Files up to this size are sealed and uploaded in one piece (version 1). */
export const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024;
/** Larger files are streamed (version 2) up to this size. */
export const MAX_LARGE_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
export const STREAM_CHUNK_BYTES = 1024 * 1024;
const MAX_STREAM_CHUNK_BYTES = 64 * 1024 * 1024;

export function isStreamedAttachment(meta: AttachmentReference): boolean {
  return meta.version === 2;
}

export function isAttachmentsContentType(contentType: string): boolean {
  return contentType === ATTACHMENT_CONTENT_TYPE;
}

const isSide = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 65_535;

export function parseAttachmentsContent(content: unknown): AttachmentsContent | null {
  if (!content || typeof content !== "object") return null;
  const candidate = content as Record<string, unknown>;
  if (typeof candidate.text !== "string" || !Array.isArray(candidate.attachments)) return null;
  const attachments: AttachmentReference[] = [];
  for (const value of candidate.attachments) {
    const attachment = parseReference(value);
    if (!attachment) return null;
    const thumbnail = parseReference((value as Record<string, unknown>).thumbnail);
    if (thumbnail?.mime_type.startsWith("image/")) attachment.thumbnail = thumbnail;
    attachments.push(attachment);
  }
  return { text: candidate.text, attachments };
}

function parseReference(value: unknown): AttachmentReference | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.blob_id !== "string"
    || typeof item.filename !== "string"
    || typeof item.mime_type !== "string"
    || typeof item.size !== "number"
    || typeof item.key !== "string"
    || typeof item.nonce !== "string"
  ) return null;
  const attachment: AttachmentReference = {
    blob_id: item.blob_id,
    filename: item.filename,
    mime_type: item.mime_type,
    size: item.size,
    key: item.key,
    nonce: item.nonce,
  };
  if (item.type === "file_reference") attachment.type = "file_reference";
  if (item.version === 1) attachment.version = 1;
  if (item.version === 2) {
    if (!Number.isInteger(item.chunk_size) || (item.chunk_size as number) < 1 || (item.chunk_size as number) > MAX_STREAM_CHUNK_BYTES) return null;
    const size = item.size_bytes ?? item.size;
    if (!Number.isInteger(size) || (size as number) < 0 || (size as number) > MAX_LARGE_ATTACHMENT_BYTES) return null;
    attachment.version = 2;
    attachment.chunk_size = item.chunk_size as number;
  }
  if (typeof item.content_type === "string") attachment.content_type = item.content_type;
  if (typeof item.size_bytes === "number") attachment.size_bytes = item.size_bytes;
  if (typeof item.content_key === "string") attachment.content_key = item.content_key;
  if (typeof item.aead_nonce === "string") attachment.aead_nonce = item.aead_nonce;
  if (typeof item.sha256 === "string") attachment.sha256 = item.sha256;
  if (isSide(item.width) && isSide(item.height)) {
    attachment.width = item.width;
    attachment.height = item.height;
  }
  return attachment;
}

export type AttachmentLoadOptions = {
  namespace?: string;
  forceRefresh?: boolean;
};

export type DocumentKind = "markdown" | "text" | "html" | "pdf" | "docx";

export function attachmentFailureKey(namespace: string, blobId: string): string {
  return namespace ? `${namespace}|${blobId}` : blobId;
}
export interface AttachmentBlobScope {
  serverUrl: string;
  slug: string;
}
