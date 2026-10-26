import type { PuffoHttpClient } from "../../../http/client";
import { useIdentityTypeStore } from "./identity-type-store";
import {
  fetchChannelMembers as fetchChannelMembersFromTransport,
  fetchSpaceMembers as fetchSpaceMembersFromTransport,
} from "../adapters";

type IdentityRow = { slug: string; identity_type?: string };

function projectIdentityTypes(members: IdentityRow[]): void {
  if (members.length > 0) useIdentityTypeStore.getState().upsertMany(members);
}

export async function fetchChannelMembers(
  http: PuffoHttpClient,
  spaceId: string,
  channelId: string,
) {
  const members = await fetchChannelMembersFromTransport(http, spaceId, channelId);
  projectIdentityTypes(members);
  return members;
}

export async function fetchSpaceMembers(http: PuffoHttpClient, spaceId: string) {
  const members = await fetchSpaceMembersFromTransport(http, spaceId);
  projectIdentityTypes(members);
  return members;
}
