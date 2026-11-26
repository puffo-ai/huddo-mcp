import type { StoredMessage } from "../../features/messages/domain/message";

export type RoomItemKind = "media" | "file" | "link";

export type RoomItemCursor = Readonly<{ sent_at_ms: number; envelope_id: string; ordinal: number }>;

export type RoomItem = Readonly<{
  envelope_id: string;
  ordinal: number;
  kind: RoomItemKind;
  sender_slug: string;
  sent_at_ms: number;
  text: string;
  attachment: unknown;
  url: string | null;
  host: string | null;
  whisper_to?: string | null;
}>;

/** Every root from the newest down to `before` is stored; `complete` once that is the whole channel. */
export type HistoryWindow = Readonly<{ before: number | null; before_id: string | null; complete: boolean }>;

/** A message in a fetched window that its sender unsent: no text, only where it was. */
export type UnsentMessage = Readonly<{ id: string; sender: string; ts: number; root_id: string | null }>;

/** The rows around a linked message; they can sit past a gap below the newest messages. */
export type MessageWindow = Readonly<{ messages: StoredMessage[]; unsent: UnsentMessage[]; hasNewer: boolean }>;

export type RoomItemPage = Readonly<{ items: RoomItem[]; has_more: boolean; next_before: RoomItemCursor | null }>;

export type CoreMessageReader = Readonly<{
  /** null when core does not know the channel yet. */
  getChannelHistory(channelId: string, limit: number, before?: number): Promise<StoredMessage[] | null>;
  /** newest first; this device's stored messages whose current text or attachment names contain `text` */
  searchChannel(channelId: string, text: string, limit: number, before?: number): Promise<StoredMessage[] | null>;
  getMessage(envelopeId: string): Promise<StoredMessage | null>;
  /** Newest first; null when core does not know the channel yet. */
  listRoomItems(channelId: string, kind: RoomItemKind, limit: number, before?: RoomItemCursor | null): Promise<RoomItemPage | null>;
  recentMessages(limit: number): Promise<StoredMessage[]>;
  /** Joined / left / removed / transferred rows for one channel, from core's synced space events. */
  membershipRows?(channelId: string): Promise<StoredMessage[]>;
  /** With `ifNeeded`, core skips a channel it has already backfilled and returns 0. */
  backfillChannel(channelId: string, limit: number, ifNeeded?: boolean): Promise<number>;
  /** Pages older history in just below the window; `complete` once the server has nothing older. */
  loadOlder(channelId: string, limit: number): Promise<Readonly<{ stored: number; complete: boolean }>>;
  historyWindow(channelId: string): Promise<HistoryWindow | null>;
  /** A message missing locally, fetched from the server by id; null when it is gone or not ours to read. */
  fetchMessage(envelopeId: string): Promise<StoredMessage | null>;
  /** The messages around one message, fetched and stored by core; null when it isn't available. */
  fetchAround(channelId: string, messageId: string): Promise<MessageWindow | null>;
  /** Core walks this space's events from now on; until then it only knows the server's member list. */
  focusSpace(spaceId: string): Promise<void>;
}>;

let installed: CoreMessageReader | null = null;
const waiters = new Set<(reader: CoreMessageReader) => void>();
const readerListeners = new Set<() => void>();

export function installCoreMessageReader(reader: CoreMessageReader | null): void {
  installed = reader;
  if (reader) for (const waiter of [...waiters]) waiter(reader);
  for (const listener of [...readerListeners]) listener();
}

export function subscribeCoreMessageReader(listener: () => void): () => void {
  readerListeners.add(listener);
  return () => readerListeners.delete(listener);
}

export const coreMessageReaderReady = (): boolean => installed !== null;

export const READER_WAIT_MS = 60_000;

export function awaitCoreMessageReader(timeoutMs = READER_WAIT_MS): Promise<CoreMessageReader> {
  if (installed) return Promise.resolve(installed);
  return new Promise((resolve, reject) => {
    const ready = (reader: CoreMessageReader) => {
      waiters.delete(ready);
      clearTimeout(timer);
      resolve(reader);
    };
    const timer = setTimeout(() => {
      waiters.delete(ready);
      reject(new Error("the core message reader did not start"));
    }, timeoutMs);
    waiters.add(ready);
  });
}

export function coreMessageReader(): CoreMessageReader | null {
  return installed;
}

const byTime = (a: StoredMessage, b: StoredMessage) => a.sent_at - b.sent_at || a.envelope_id.localeCompare(b.envelope_id);

const reader = (): Promise<CoreMessageReader> => (installed ? Promise.resolve(installed) : awaitCoreMessageReader());

/** Core rows, plus the membership notices core builds from the room's synced events. */
export async function channelHistory(channelId: string, limit = 50, before?: number): Promise<StoredMessage[]> {
  const core = await reader();
  const rows = await core.getChannelHistory(channelId, limit, before);
  if (!rows) return [];
  const oldest = rows.length === limit ? rows[0]!.sent_at : -Infinity;
  const newest = before ?? Infinity;
  const membership = (await core.membershipRows?.(channelId).catch(() => [])) ?? [];
  const ids = new Set(rows.map((message) => message.envelope_id));
  const notices = membership.filter((message) => message.sent_at >= oldest && message.sent_at < newest && !ids.has(message.envelope_id));
  return [...rows, ...notices].sort(byTime);
}

export async function message(envelopeId: string): Promise<StoredMessage | null> {
  return (await reader()).getMessage(envelopeId);
}

export async function channelOf(message: Pick<StoredMessage, "channel_id" | "thread_root_id">): Promise<string | null> {
  if (message.channel_id) return message.channel_id;
  if (!message.thread_root_id) return null;
  const root = await (await reader()).getMessage(message.thread_root_id);
  return root?.channel_id ?? null;
}
