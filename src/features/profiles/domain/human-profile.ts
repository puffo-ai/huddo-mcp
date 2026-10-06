// This cap is enforced by every web form that accepts an avatar and mirrored
// by puffo-agent in portal/api/handlers.py. Keep both repositories in sync
// when changing it.
export const MAX_PROFILE_AVATAR_BYTES = 4 * 1024 * 1024;
export const MAX_PROFILE_AVATAR_LABEL = "4 MiB";

export interface HumanProfileSnapshot {
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface HumanProfileEditDraft {
  displayName: string;
  bio: string;
  avatarFile: File | null;
}

export interface HumanProfilePatch {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}

export function validateProfileAvatar(file: File | null): string | null {
  if (!file) return null;
  if (!file.type.startsWith("image/")) return "Avatar must be an image";
  if (file.size > MAX_PROFILE_AVATAR_BYTES) {
    return `Avatar must be under ${MAX_PROFILE_AVATAR_LABEL}`;
  }
  return null;
}

export function buildHumanProfilePatch(
  current: HumanProfileSnapshot,
  draft: Pick<HumanProfileEditDraft, "displayName" | "bio">,
  avatarUrl?: string,
): HumanProfilePatch {
  const displayName = draft.displayName.trim();
  const bio = draft.bio.trim();
  const patch: HumanProfilePatch = {};
  if (displayName && displayName !== (current.displayName ?? "")) {
    patch.display_name = displayName;
  }
  if (bio !== (current.bio ?? "")) patch.bio = bio;
  if (avatarUrl) patch.avatar_url = avatarUrl;
  return patch;
}
