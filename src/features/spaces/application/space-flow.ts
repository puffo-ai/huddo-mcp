import type { CreatedChannel, CreatedSpace } from "../domain";

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
