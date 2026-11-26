import type { PuffoHttpClient } from "../../../http/client";
import type { PlaintextMessageEnvelope } from "../../../message/core/types";
import { isPlaintextEnvelope } from "../../../message/core/types";

export const JOINED_CHANNEL_HISTORY_ROOT_LIMIT = 100;
export const JOINED_CHANNEL_HISTORY_ENVELOPE_LIMIT = 500;
export const JOINED_CHANNEL_HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface ServerHistoryItem {
  seq?: number;
  envelope?: Record<string, unknown>;
}

interface ServerHistoryResponse {
  messages?: ServerHistoryItem[];
}

function isRecentChannelEnvelope(
  envelope: Record<string, unknown>,
  channelId: string,
  cutoff: number,
): envelope is Record<string, unknown> & PlaintextMessageEnvelope {
  if (!isPlaintextEnvelope(envelope)) return false;
  const payload = envelope.signed_payload?.payload;
  return payload?.envelope_kind === "channel"
    && payload.channel_id === channelId
    && typeof payload.sent_at === "number"
    && payload.sent_at >= cutoff;
}

export async function fetchJoinedPlaintextChannelHistory(
  http: PuffoHttpClient,
  channelId: string,
  joinedAt: number,
  rootLimit = JOINED_CHANNEL_HISTORY_ROOT_LIMIT,
): Promise<PlaintextMessageEnvelope[]> {
  const path = `/v2/messages/history/channel/${encodeURIComponent(channelId)}`
    + `?limit=${rootLimit}`;
  const response = await http.get<ServerHistoryResponse>(path);
  const cutoff = joinedAt - JOINED_CHANNEL_HISTORY_MAX_AGE_MS;
  const recent = (response.messages ?? []).flatMap((item) => {
    const envelope = item.envelope;
    if (!envelope || !isRecentChannelEnvelope(envelope, channelId, cutoff)) return [];
    return [{
      ...envelope,
      ...(typeof item.seq === "number" ? { seq: item.seq } : {}),
    }];
  });

  return recent
    .sort((a, b) => (b.seq ?? Number.MIN_SAFE_INTEGER) - (a.seq ?? Number.MIN_SAFE_INTEGER))
    .slice(0, JOINED_CHANNEL_HISTORY_ENVELOPE_LIMIT)
    .sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER));
}
