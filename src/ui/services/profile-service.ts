import type { PuffoHttpClient } from "../../http/client";
import type { CryptoOps } from "../../http/types";

export {
  MAX_PROFILE_AVATAR_BYTES as MAX_AVATAR_BYTES,
  MAX_PROFILE_AVATAR_LABEL as MAX_AVATAR_LABEL,
} from "../../features/profiles/domain/human-profile";

export interface UpdateProfilePatch {
  display_name?: string;
  avatar_url?: string;
  my_space_id?: string;
}

export interface UpdateSelfProfilePatch {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}

interface UpdateProfileResponse {
  ok: boolean;
  profile_updated_at: number;
}

interface BlobUploadResponse {
  blob_id: string;
  size_bytes: number;
  uploaded_at: number;
}

export type AvatarUploadPhase = "uploading" | "verifying" | "ready";
export type AvatarUploadPhaseHook = (phase: AvatarUploadPhase) => void;

export async function updateProfile(
  http: PuffoHttpClient,
  slug: string,
  patch: UpdateProfilePatch,
): Promise<UpdateProfileResponse> {
  return http.put<UpdateProfileResponse>(
    `/v2/identities/${encodeURIComponent(slug)}`,
    patch as unknown as Record<string, unknown>,
  );
}

export async function updateSelfProfile(
  http: PuffoHttpClient,
  patch: UpdateSelfProfilePatch,
): Promise<UpdateProfileResponse> {
  return http.patch<UpdateProfileResponse>(
    "/identities/self",
    patch as unknown as Record<string, unknown>,
  );
}

export async function uploadAvatar(
  http: PuffoHttpClient,
  serverUrl: string,
  bytes: Uint8Array,
  crypto: CryptoOps,
  onPhase?: AvatarUploadPhaseHook,
): Promise<string> {
  onPhase?.("uploading");
  const resp = await http.postBytes<BlobUploadResponse>("/blobs/upload", bytes);

  onPhase?.("verifying");
  const path = `/blobs/${encodeURIComponent(resp.blob_id)}`;
  const fetched = await http.getBytes(path);
  if (fetched.length !== bytes.length) {
    throw new Error(
      `Avatar verify failed: uploaded ${bytes.length} bytes but read back ${fetched.length}.`,
    );
  }
  const expected = bytesToHex(crypto.sha256(bytes));
  const got = bytesToHex(crypto.sha256(fetched));
  if (expected !== got) {
    throw new Error(
      `Avatar verify failed: SHA-256 mismatch (expected ${expected.slice(0, 16)}…, got ${got.slice(0, 16)}…).`,
    );
  }

  onPhase?.("ready");
  const cleanBase = serverUrl.replace(/\/+$/, "");
  return `${cleanBase}/blobs/${encodeURIComponent(resp.blob_id)}`;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export interface RoleParts {
  short: string;
  description: string;
}

export function splitRole(role: string): RoleParts {
  const idx = role.indexOf(":");
  if (idx < 0) {
    return { short: role.trim().replace(/\s+/g, ""), description: "" };
  }
  return {
    short: role.slice(0, idx).trim().replace(/\s+/g, ""),
    description: role.slice(idx + 1).trim(),
  };
}

export function joinRole(short: string, description: string): string {
  const s = short.trim().replace(/\s+/g, "");
  const d = description.trim();
  if (!s) return "";
  return d ? `${s}: ${d}` : s;
}

export interface ProfileEntry {
  slug: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  role_short: string;
  profile_updated_at: number | null;
  owner_slug?: string;
}

interface GetProfilesResponse {
  profiles: ProfileEntry[];
}

const MAX_PROFILE_QUERY_CHARS = 1500;

export function chunkProfileSlugs(slugs: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let width = 0;
  for (const slug of slugs) {
    const encoded = encodeURIComponent(slug).length;
    const cost = batch.length ? encoded + 3 : encoded;
    if (batch.length && width + cost > MAX_PROFILE_QUERY_CHARS) {
      batches.push(batch);
      batch = [slug];
      width = encoded;
      continue;
    }
    batch.push(slug);
    width += cost;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function fetchProfiles(
  http: PuffoHttpClient,
  slugs: string[],
): Promise<ProfileEntry[]> {
  const unique = Array.from(new Set(slugs.filter(Boolean)));
  if (unique.length === 0) return [];
  const pages = await Promise.all(
    chunkProfileSlugs(unique).map((batch) =>
      http.get<GetProfilesResponse>(
        `/identities/profiles?slugs=${encodeURIComponent(batch.join(","))}`,
      ),
    ),
  );
  return pages.flatMap((resp) => resp.profiles ?? []);
}
