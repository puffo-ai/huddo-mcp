import { firstLink, looksSecret } from "../src/huddo/link-preview";
import { unfurl, unfurlImageResponse, unfurlTarget, type HostGuard } from "../src/huddo/unfurl-core";
import { publicHost } from "../src/huddo/unfurl-node";

const BUILD_TIMEOUT_MS = 3000;
const IMAGE_MAX_BYTES = 512 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function build<T>(url: string, upload: (file: File) => Promise<T>, fetchImpl: typeof fetch, guard: HostGuard) {
  const target = unfurlTarget(url);
  if (!target) return null;
  const page = await unfurl(target, fetchImpl, guard);
  if (!page) return null;
  let image: T | undefined;
  if (page.image) {
    const got = await unfurlImageResponse(page.image, fetchImpl, guard);
    const ext = EXT[got.contentType];
    if (got.status === 200 && ext && got.body instanceof Uint8Array && got.body.byteLength <= IMAGE_MAX_BYTES) {
      image = await upload(new File([new Uint8Array(got.body)], `preview.${ext}`, { type: got.contentType })).catch(() => undefined);
    }
  }
  if (!page.title && !page.description && !image) return null;
  return {
    url,
    ...(page.title ? { title: page.title } : {}),
    ...(page.description ? { description: page.description } : {}),
    ...(page.site ? { site: page.site } : {}),
    ...(image ? { image } : {}),
  };
}

/** The CLI's send-time link preview: fetched from this machine (public hosts only), embedded encrypted in the message. */
export function linkPreview<T>(
  text: string,
  upload: (file: File) => Promise<T>,
  { fetchImpl = fetch, guard = publicHost, timeoutMs = BUILD_TIMEOUT_MS }: { fetchImpl?: typeof fetch; guard?: HostGuard; timeoutMs?: number } = {},
) {
  const url = firstLink(text);
  if (!url || looksSecret(url)) return Promise.resolve(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    build(url, upload, fetchImpl, guard).catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}
