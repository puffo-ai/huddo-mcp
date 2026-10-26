import type { MessageEnvelope, PlaintextMessageEnvelope } from "../../../message/core/types";
import type { StoredMessage } from "./message";

export type PendingSendStatus = "sending" | "unconfirmed" | "failed";

export interface PendingSend {
  tempId: string;
  channelId: string | null;
  dmPeerSlug: string | null;
  threadRootId: string | null;
  message: StoredMessage;
  status: PendingSendStatus;
  startedAt: number;
  failureReason?: string;
  resendEnvelope?: MessageEnvelope | PlaintextMessageEnvelope;
}

export type ResendStrategy = "replay" | "fresh" | "blocked";

export function resendStrategy(pending: PendingSend): ResendStrategy {
  if (pending.resendEnvelope) return "replay";
  return typeof pending.message.content === "string" ? "fresh" : "blocked";
}

export function isResendable(pending: PendingSend): boolean {
  return resendStrategy(pending) !== "blocked";
}
