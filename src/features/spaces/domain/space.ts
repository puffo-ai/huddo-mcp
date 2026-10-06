export type SpaceRole = "owner" | "member" | null;

export interface Channel {
  id: string;
  name: string;
  spaceId: string;
  kind: "channel";
  isPublic?: boolean;
  isEncrypted?: boolean | null;
  description?: string;
  createdBy?: string;
}

export interface Space {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  joinedAt?: number;
  archivedAt?: number | null;
}

export interface CreatedSpace {
  spaceId: string;
  name: string;
  joinedAt: number;
  defaultChannel?: { channelId: string; name: string; isPublic: boolean };
}

export interface CreatedChannel {
  channelId: string;
  spaceId: string;
  name: string;
  isEncrypted: boolean;
}

export function getSpaceRole(
  spaceOwners: Record<string, string[]>,
  spaceId: string | null,
  slug: string | null,
): SpaceRole {
  if (!spaceId || !slug) return null;
  if ((spaceOwners[spaceId] ?? []).includes(slug)) return "owner";
  return "member";
}

export function sortSpacesByName<T extends { name: string }>(spaces: T[]): T[] {
  return [...spaces].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
  );
}
