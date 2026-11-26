import { unknownOutcome } from "./protocol";
import type { CoreMessageReader, HistoryWindow, RoomItemPage, UnsentMessage } from "../../../application/runtime/core-message-reader-port";
import type { StoredMessage } from "../../../features/messages/domain/message";
import type { CoreClient } from "./client";
import { membershipMessagesFromEvents, type SpaceEventRecord } from "../../../features/spaces/domain/membership-system-message";

export type MessageView = Readonly<{
  envelope_id: string;
  route: { Channel: { space_id: string; channel_id: string } } | { Direct: { peer_slug: string } } | "Unknown";
  sender_slug: string;
  body: string;
  thread_root_id: string | null;
  reply_to_id: string | null;
  content_type: string | null;
  content: unknown;
  sent_at_ms: number;
  is_visible_to_human: boolean;
  verification: "Pending" | "Verified" | "Rejected";
  display: string;
  relay_seq: number | null;
}>;

const VERIFY: Record<MessageView["verification"], StoredMessage["verify_status"]> = {
  Pending: "pending",
  Verified: "verified",
  Rejected: "verify_failed",
};

const UNSENT: Partial<Record<string, NonNullable<StoredMessage["send_state"]>>> = {
  Pending: "pending",
  Failed: "failed",
};

export function toStoredMessage(view: MessageView): StoredMessage | null {
  if (view.route === "Unknown" || view.display === "MessageRequest") return null;
  const channel = "Channel" in view.route ? view.route.Channel : null;
  const sendState = view.relay_seq === null ? UNSENT[view.display] : undefined;
  return {
    ...(sendState ? { send_state: sendState } : {}),
    envelope_id: view.envelope_id,
    ...(view.relay_seq === null ? {} : { seq: view.relay_seq }),
    envelope_kind: channel ? "channel" : "dm",
    sender_slug: view.sender_slug,
    channel_id: channel?.channel_id ?? null,
    space_id: channel?.space_id ?? null,
    recipient_slug: "Direct" in view.route ? view.route.Direct.peer_slug : null,
    content_type: view.content_type ?? "text/plain",
    content: view.content ?? view.body,
    sent_at: view.sent_at_ms,
    received_at: view.sent_at_ms,
    thread_root_id: view.thread_root_id,
    reply_to_id: view.reply_to_id,
    is_visible_to_human: view.is_visible_to_human,
    verify_status: VERIFY[view.verification],
  };
}

type Page = { items: MessageView[]; has_more: boolean; next_before_sent_at_ms: number | null };

export const CORE_PAGE_LIMIT = 500;

export async function fetchStoredMessages(client: Pick<CoreClient, "call">, ids: readonly string[]): Promise<StoredMessage[]> {
  const outcome = await client.call("query", JSON.stringify({ type: "get_messages", envelope_ids: ids }));
  if (outcome.status === "unknown") throw unknownOutcome("get_messages", outcome);
  const envelope = JSON.parse(outcome.envelope) as { ok?: { items: MessageView[] }; err?: { code: string; message: string } };
  if (!envelope.ok) throw new Error(`get_messages: ${envelope.err?.code}: ${envelope.err?.message}`);
  return envelope.ok.items.flatMap((view) => toStoredMessage(view) ?? []);
}

export function createCoreMessageReader(client: Pick<CoreClient, "call">): CoreMessageReader {
  let spaces = new Map<string, string>();

  async function query<T>(body: Record<string, unknown>): Promise<T> {
    const outcome = await client.call("query", JSON.stringify(body));
    if (outcome.status === "unknown") throw unknownOutcome(`${body.type}`, outcome);
    const envelope = JSON.parse(outcome.envelope) as { ok?: T; err?: { code: string; message: string } };
    if (!envelope.ok) throw new Error(`${body.type}: ${envelope.err?.code}: ${envelope.err?.message}`);
    return envelope.ok;
  }

  async function request<T>(name: string, payload: Record<string, unknown>): Promise<T> {
    const outcome = await client.call("request", JSON.stringify({ v: 2, name, payload }));
    if (outcome.status === "unknown") throw unknownOutcome(name, outcome);
    const envelope = JSON.parse(outcome.envelope) as { ok?: T; err?: { code: string; message: string } };
    if (!envelope.ok) throw new Error(`${name}: ${envelope.err?.code}: ${envelope.err?.message}`);
    return envelope.ok;
  }

  async function spaceOf(channelId: string): Promise<string | undefined> {
    if (!spaces.has(channelId)) {
      const { items } = await query<{ items: Array<{ space_id: string; channel_id: string }> }>({ type: "list_channels" });
      spaces = new Map(items.map((channel) => [channel.channel_id, channel.space_id]));
    }
    return spaces.get(channelId);
  }

  async function allSpaceEvents(spaceId: string): Promise<SpaceEventRecord[]> {
    const events: SpaceEventRecord[] = [];
    let after: number | undefined;
    for (;;) {
      const page = await query<{ items: Array<SpaceEventRecord & { server_seq: number }>; has_more: boolean }>({
        type: "list_space_events",
        space_id: spaceId,
        ...(after === undefined ? {} : { after_seq: after }),
      });
      events.push(...page.items);
      if (!page.has_more || page.items.length === 0) return events;
      after = page.items[page.items.length - 1]!.server_seq;
    }
  }

  const stored = (views: readonly MessageView[]) => views.flatMap((view) => toStoredMessage(view) ?? []);

  async function pages(body: Record<string, unknown>, limit: number, before?: number): Promise<MessageView[]> {
    const views: MessageView[] = [];
    let cursor: number | null = before ?? null;
    while (views.length < limit) {
      const next: Page = await query({
        ...body,
        limit: Math.min(limit - views.length, CORE_PAGE_LIMIT),
        ...(cursor === null ? {} : { before_sent_at_ms: cursor }),
      });
      views.push(...next.items);
      if (!next.has_more || next.next_before_sent_at_ms === null) break;
      cursor = next.next_before_sent_at_ms;
    }
    return views;
  }

  return {
    async getChannelHistory(channelId, limit, before) {
      const spaceId = await spaceOf(channelId);
      if (!spaceId) return null;
      const route = { kind: "channel", space_id: spaceId, channel_id: channelId };
      return stored(await pages({ type: "list_messages", route }, limit, before)).reverse();
    },
    async searchChannel(channelId, text, limit, before) {
      const spaceId = await spaceOf(channelId);
      if (!spaceId) return null;
      const route = { kind: "channel", space_id: spaceId, channel_id: channelId };
      return stored(await pages({ type: "search_messages", route, text }, limit, before));
    },
    async getMessage(envelopeId) {
      const { message } = await query<{ message: MessageView | null }>({ type: "get_message", envelope_id: envelopeId });
      return message ? toStoredMessage(message) : null;
    },
    async listRoomItems(channelId, kind, limit, before) {
      const spaceId = await spaceOf(channelId);
      if (!spaceId) return null;
      return query<RoomItemPage>({
        type: "list_room_items",
        space_id: spaceId,
        channel_id: channelId,
        kind,
        limit: Math.min(limit, CORE_PAGE_LIMIT),
        ...(before ? { before } : {}),
      });
    },
    async backfillChannel(channelId, limit, ifNeeded = false) {
      const payload = { channel_id: channelId, limit, ...(ifNeeded ? { if_needed: true } : {}) };
      return (await request<{ stored: number }>("backfill_channel_history", payload)).stored;
    },
    async loadOlder(channelId, limit) {
      const { stored, complete } = await request<{ stored: number; complete?: boolean }>("backfill_channel_history", {
        channel_id: channelId,
        limit,
        resume: true,
      });
      return { stored, complete: Boolean(complete) };
    },
    async historyWindow(channelId) {
      return (await request<{ window: HistoryWindow | null }>("history_window", { channel_id: channelId })).window;
    },
    async fetchMessage(envelopeId) {
      const { found } = await request<{ found: boolean }>("fetch_message", { envelope_id: envelopeId });
      return found ? this.getMessage(envelopeId) : null;
    },
    async fetchAround(channelId, messageId) {
      const { window } = await request<{
        window: { message_ids: string[]; has_newer: boolean; unsent: UnsentMessage[] } | null;
      }>("fetch_history_around", { channel_id: channelId, around: messageId });
      if (!window) return null;
      const messages = await fetchStoredMessages(client, window.message_ids);
      if (!messages.some((message) => message.envelope_id === messageId)) return null;
      return { messages, unsent: window.unsent, hasNewer: window.has_newer };
    },
    async focusSpace(spaceId) {
      const outcome = await client.call("execute", JSON.stringify({ type: "focus_space", space_id: spaceId }));
      if (outcome.status === "unknown") throw unknownOutcome("focus_space", outcome);
      const envelope = JSON.parse(outcome.envelope) as { ok?: unknown; err?: { code: string; message: string } };
      if (!envelope.ok) throw new Error(`focus_space: ${envelope.err?.code}: ${envelope.err?.message}`);
    },
    async membershipRows(channelId) {
      const spaceId = await spaceOf(channelId);
      if (!spaceId) return [];
      const [events, { items: channels }] = await Promise.all([
        allSpaceEvents(spaceId),
        query<{ items: Array<{ channel_id: string; name: string }> }>({ type: "list_channels", space_id: spaceId }),
      ]);
      const main = (channels.find((channel) => channel.name === "General") ?? channels[0])?.channel_id === channelId;
      return membershipMessagesFromEvents(events, { spaceId, channelId, main });
    },
    async recentMessages(limit) {
      const { items } = await query<{ items: MessageView[] }>({ type: "list_recent_messages", limit });
      return stored(items);
    },
  };
}
