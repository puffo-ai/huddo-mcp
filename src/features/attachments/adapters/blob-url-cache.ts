import type { AttachmentBlobScope } from "../domain/attachment";

export const MAX_ENTRIES = 500;
export const MAX_BYTES = 160 * 1024 * 1024;
const REVOKE_GRACE_MS = 30_000;
const cache = new Map<string, string>();
const sizes = new Map<string, number>();
let totalBytes = 0;
const pendingRevocations = new Map<string, ReturnType<typeof setTimeout>>();

function cacheKey(scope: AttachmentBlobScope, blobId: string): string {
  return JSON.stringify([scope.serverUrl, scope.slug, blobId]);
}

export function getCachedAttachmentBlobUrl(
  scope: AttachmentBlobScope,
  blobId: string,
): string | null {
  const key = cacheKey(scope, blobId);
  const url = cache.get(key);
  if (url === undefined) return null;
  cache.delete(key);
  cache.set(key, url);
  return url;
}

export function putCachedAttachmentBlobUrl(
  scope: AttachmentBlobScope,
  blobId: string,
  url: string,
  bytes = 0,
): string {
  const key = cacheKey(scope, blobId);
  const existing = cache.get(key);
  if (existing !== undefined) {
    URL.revokeObjectURL(url);
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  cache.set(key, url);
  sizes.set(key, bytes);
  totalBytes += bytes;
  while (cache.size > MAX_ENTRIES || (totalBytes > MAX_BYTES && cache.size > 1)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const evictedUrl = cache.get(oldestKey)!;
    cache.delete(oldestKey);
    totalBytes -= sizes.get(oldestKey) ?? 0;
    sizes.delete(oldestKey);
    const timer = setTimeout(() => {
      pendingRevocations.delete(evictedUrl);
      URL.revokeObjectURL(evictedUrl);
    }, REVOKE_GRACE_MS);
    pendingRevocations.set(evictedUrl, timer);
  }
  return url;
}

export function clearAttachmentBlobUrls(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  sizes.clear();
  totalBytes = 0;
  for (const [url, timer] of pendingRevocations) {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
  pendingRevocations.clear();
}

export const _clearAttachmentBlobCacheForTests = clearAttachmentBlobUrls;
