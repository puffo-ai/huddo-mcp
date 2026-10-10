import type { PuffoHttpClient } from "../../../http/client";

export interface UpdateSpacePatch {
  name?: string;
  description?: string;
  avatar_url?: string;
}

export interface UpdateChannelPatch {
  name?: string;
  description?: string;
  is_encrypted?: boolean;
}

interface UpdateSpaceResponse {
  ok: boolean;
  space_id: string;
  updated_at: number;
}

interface UpdateChannelResponse {
  ok: boolean;
  space_id: string;
  channel_id: string;
  updated_at: number;
}

export async function updateSpace(
  http: PuffoHttpClient,
  spaceId: string,
  patch: UpdateSpacePatch,
): Promise<UpdateSpaceResponse> {
  return http.patch<UpdateSpaceResponse>(
    `/spaces/${encodeURIComponent(spaceId)}`,
    patch as unknown as Record<string, unknown>,
  );
}

export async function setSpaceArchived(
  http: PuffoHttpClient,
  spaceId: string,
  archived: boolean,
): Promise<{ ok: boolean; archived_at: number | null }> {
  return http.post(`/spaces/${encodeURIComponent(spaceId)}/${archived ? "archive" : "unarchive"}`, {});
}

export interface MemberSettingsResponse {
  auto_accept_owner_invite: boolean;
  auto_accept_member_invite: boolean;
}

export interface MemberSettingsPatch {
  auto_accept_owner_invite?: boolean;
  auto_accept_member_invite?: boolean;
}

export async function getMemberSettings(
  http: PuffoHttpClient,
  spaceId: string,
): Promise<MemberSettingsResponse> {
  return http.get<MemberSettingsResponse>(
    `/spaces/${encodeURIComponent(spaceId)}/members/me/settings`,
  );
}

export async function patchMemberSettings(
  http: PuffoHttpClient,
  spaceId: string,
  patch: MemberSettingsPatch,
): Promise<MemberSettingsResponse> {
  return http.patch<MemberSettingsResponse>(
    `/spaces/${encodeURIComponent(spaceId)}/members/me/settings`,
    patch as unknown as Record<string, unknown>,
  );
}

export async function updateChannel(
  http: PuffoHttpClient,
  spaceId: string,
  channelId: string,
  patch: UpdateChannelPatch,
): Promise<UpdateChannelResponse> {
  return http.patch<UpdateChannelResponse>(
    `/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}`,
    patch as unknown as Record<string, unknown>,
  );
}

export async function deleteSpace(
  http: PuffoHttpClient,
  spaceId: string,
): Promise<void> {
  await http.delete(`/spaces/${encodeURIComponent(spaceId)}`);
}

export async function deleteChannel(
  http: PuffoHttpClient,
  spaceId: string,
  channelId: string,
): Promise<void> {
  await http.delete(
    `/spaces/${encodeURIComponent(spaceId)}/channels/${encodeURIComponent(channelId)}`,
  );
}
