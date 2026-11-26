import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PuffoHttpClient } from "../../../http/client";
import type { CryptoOps } from "../../../http/types";
import type { StoredIdentity } from "../../../identity/primitives/keystore";
import type { AttachmentMeta } from "../../../message/core/attachments";
import { createChannelSendAdapter } from "../adapters/channel-send";
import type { ConversationSendPresentation } from "../adapters/conversation-send";
import type { MessageReader } from "../application/message-repository";
import { sendFailureReason, sendErrorMayHaveReachedServer, slowModeRetryDelay } from "./send-failure-reason";
import {
  assertSendBinding,
  refreshSendBinding,
  type SendBinding,
  type SendBindingInput,
} from "./send-binding";

export interface ChannelSendRuntime {
  auth: Pick<SendBindingInput, "serverUrl" | "slug" | "sessionGeneration">;
  getCurrentAuth(): Pick<SendBindingInput, "serverUrl" | "slug" | "sessionGeneration">;
  crypto: CryptoOps;
  messageStore: MessageReader | null;
  presentation: ConversationSendPresentation;
}

export function useChannelSendController({ spaceId, channelId, identity, http, runtime }: {
  spaceId?: string;
  channelId?: string;
  identity: StoredIdentity | null;
  http: PuffoHttpClient | null;
  runtime: ChannelSendRuntime;
}) {
  const { slug, serverUrl, sessionGeneration } = runtime.auth;
  const { crypto, messageStore } = runtime;
  // The line for the latest failed send, and the error behind it for screens that word it themselves.
  const [failed, setFailed] = useState<{ error: string; cause: unknown } | null>(null);
  const channelRef = useRef(channelId);
  const resendsInFlightRef = useRef(new Set<string>());
  const bindingRef = useRef<SendBinding | null>(null);
  const pendingDisposalRef = useRef<{ adapter: object; timer: ReturnType<typeof setTimeout> } | null>(null);
  const currentBinding = refreshSendBinding(bindingRef.current, {
    serverUrl, slug, sessionGeneration, identity, http, messageStore,
  });
  useLayoutEffect(() => {
    bindingRef.current = currentBinding;
  }, [currentBinding]);

  useEffect(() => setFailed(null), [serverUrl, slug, sessionGeneration, spaceId, channelId, identity, http, messageStore]);
  useLayoutEffect(() => {
    channelRef.current = channelId;
    return () => {
      if (channelRef.current === channelId) channelRef.current = undefined;
    };
  }, [channelId]);

  const adapter = useMemo(() => {
    const binding = currentBinding;
    return createChannelSendAdapter({
      slug, spaceId, channelId, http, crypto, messageStore, presentation: runtime.presentation,
      resendsInFlight: resendsInFlightRef.current,
      assertActive: () =>
        assertSendBinding(binding, bindingRef.current ?? currentBinding, runtime.getCurrentAuth(), "Channel"),
      isConversationActive: () => channelRef.current === channelId,
      formatFailure: sendFailureReason,
      mayHaveReachedServer: sendErrorMayHaveReachedServer,
      retryDelay: slowModeRetryDelay,
      projectError: (error, cause) => setFailed(error === null ? null : { error, cause }),
    });
  }, [channelId, crypto, currentBinding, http, messageStore, runtime, slug, spaceId]);
  useEffect(() => {
    if (pendingDisposalRef.current?.adapter === adapter) {
      clearTimeout(pendingDisposalRef.current.timer);
      pendingDisposalRef.current = null;
    }
    return () => {
      const timer = setTimeout(() => {
        adapter.dispose?.();
        if (pendingDisposalRef.current?.adapter === adapter) pendingDisposalRef.current = null;
      }, 0);
      pendingDisposalRef.current = { adapter, timer };
    };
  }, [adapter]);
  return useMemo(() => ({
      error: failed?.error ?? null,
      failure: failed ? failed.cause : null,
      send(text: string, attachments: AttachmentMeta[] = [], replyToId?: string, preview?: unknown) {
        return adapter.send({
          target: { kind: "channel", channelId: channelId ?? "", spaceId: spaceId ?? null },
          content: attachments.length === 0 && !preview ? { kind: "text", text } : { kind: "attachments", text, attachments, ...(preview ? { preview } : {}) },
          replyToId,
        });
      },
      sendCustom(contentType: string, content: unknown, replyToId?: string) {
        return adapter.send({
          target: { kind: "channel", channelId: channelId ?? "", spaceId: spaceId ?? null },
          content: { kind: "custom", contentType, content },
          replyToId,
        });
      },
      uploadAttachment: adapter.uploadAttachment,
      resend: adapter.resend,
      dispose: () => adapter.dispose?.(),
    }), [adapter, channelId, failed, spaceId]);
}
