import { unknownOutcome } from "./protocol";
import type { CoreMessageSender, CoreSendRequest } from "../../../application/runtime/core-message-sender-port";
import type { CoreClient } from "./client";
import { toStoredMessage, type MessageView } from "./core-message-reader";

const PLAIN_TEXT = "text/plain";

function route(target: CoreSendRequest["target"]) {
  if (target.kind === "dm") return { kind: "direct", recipient_slug: target.peerSlug };
  if (!target.spaceId) throw new Error("channel send needs the space id");
  return { kind: "channel", space_id: target.spaceId, channel_id: target.channelId };
}

function body(request: CoreSendRequest): string {
  if (typeof request.content === "string") return request.content;
  const text = (request.content as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : "";
}

export function createCoreMessageSender(client: Pick<CoreClient, "call">): CoreMessageSender {
  return {
    async send(request) {
      const plain = request.contentType === PLAIN_TEXT;
      const command = {
        type: "send_message",
        route: route(request.target),
        body: body(request),
        idempotency_key: request.idempotencyKey,
        thread_root_id: null,
        reply_to_id: request.replyToId ?? null,
        ...(plain ? {} : { content_type: request.contentType, content: request.content }),
      };
      const outcome = await client.call("execute", JSON.stringify(command));
      if (outcome.status === "unknown") throw unknownOutcome("send_message", outcome);
      const envelope = JSON.parse(outcome.envelope) as { ok?: MessageView; err?: { code: string; message: string } };
      if (!envelope.ok) throw new Error(`send_message: ${envelope.err?.code}: ${envelope.err?.message}`);
      const stored = toStoredMessage(envelope.ok);
      if (!stored) throw new Error("send_message returned a message the timeline cannot show");
      return stored;
    },
  };
}
