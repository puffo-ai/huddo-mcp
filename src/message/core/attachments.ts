import type { CryptoOps } from "../../http/types";
import { HttpError } from "../../http/types";
import type { PuffoHttpClient } from "../../http/client";
import type { AttachmentReference } from "../../features/attachments/domain/attachment";
export {
  ATTACHMENT_CONTENT_TYPE,
  isAttachmentsContentType,
  parseAttachmentsContent,
} from "../../features/attachments/domain/attachment";
export type { AttachmentsContent } from "../../features/attachments/domain/attachment";

const AAD_LABEL = new TextEncoder().encode("puffo/attachment/v1");
const CORE_BLOB_AAD = new TextEncoder().encode("puffo/blob/v1");
const USE_CORE_BLOB_AAD_FOR_NEW_UPLOADS = false;

export type AttachmentMeta = AttachmentReference;
export type PreparedAttachmentUpload = {
  ciphertext: Uint8Array;
  metadata: Omit<AttachmentMeta, "blob_id">;
};

const TEXT = new TextEncoder();

function buildAad(filename: string, mimeType: string): Uint8Array {
  const fname = TEXT.encode(filename);
  const mime = TEXT.encode(mimeType);
  const out = new Uint8Array(AAD_LABEL.length + 1 + mime.length + 1 + fname.length);
  let off = 0;
  out.set(AAD_LABEL, off); off += AAD_LABEL.length;
  out[off++] = 0;
  out.set(mime, off); off += mime.length;
  out[off++] = 0;
  out.set(fname, off);
  return out;
}

export async function prepareAttachmentUpload(
  crypto: CryptoOps,
  file: File,
  suppliedPlaintext?: Uint8Array,
): Promise<PreparedAttachmentUpload> {
  const plaintext = suppliedPlaintext ?? new Uint8Array(await file.arrayBuffer());
  const key = crypto.generateRandomBytes(32);
  const nonce = crypto.generateRandomBytes(12);
  const mimeType = file.type || "application/octet-stream";
  const filename = file.name || "attachment";
  const aad = USE_CORE_BLOB_AAD_FOR_NEW_UPLOADS
    ? CORE_BLOB_AAD
    : buildAad(filename, mimeType);
  const ciphertext = crypto.aeadSeal(key, nonce, plaintext, aad);
  const contentKey = crypto.base64urlEncode(key);
  const aeadNonce = crypto.base64urlEncode(nonce);
  const sha256 = crypto.base64urlEncode(crypto.sha256(plaintext));
  return {
    ciphertext,
    metadata: {
      filename,
      mime_type: mimeType,
      size: file.size,
      key: contentKey,
      nonce: aeadNonce,
      type: "file_reference",
      version: 1,
      content_type: mimeType,
      size_bytes: file.size,
      content_key: contentKey,
      aead_nonce: aeadNonce,
      sha256,
    },
  };
}

export async function encryptAndUploadAttachment(
  crypto: CryptoOps,
  http: PuffoHttpClient,
  file: File,
  transactionId?: string,
  loadPrepared?: (
    transactionId: string,
    create: () => Promise<PreparedAttachmentUpload>,
  ) => Promise<PreparedAttachmentUpload>,
  suppliedPlaintext?: Uint8Array,
): Promise<AttachmentMeta> {
  const create = () => prepareAttachmentUpload(crypto, file, suppliedPlaintext);
  const prepared = transactionId && loadPrepared
    ? await loadPrepared(transactionId, create)
    : await create();
  const resp = await http.postBytes<{ blob_id: string; size_bytes: number }>(
    transactionId
      ? `/blobs/upload?transaction_id=${encodeURIComponent(transactionId)}`
      : "/blobs/upload",
    prepared.ciphertext,
  );
  return {
    blob_id: resp.blob_id,
    ...prepared.metadata,
  };
}

export async function downloadAndDecryptAttachment(
  crypto: CryptoOps,
  http: PuffoHttpClient,
  meta: AttachmentMeta,
): Promise<Uint8Array> {
  const path = `/blobs/${encodeURIComponent(meta.blob_id)}`;
  const delays = [0, 5_000, 5_000, 5_000];
  let lastErr: unknown;
  let ciphertext: Uint8Array | null = null;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      ciphertext = await http.getBytes(path);
      break;
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status === 404) continue;
      throw err;
    }
  }
  if (ciphertext === null) {
    throw lastErr ?? new Error(`blob ${meta.blob_id} not found`);
  }
  const canonicalKey = meta.content_key ?? meta.key;
  const canonicalNonce = meta.aead_nonce ?? meta.nonce;
  const key = crypto.base64urlDecode(canonicalKey);
  const nonce = crypto.base64urlDecode(canonicalNonce);
  const legacyAad = buildAad(meta.filename, meta.mime_type);
  const aadCandidates = meta.type === "file_reference" && meta.content_key && meta.aead_nonce
    ? [CORE_BLOB_AAD, legacyAad]
    : [legacyAad];
  let plaintext: Uint8Array | null = null;
  let lastOpenErr: unknown;
  for (const aad of aadCandidates) {
    try {
      plaintext = crypto.aeadOpen(key, nonce, ciphertext, aad);
      break;
    } catch (err) {
      lastOpenErr = err;
    }
  }
  if (!plaintext) throw lastOpenErr ?? new Error(`attachment ${meta.blob_id} failed decryption`);
  if (meta.sha256) {
    const actual = crypto.base64urlEncode(crypto.sha256(plaintext));
    if (actual !== meta.sha256) throw new Error(`attachment ${meta.blob_id} failed sha256 verification`);
  }
  return plaintext;
}
