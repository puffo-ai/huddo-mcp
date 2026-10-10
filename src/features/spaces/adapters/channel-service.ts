import type { PuffoHttpClient } from "../../../http/client";
import type { Channel, Space } from "../domain";

export async function fetchSpaces(
  http: PuffoHttpClient
): Promise<Space[]> {
  const resp = await http.get<{
    spaces: {
      space_id?: string;
      id?: string;
      name: string;
      description?: string;
      avatar_url?: string;
      joined_at?: number;
      archived_at?: number | null;
    }[];
  }>("/spaces");
  return resp.spaces.map((s) => ({
    id: (s.space_id ?? s.id)!,
    name: s.name,
    description: s.description,
    avatarUrl: s.avatar_url,
    ...(typeof s.joined_at === "number" ? { joinedAt: s.joined_at } : {}),
    ...(typeof s.archived_at === "number" ? { archivedAt: s.archived_at } : {}),
  }));
}

export async function fetchChannels(
  http: PuffoHttpClient,
  spaceId: string,
): Promise<Channel[]> {
  const resp = await http.get<{
    channels: {
      channel_id: string;
      name: string;
      description?: string | null;
      is_public: boolean;
      is_encrypted?: boolean | null;
      created_at: number;
      owner_slug: string;
    }[];
  }>(`/spaces/${encodeURIComponent(spaceId)}/channels`);
  return resp.channels.map((c) => ({
    id: c.channel_id,
    name: c.name,
    spaceId,
    kind: "channel" as const,
    isPublic: c.is_public,
    isEncrypted: c.is_encrypted,
    description: c.description ?? undefined,
    createdBy: c.owner_slug,
  }));
}

export async function fetchChannelMembers(
  http: PuffoHttpClient,
  spaceId: string,
  channelId: string
): Promise<{ slug: string; display_name?: string; identity_type?: string }[]> {
  const resp = await http.get<{
    members: { slug: string; display_name?: string; identity_type?: string }[];
  }>(`/spaces/${spaceId}/channels/${channelId}/members`);
  return resp.members;
}

export async function fetchSpaceMembers(
  http: PuffoHttpClient,
  spaceId: string,
): Promise<{ slug: string; role: string; identity_type?: string }[]> {
  const resp = await http.get<{
    members: { slug: string; role: string; identity_type?: string }[];
  }>(`/spaces/${spaceId}/members`);
  return resp.members;
}
