export type ReadScopeType = "channel" | "direct";

export type ReadCursor = Readonly<{
  scope_type: ReadScopeType;
  scope_id: string;
  thread_root_id: string | null;
  seq: number;
  envelope_id: string;
  updated_at: number;
}>;

export type ChannelUnread = Readonly<{
  space_id: string;
  channel_id: string;
  count: number;
  last_sent_at_ms: number;
  last_seq: number | null;
  root_unread: number;
  thread_unread: number;
}>;

export type DirectUnread = Readonly<{
  peer_slug: string;
  count: number;
  last_sent_at_ms: number;
  last_seq: number | null;
  root_unread: number;
  thread_unread: number;
}>;

export type UnreadSummary = Readonly<{ channels: ChannelUnread[]; directs: DirectUnread[] }>;

export type CoreReadState = Readonly<{
  /** `upToSeq` stops the cursor at that message; by default it moves to the newest. With `upToEnvelopeId`, the
   *  cursor moves to that message even when core does not hold it yet. */
  markRead(scopeType: ReadScopeType, scopeId: string, upToSeq?: number, upToEnvelopeId?: string): Promise<ReadCursor | null>;
  sync(): Promise<ReadCursor[]>;
  cursors(): Promise<ReadCursor[]>;
  unreadSummary(): Promise<UnreadSummary>;
}>;

let installed: CoreReadState | null = null;
const listeners = new Set<() => void>();
const waiters = new Set<(port: CoreReadState | null) => void>();

export function installCoreReadState(port: CoreReadState | null): void {
  installed = port;
  for (const waiter of [...waiters]) waiter(port);
  publishReadStateChanged();
}

export function coreReadState(): CoreReadState | null {
  return installed;
}

export const READ_STATE_WAIT_MS = 120_000;

export function awaitCoreReadState(timeoutMs = READ_STATE_WAIT_MS): Promise<CoreReadState | null> {
  if (installed) return Promise.resolve(installed);
  return new Promise((resolve) => {
    const settle = (port: CoreReadState | null) => {
      waiters.delete(settle);
      clearTimeout(timer);
      resolve(port);
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    waiters.add(settle);
  });
}

export function publishReadStateChanged(): void {
  for (const listener of [...listeners]) listener();
}

export function subscribeReadStateChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
