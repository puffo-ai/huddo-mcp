import {
  createConversationSendAdapter,
  type ConversationSendAdapter,
  type ConversationSendRuntime,
} from "./conversation-send";

export type ChannelSendAdapter = ConversationSendAdapter;

export function createChannelSendAdapter({
  spaceId,
  channelId,
  ...runtime
}: ConversationSendRuntime & {
  spaceId?: string;
  channelId?: string;
}): ChannelSendAdapter {
  return createConversationSendAdapter({
    ...runtime,
    conversation: { kind: "channel", spaceId, channelId },
  });
}
