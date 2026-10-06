export interface AttachmentReference {
  blob_id: string;
  filename: string;
  mime_type: string;
  size: number;
  key: string;
  nonce: string;
  type?: "file_reference";
  version?: 1;
  content_type?: string;
  size_bytes?: number;
  content_key?: string;
  aead_nonce?: string;
  sha256?: string;
}

export interface AttachmentsContent {
  text: string;
  attachments: AttachmentReference[];
}

export const ATTACHMENT_CONTENT_TYPE = "puffo/message+attachments/v1";

export function isAttachmentsContentType(contentType: string): boolean {
  return contentType === ATTACHMENT_CONTENT_TYPE;
}

export function parseAttachmentsContent(content: unknown): AttachmentsContent | null {
  if (!content || typeof content !== "object") return null;
  const candidate = content as Record<string, unknown>;
  if (typeof candidate.text !== "string" || !Array.isArray(candidate.attachments)) return null;
  const attachments: AttachmentReference[] = [];
  for (const value of candidate.attachments) {
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
    if (typeof item.content_type === "string") attachment.content_type = item.content_type;
    if (typeof item.size_bytes === "number") attachment.size_bytes = item.size_bytes;
    if (typeof item.content_key === "string") attachment.content_key = item.content_key;
    if (typeof item.aead_nonce === "string") attachment.aead_nonce = item.aead_nonce;
    if (typeof item.sha256 === "string") attachment.sha256 = item.sha256;
    attachments.push(attachment);
  }
  return { text: candidate.text, attachments };
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
