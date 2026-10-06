import type { CreatedChannel, CreatedSpace } from "../domain";

// Capital G is intentional; lowercase general belongs only to older spaces.
export const DEFAULT_CHANNEL_NAME = "General";

export interface CreatedSpaceWithGeneral {
  spaceId: string;
  spaceName: string;
  joinedAt: number;
  channelId: string;
  channelName: string;
  isPublic: boolean;
  isEncrypted: boolean;
  createdBy: string;
}

export interface SpaceCommandPort {
  createSpace(name: string): Promise<CreatedSpace>;
  createChannel(spaceId: string, name: string): Promise<CreatedChannel>;
}

export async function createSpaceWithGeneral(
  commands: SpaceCommandPort,
  signerSlug: string,
  spaceName: string,
): Promise<CreatedSpaceWithGeneral> {
  const space = await commands.createSpace(spaceName);

  // Servers since f06a15e emit General with CreateSpace; this fallback keeps
  // compatibility with older deployments where defaultChannel is absent.
  let channelId: string;
  let channelName: string;
  let isPublic: boolean;
  if (space.defaultChannel) {
    channelId = space.defaultChannel.channelId;
    channelName = space.defaultChannel.name;
    isPublic = space.defaultChannel.isPublic;
  } else {
    const ch = await commands.createChannel(space.spaceId, DEFAULT_CHANNEL_NAME);
    channelId = ch.channelId;
    channelName = ch.name;
    isPublic = false;
  }

  return {
    spaceId: space.spaceId,
    spaceName: space.name,
    joinedAt: space.joinedAt,
    channelId,
    channelName,
    isPublic,
    isEncrypted: true,
    createdBy: signerSlug,
  };
}
