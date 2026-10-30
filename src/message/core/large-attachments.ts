import type { PuffoHttpClient } from "../../http/client";
import type { BlobStreamCrypto } from "../../http/types";
import type { AttachmentReference } from "../../features/attachments/domain/attachment";
import { STREAM_CHUNK_BYTES, isStreamedAttachment } from "../../features/attachments/domain/attachment";

export type { BlobStreamCrypto };

export const STREAM_TAG_BYTES = 16;
export const CHUNKS_PER_PART = 8;
const SEALED_CHUNK_BYTES = STREAM_CHUNK_BYTES + STREAM_TAG_BYTES;
export const PART_BYTES = CHUNKS_PER_PART * SEALED_CHUNK_BYTES;
const PART_RETRY_DELAYS_MS = [0, 1_000, 3_000, 10_000];

export type LargeAttachmentProgress = { done: number; total: number };

type Upload = { upload_id: string; blob_id: string; part_count: number; uploaded_parts: number[] };

export function streamChunkCount(sizeBytes: number, chunkSize = STREAM_CHUNK_BYTES): number {
  return Math.max(1, Math.ceil(sizeBytes / chunkSize));
}

export function streamCiphertextBytes(sizeBytes: number, chunkSize = STREAM_CHUNK_BYTES): number {
  return sizeBytes + streamChunkCount(sizeBytes, chunkSize) * STREAM_TAG_BYTES;
}

function absolute(http: PuffoHttpClient, url: string): string {
  return /^https?:\/\//.test(url) ? url : `${http.baseUrl}${url}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** PUTs one part, asking for a fresh URL once if the presigned one has expired (403). */
async function putPart(nextUrl: () => Promise<string>, body: Uint8Array): Promise<void> {
  let url = await nextUrl();
  let refreshed = false;
  let lastError: unknown;
  for (const delay of PART_RETRY_DELAYS_MS) {
    if (delay) await wait(delay);
    try {
      const resp = await fetch(url, { method: "PUT", body: body as BodyInit });
      if (resp.ok) return;
      lastError = new Error(`part upload failed: ${resp.status}`);
      if (resp.status === 403 && !refreshed) {
        refreshed = true;
        url = await nextUrl();
        continue;
      }
      if (resp.status < 500 && resp.status !== 408 && resp.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Seals `file` in 1 MiB chunks and uploads it in parts straight to storage. */
export async function uploadLargeAttachment(
  stream: BlobStreamCrypto,
  http: PuffoHttpClient,
  file: Blob & { name?: string },
  onProgress?: (progress: LargeAttachmentProgress) => void,
): Promise<AttachmentReference> {
  const mimeType = file.type || "application/octet-stream";
  const filename = file.name || "attachment";
  const chunks = streamChunkCount(file.size);
  const upload = await http.post<Upload>("/blobs/uploads", {
    size_bytes: streamCiphertextBytes(file.size),
    part_size: PART_BYTES,
  });
  const reference = stream.reference(upload.blob_id, file.size, STREAM_CHUNK_BYTES, mimeType, filename);
  try {
    const done = new Set(upload.uploaded_parts);
    const todo = Array.from({ length: upload.part_count }, (_, i) => i + 1).filter((n) => !done.has(n));
    onProgress?.({ done: done.size, total: upload.part_count });
    const partUrl = (part: number) => async () => {
      const { urls } = await http.post<{ urls: { url: string }[] }>(
        `/blobs/uploads/${encodeURIComponent(upload.upload_id)}/parts`,
        { part_numbers: [part] },
      );
      return absolute(http, urls[0]!.url);
    };
    for (const part of todo) {
      const first = (part - 1) * CHUNKS_PER_PART;
      const last = Math.min(first + CHUNKS_PER_PART, chunks);
      const sealed: Uint8Array[] = [];
      for (let index = first; index < last; index++) {
        const slice = file.slice(index * STREAM_CHUNK_BYTES, Math.min((index + 1) * STREAM_CHUNK_BYTES, file.size));
        sealed.push(stream.seal(reference, index, new Uint8Array(await slice.arrayBuffer())));
      }
      await putPart(partUrl(part), concat(sealed));
      done.add(part);
      onProgress?.({ done: done.size, total: upload.part_count });
    }
    await http.post(`/blobs/uploads/${encodeURIComponent(upload.upload_id)}/complete`);
  } catch (error) {
    void http.delete(`/blobs/uploads/${encodeURIComponent(upload.upload_id)}`).catch(() => undefined);
    throw error;
  }
  const ref = JSON.parse(reference) as { content_key: string; aead_nonce: string };
  return {
    blob_id: upload.blob_id,
    filename,
    mime_type: mimeType,
    size: file.size,
    key: ref.content_key,
    nonce: ref.aead_nonce,
    type: "file_reference",
    version: 2,
    content_type: mimeType,
    size_bytes: file.size,
    content_key: ref.content_key,
    aead_nonce: ref.aead_nonce,
    sha256: "",
    chunk_size: STREAM_CHUNK_BYTES,
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function streamReferenceJson(meta: AttachmentReference): string {
  return JSON.stringify({
    type: "file_reference",
    version: 2,
    blob_id: meta.blob_id,
    content_type: meta.content_type ?? meta.mime_type,
    size_bytes: meta.size_bytes ?? meta.size,
    content_key: meta.content_key ?? meta.key,
    aead_nonce: meta.aead_nonce ?? meta.nonce,
    sha256: "",
    filename: meta.filename,
    chunk_size: meta.chunk_size ?? STREAM_CHUNK_BYTES,
  });
}

/**
 * Downloads a version 2 attachment through a presigned URL and hands each
 * opened chunk to `onPlaintext`, so a caller never holds the ciphertext.
 */
export async function downloadLargeAttachment(
  stream: BlobStreamCrypto,
  http: PuffoHttpClient,
  meta: AttachmentReference,
  onPlaintext: (bytes: Uint8Array) => void | Promise<void>,
  onProgress?: (progress: LargeAttachmentProgress) => void,
): Promise<void> {
  if (!isStreamedAttachment(meta)) throw new Error(`attachment ${meta.blob_id} is not streamed`);
  const reference = streamReferenceJson(meta);
  const chunkSize = meta.chunk_size ?? STREAM_CHUNK_BYTES;
  const sealedChunk = chunkSize + STREAM_TAG_BYTES;
  const size = meta.size_bytes ?? meta.size;
  const chunks = streamChunkCount(size, chunkSize);
  const total = streamCiphertextBytes(size, chunkSize);
  const { url } = await http.get<{ url: string }>(`/blobs/${encodeURIComponent(meta.blob_id)}/url`);
  const resp = await fetch(absolute(http, url));
  if (!resp.ok || !resp.body) throw new Error(`attachment ${meta.blob_id} download failed: ${resp.status}`);
  const reader = resp.body.getReader();
  let pending: Uint8Array = new Uint8Array(0);
  let index = 0;
  let received = 0;
  const openNext = async (sealed: Uint8Array) => {
    await onPlaintext(stream.open(reference, index, sealed));
    index += 1;
    onProgress?.({ done: index, total: chunks });
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > total) throw new Error(`attachment ${meta.blob_id} is longer than expected`);
    pending = pending.length ? concat([pending, value]) : value;
    let offset = 0;
    while (pending.length - offset >= sealedChunk && index < chunks - 1) {
      await openNext(pending.subarray(offset, offset + sealedChunk));
      offset += sealedChunk;
    }
    if (offset) pending = pending.slice(offset);
  }
  if (received !== total || index !== chunks - 1) throw new Error(`attachment ${meta.blob_id} is incomplete`);
  await openNext(pending);
}
