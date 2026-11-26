export type ConversationTarget =
  | { kind: "dm"; peerSlug: string }
  | { kind: "channel"; channelId: string; spaceId: string | null };

export type AttachmentReference = unknown;

export type OutgoingContent =
  | { kind: "text"; text: string }
  | { kind: "attachments"; text: string; attachments: AttachmentReference[]; preview?: unknown }
  | { kind: "custom"; contentType: string; content: unknown };

export interface SendMessageCommand {
  target: ConversationTarget;
  content: OutgoingContent;
  replyToId?: string;
  tempId?: string;
}

export interface PreparedSend<TOptimistic> {
  tempId: string;
  command: SendMessageCommand;
  optimistic: TOptimistic;
}
