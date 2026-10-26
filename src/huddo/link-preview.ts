import { parseAttachmentsContent, type AttachmentReference } from "../features/attachments/domain/attachment";

export type LinkPreview = Readonly<{ url: string; title?: string; description?: string; site?: string; image?: AttachmentReference }>;

const URL_RE = /https?:\/\/[^\s<>"'`）】]+/i;
const BUILD_TIMEOUT_MS = 3000;
const SECRET_PARAM = /(^|[-_])(token|key|apikey|sig|signature|credential|code|secret|password|pwd|auth|otp|session|sid)$/i;
const IMAGE_MAX_EDGE = 640;

const text = (value: unknown, max: number) => {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
};

export function firstLink(message: string): string | null {
  const found = URL_RE.exec(message)?.[0].replace(/[.,;:!?)\]]+$/, "");
  if (!found) return null;
  try {
    return new URL(found).href;
  } catch {
    return null;
  }
}

/** One-time or secret links (password resets, signed shares) are never fetched for a preview. */
export function looksSecret(url: string): boolean {
  const parsed = new URL(url);
  const keys = [...parsed.searchParams.keys(), ...new URLSearchParams(parsed.hash.slice(1)).keys()];
  return keys.some((key) => SECRET_PARAM.test(key));
}

export function sameLink(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a === b;
  }
}

/** The preview the sender embedded in a message; everything in it is the sender's claim except the address. */
export function previewOf(content: unknown): LinkPreview | null {
  if (!content || typeof content !== "object") return null;
  const raw = (content as { preview?: unknown }).preview;
  if (!raw || typeof raw !== "object") return null;
  const fields = raw as Record<string, unknown>;
  const url = typeof fields.url === "string" && /^https?:\/\//i.test(fields.url) ? fields.url : null;
  if (!url) return null;
  const image = parseAttachmentsContent({ text: "", attachments: [fields.image] })?.attachments[0];
  return {
    url,
    title: text(fields.title, 200),
    description: text(fields.description, 400),
    site: text(fields.site, 80),
    ...(image && image.mime_type.startsWith("image/") ? { image } : {}),
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function unfurled(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`/huddo-api/unfurl?url=${encodeURIComponent(url)}`);
  return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
}

async function shrink(blob: Blob): Promise<File> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!out) throw new Error("encode failed");
    return new File([out], "preview.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

async function previewImage(src: string, upload: (file: File) => Promise<AttachmentReference>): Promise<AttachmentReference | undefined> {
  try {
    const response = await fetch(`/huddo-api/unfurl-image?url=${encodeURIComponent(src)}`);
    if (!response.ok) return undefined;
    return await upload(await shrink(await response.blob()));
  } catch {
    return undefined;
  }
}

async function build(url: string, upload: (file: File) => Promise<AttachmentReference>): Promise<LinkPreview | null> {
  const found = await unfurled(url);
  if (!found) return null;
  const title = text(found.title, 200);
  const description = text(found.description, 400);
  const site = text(found.site, 80);
  const src = typeof found.image === "string" ? found.image : null;
  const image = src ? await previewImage(src, upload) : undefined;
  if (!title && !description && !image) return null;
  return { url, ...(title ? { title } : {}), ...(description ? { description } : {}), ...(site ? { site } : {}), ...(image ? { image } : {}) };
}

/**
 * Fetches the first link's page once, as the sender, and returns a preview to send inside the message:
 * readers render it from the message and never contact the linked site.
 */
export function embedPreview(message: string, upload: (file: File) => Promise<AttachmentReference>, timeoutMs = BUILD_TIMEOUT_MS): Promise<LinkPreview | null> {
  const url = firstLink(message);
  if (!url || looksSecret(url)) return Promise.resolve(null);
  return Promise.race([
    build(url, upload).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
