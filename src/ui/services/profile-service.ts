import type { PuffoHttpClient } from "../../http/client";
import type { CryptoOps } from "../../http/types";

export {
  MAX_PROFILE_AVATAR_BYTES as MAX_AVATAR_BYTES,
  MAX_PROFILE_AVATAR_LABEL as MAX_AVATAR_LABEL,
} from "../../features/profiles/domain/human-profile";

// Mirrors server/src/v2/identities/profile.rs::UpdateProfileRequest.
export interface UpdateProfilePatch {
  display_name?: string;
  avatar_url?: string;
  // Empty string clears it.
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

/// Phase the avatar uploader moves through. Same vocabulary the
/// chat-attachment uploader uses (MessageInput.PendingAttachment)
/// so caller surfaces can surface the same "Uploading… → Verifying…
/// → Ready" copy if they want to. ``ready`` fires once and signals
/// the URL is safe to commit to the profile / space record.
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

/// Upload an avatar / logo image to /blobs/upload, verify the
/// round-trip by downloading the blob back and confirming the
/// SHA-256 hash matches what we sent, then return the URL suitable
/// for storing as the user's ``avatar_url`` (or any equivalent
/// metadata field). The blob download endpoint is auth-protected
/// — rendering a stored avatar requires a signed fetch helper,
/// not a bare ``<img src=...>``.
///
/// PUF-226-B upgraded the verify from byte-length-only to
/// SHA-256 hash-compare. Length parity catches the obvious failure
/// modes (truncated upload, 502 returning HTML, CloudFront SPA
/// fallback returning index.html) but misses content-corruption
/// classes where the byte count happens to match — bit-flips,
/// wrong-blob substitution by a buggy proxy, etc. SHA-256 closes
/// that gap so the caller only commits the URL to the profile
/// record after end-to-end integrity is proven.
///
/// ``onPhase`` lets caller UIs (e.g. SettingsPane, EditSpaceModal)
/// reflect the step in their save button. Pass undefined to upload
/// silently — the function still does upload + verify before
/// resolving.
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
    // Length is the cheap fast-fail before the hash compare.
    // Catches truncated uploads / SPA-fallback HTML.
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

/// The ``role`` field is stored as a single string on the wire but
/// is authored as two parts: a one-word ``role_short`` label and a
/// free-text description, joined as ``<short>: <description>``. The
/// server derives the ``role_short`` chip from the prefix before
/// the first colon. These two helpers are the single source of
/// truth for that split/join so the Create-agent modal and the
/// edit-agent card stay in lockstep.
export interface RoleParts {
  /// One word — no whitespace. The chip label.
  short: string;
  /// Free-text "what does this account do" remainder.
  description: string;
}

/// Parse a stored ``role`` string into its short + description
/// parts. A role with no colon is treated as short-only.
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

/// Merge a short label + description back into the stored wire
/// shape. Whitespace inside ``short`` is stripped (it's a one-word
/// label). Returns "" when there's no short label — an empty role
/// clears the column server-side.
export function joinRole(short: string, description: string): string {
  const s = short.trim().replace(/\s+/g, "");
  const d = description.trim();
  if (!s) return "";
  return d ? `${s}: ${d}` : s;
}

// Mirrors server/src/profiles.rs::ProfileEntry. ``username`` is the
// strict identifier (immutable), ``display_name`` is editable.
// ``role`` is a free-text "what does this account do" string (≤140
// chars); ``role_short`` is the server-derived chip label rendered
// next to display_name in member lists (≤32 chars). Both default to
// empty string on the server, never null.
export interface ProfileEntry {
  slug: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  role_short: string;
  profile_updated_at: number | null;
  /// Agents only — the operator slug from the active
  /// operator_attestation chain. Omitted (undefined) for humans
  /// and for agents whose chain has been revoked. Single source of
  /// truth for "is this my agent" — see ``ui/services/
  /// agent-ownership.ts``.
  owner_slug?: string;
}

interface GetProfilesResponse {
  profiles: ProfileEntry[];
}

// Paths past ~2 KiB are rewritten at the edge and fail signature check (401).
const MAX_PROFILE_QUERY_CHARS = 1500;

export function chunkProfileSlugs(slugs: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let width = 0;
  for (const slug of slugs) {
    const encoded = encodeURIComponent(slug).length;
    // +3 for the ``%2C`` separator.
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
