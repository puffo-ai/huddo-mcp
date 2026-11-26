import type { PuffoHttpClient } from "../../../http/client";
import { isStreamedAttachment } from "../../attachments/domain/attachment";
import type { CryptoOps } from "../../../http/types";
import {
  ATTACHMENT_CONTENT_TYPE,
  downloadAndDecryptAttachment,
  encryptAndUploadAttachment,
  type AttachmentMeta,
} from "../../../message/core/attachments";
import { type StoredMessage, VerifyStatus } from "../../../message/store/types";
import { awaitCoreMessageSender, coreMessageSender } from "../../../application/runtime/core-message-sender-port";
import type { MessageReader } from "../application/message-repository";
import type { PreparedSend, SendMessageCommand } from "../domain/outgoing-message";
import type { PendingSend } from "../domain/pending-send";

class ConversationSendPreflightError extends Error {}

/** Tries after a refusal the server says to retry, such as slow mode; the same idempotency key keeps it one message. */
const SEND_RETRIES = 2;

interface DmConversation {
  kind: "dm";
  peerSlug?: string;
}

interface ChannelConversation {
  kind: "channel";
  spaceId?: string;
  channelId?: string;
}

export type SendConversation = DmConversation | ChannelConversation;

export interface ConversationSendRuntime {
  slug: string | null;
  http: PuffoHttpClient | null;
  crypto: CryptoOps;
  messageStore: MessageReader | null;
  resendsInFlight: Set<string>;
  assertActive(): void;
  isConversationActive(): boolean;
  formatFailure(error: unknown): string;
  mayHaveReachedServer(error: unknown): boolean;
  /** The wait before trying a refused send again (slow mode), or null when it is not worth another try. */
  retryDelay?(error: unknown): number | null;
  /** The line for the latest failure (null clears it), with the error that caused it. */
  projectError(error: string | null, cause?: unknown): void;
  presentation: ConversationSendPresentation;
}

export interface ConversationSendPresentation {
  mergeWindow(ownerSlug: string, stored: StoredMessage, channelId?: string): void;
  reportChannelRead(channelId: string): void;
  reportDmRead(peerSlug: string): void;
  addDmPeer(peerSlug: string): void;
  bumpRead(): void;
  getPendingSends(): PendingSend[];
  addPendingSend(row: PendingSend): void;
  removePendingSend(tempId: string): void;
  promotePendingSend(tempId: string, stored: StoredMessage): void;
  markPendingFailed(tempId: string, reason: string): void;
  markPendingUnconfirmed(tempId: string, reason: string): void;
  markPendingSending(tempId: string): void;
  isSendInFlight?(tempId: string): boolean;
}

export interface ConversationSendAdapter {
  send(command: SendMessageCommand): Promise<boolean>;
  uploadAttachment(
    file: File,
    onPhase: (phase: "uploading" | "verifying") => void,
    onProgress?: (fraction: number) => void,
  ): Promise<AttachmentMeta>;
  resend(tempId: string): Promise<void>;
  dispose(): void;
}

function commandContent(command: SendMessageCommand) {
  if (command.content.kind === "custom") return command.content.content;
  return command.content.kind === "text"
    ? command.content.text
    : {
        text: command.content.text,
        attachments: command.content.attachments as AttachmentMeta[],
        ...(command.content.preview ? { preview: command.content.preview } : {}),
      };
}

function contentType(command: SendMessageCommand) {
  if (command.content.kind === "custom") return command.content.contentType;
  return command.content.kind === "text"
    ? "text/plain"
    : ATTACHMENT_CONTENT_TYPE;
}

function commandContentFromPending(row: PendingSend): SendMessageCommand["content"] {
  if (row.message.content_type !== "text/plain" && row.message.content_type !== ATTACHMENT_CONTENT_TYPE) {
    return { kind: "custom", contentType: row.message.content_type, content: row.message.content };
  }
  if (
    row.message.content_type === ATTACHMENT_CONTENT_TYPE
    && typeof row.message.content === "object"
    && row.message.content !== null
    && ("options" in row.message.content || "choice" in row.message.content)
  ) {
    return { kind: "custom", contentType: row.message.content_type, content: row.message.content };
  }
  if (
    row.message.content_type === ATTACHMENT_CONTENT_TYPE
    && typeof row.message.content === "object"
    && row.message.content !== null
  ) {
    const content = row.message.content as {
      text?: unknown;
      attachments?: unknown;
      preview?: unknown;
    };
    return {
      kind: "attachments",
      text: typeof content.text === "string" ? content.text : "",
      attachments: Array.isArray(content.attachments) ? content.attachments : [],
      ...(content.preview ? { preview: content.preview } : {}),
    };
  }
  return { kind: "text", text: String(row.message.content) };
}

export function createConversationSendAdapter({
  conversation,
  slug,
  http,
  crypto,
  messageStore,
  resendsInFlight,
  assertActive,
  isConversationActive,
  formatFailure,
  mayHaveReachedServer,
  retryDelay,
  projectError,
  presentation,
}: ConversationSendRuntime & {
  conversation: SendConversation;
}): ConversationSendAdapter {
  const boundSlug = slug!;
  const boundHttp = http!;
  const ownsPendingRow = (row: PendingSend) => conversation.kind === "dm"
    ? row.dmPeerSlug === conversation.peerSlug
    : row.channelId === conversation.channelId;

  const projectStored = (
    tempId: string,
    stored: StoredMessage,
  ) => {
    presentation.mergeWindow(
      boundSlug,
      stored,
      conversation.kind === "channel" ? conversation.channelId : undefined,
    );
    if (conversation.kind === "dm") {
      presentation.reportDmRead(conversation.peerSlug!);
      presentation.addDmPeer(conversation.peerSlug!);
    } else {
      presentation.reportChannelRead(conversation.channelId!);
    }
    if (isConversationActive()) {
      presentation.promotePendingSend(tempId, stored);
    } else {
      presentation.removePendingSend(tempId);
    }
    presentation.bumpRead();
  };

  async function prepare(command: SendMessageCommand): Promise<PreparedSend<StoredMessage>> {
    if (!messageStore) throw new ConversationSendPreflightError("Message repository is not ready");
    if (conversation.kind === "dm") {
      if (!slug || !conversation.peerSlug || !http) throw new Error("DM send not ready");
      if (command.target.kind !== "dm" || command.target.peerSlug !== conversation.peerSlug) {
        throw new Error("DM target changed");
      }
    } else {
      if (!slug || !conversation.spaceId || !conversation.channelId || !http) {
        throw new Error("Channel send not ready");
      }
      if (command.target.kind !== "channel"
        || command.target.channelId !== conversation.channelId
        || command.target.spaceId !== conversation.spaceId) {
        throw new Error("Channel target changed");
      }
    }
    assertActive();
    const { tempId: requestedTempId, ...outgoingCommand } = command;
    const tempId = requestedTempId ?? globalThis.crypto.randomUUID();
    const now = Date.now();
    return {
      tempId,
      command: outgoingCommand,
      optimistic: {
        envelope_id: `tmp_${tempId}`,
        envelope_kind: conversation.kind,
        sender_slug: slug,
        channel_id: conversation.kind === "channel" ? conversation.channelId! : null,
        space_id: conversation.kind === "channel" ? conversation.spaceId! : null,
        recipient_slug: conversation.kind === "dm" ? conversation.peerSlug! : null,
        content_type: contentType(command),
        content: commandContent(command),
        sent_at: now,
        received_at: now,
        thread_root_id: null,
        reply_to_id: outgoingCommand.replyToId ?? null,
        is_visible_to_human: true,
        verify_status: VerifyStatus.Verified,
      },
    };
  }

  function projectPending(pending: PreparedSend<StoredMessage>): void {
    if (isConversationActive()) projectError(null);
    if (presentation.getPendingSends().some((send) => send.tempId === pending.tempId)) {
      presentation.removePendingSend(pending.tempId);
    }
    presentation.addPendingSend({
      tempId: pending.tempId,
      channelId: conversation.kind === "channel" ? conversation.channelId! : null,
      dmPeerSlug: conversation.kind === "dm" ? conversation.peerSlug! : null,
      message: pending.optimistic,
      status: "sending",
      startedAt: Date.now(),
    });
  }

  function projectFailed(tempId: string, error: unknown): void {
    const reason = formatFailure(error);
    if (mayHaveReachedServer(error)) {
      presentation.markPendingUnconfirmed(tempId, reason);
      return;
    }
    presentation.markPendingFailed(tempId, reason);
    if (isConversationActive()) projectError(reason, error);
  }

  async function send(command: SendMessageCommand): Promise<boolean> {
    let pending: PreparedSend<StoredMessage>;
    try {
      assertActive();
      pending = await prepare(command);
      assertActive();
    } catch (error) {
      try { assertActive(); } catch { return false; }
      if (isConversationActive()) {
        projectError(error instanceof ConversationSendPreflightError ? error.message : formatFailure(error), error);
      }
      return false;
    }
    projectPending(pending);
    try {
      const sender = coreMessageSender() ?? (await awaitCoreMessageSender());
      assertActive();
      const request = {
        target: pending.command.target,
        contentType: contentType(pending.command),
        content: commandContent(pending.command),
        idempotencyKey: pending.tempId,
        replyToId: pending.command.replyToId,
      };
      let stored: StoredMessage;
      for (let attempt = 0; ; attempt += 1) {
        try {
          stored = await sender.send(request);
          break;
        } catch (error) {
          const wait = attempt < SEND_RETRIES ? (retryDelay?.(error) ?? null) : null;
          if (wait === null) throw error;
          await new Promise((resolve) => setTimeout(resolve, wait));
          assertActive();
        }
      }
      assertActive();
      projectStored(pending.tempId, stored);
      return true;
    } catch (error) {
      try { assertActive(); } catch {
        presentation.removePendingSend(pending.tempId);
        return false;
      }
      projectFailed(pending.tempId, error);
      return false;
    }
  }

  return {
    send,
    async uploadAttachment(file, onPhase, onProgress) {
      if (!http) throw new Error("Not signed in");
      onPhase("uploading");
      const meta = await encryptAndUploadAttachment(crypto, http, file, undefined, undefined, undefined, onProgress
        ? ({ done, total }) => onProgress(total ? done / total : 1)
        : undefined);
      assertActive();
      if (isStreamedAttachment(meta)) return meta;
      onPhase("verifying");
      await downloadAndDecryptAttachment(crypto, http, meta);
      assertActive();
      return meta;
    },
    async resend(tempId) {
      if (!messageStore || !http || !slug) return;
      const row = presentation.getPendingSends().find((pending) => pending.tempId === tempId);
      if (!row || (row.status !== "failed" && row.status !== "unconfirmed") || !ownsPendingRow(row)) return;
      if (presentation.isSendInFlight?.(tempId)) {
        presentation.markPendingSending(tempId);
        return;
      }
      if (resendsInFlight.has(tempId)) return;
      resendsInFlight.add(tempId);
      try {
        await send({
          target: conversation.kind === "dm"
            ? { kind: "dm", peerSlug: conversation.peerSlug! }
            : { kind: "channel", channelId: conversation.channelId!, spaceId: conversation.spaceId! },
          content: commandContentFromPending(row),
          replyToId: row.message.reply_to_id ?? undefined,
          tempId,
        });
      } finally {
        resendsInFlight.delete(tempId);
      }
    },
    dispose() {},
  };
}
