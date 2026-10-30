import { appendFileSync, existsSync, openAsBlob, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import type { PuffoHttpClient } from "../src/http/client";
import type { CryptoOps } from "../src/http/types";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_LARGE_ATTACHMENT_BYTES,
  type AttachmentReference,
} from "../src/features/attachments/domain/attachment";
import { downloadAndDecryptAttachment, encryptAndUploadAttachment } from "../src/message/core/attachments";
import { downloadLargeAttachment } from "../src/message/core/large-attachments";
import { UserError } from "./text-args";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".json": "application/json",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

/** Uploads the file at `path`: in one piece up to 32 MB (then read back to check it), streamed from disk above. */
export async function uploadFileArg(crypto: CryptoOps, http: PuffoHttpClient, path: string): Promise<AttachmentReference> {
  if (!existsSync(path)) throw new UserError(`file not found: ${path}`);
  const size = statSync(path).size;
  if (size > MAX_LARGE_ATTACHMENT_BYTES) throw new UserError(`${basename(path)} is larger than ${MAX_LARGE_ATTACHMENT_BYTES / 1024 / 1024} MB`);
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  if (size > MAX_ATTACHMENT_BYTES) {
    const blob = Object.assign(await openAsBlob(path, { type }), { name: basename(path) }) as unknown as File;
    return encryptAndUploadAttachment(crypto, http, blob);
  }
  const file = new File([Uint8Array.from(readFileSync(path))], basename(path), { type });
  const meta = await encryptAndUploadAttachment(crypto, http, file);
  await downloadAndDecryptAttachment(crypto, http, meta);
  return meta;
}

/**
 * Writes a streamed attachment chunk by chunk to `<path>.part`, then moves it
 * over `path` (an empty placeholder); a failed download leaves neither file.
 */
export async function saveStreamedAttachment(
  crypto: CryptoOps,
  http: PuffoHttpClient,
  meta: AttachmentReference,
  path: string,
): Promise<string> {
  const partial = `${path}.part`;
  try {
    if (!crypto.blobStream) throw new UserError("this build cannot open large attachments");
    const stream = crypto.blobStream;
    await downloadLargeAttachment(stream, http, meta, (bytes) => appendFileSync(partial, bytes));
    renameSync(partial, path);
    return path;
  } catch (error) {
    rmSync(partial, { force: true });
    rmSync(path, { force: true });
    throw error;
  }
}
