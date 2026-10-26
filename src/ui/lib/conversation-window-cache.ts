import type { StoredMessage } from "../../message/store/types";
import {
  insertInSentAtOrder,
  mergeInSentAtOrder,
  sortInSentAtOrder,
} from "../stores/_message-ordering";

const MAX_WINDOWS = 24;
const MAX_CONCURRENT_PRELOADS = 2;
export const HISTORY_ROOT_PAGE_SIZE = 20;

export function historyWindowMayHaveOlderRoots(
  messages: readonly Pick<StoredMessage, "thread_root_id">[],
  rootPageSize = HISTORY_ROOT_PAGE_SIZE,
): boolean {
  let roots = 0;
  for (const message of messages) {
    if (!message.thread_root_id && ++roots >= rootPageSize) return true;
  }
  return false;
}

const windows = new Map<string, StoredMessage[]>();
const inflight = new Map<string, Promise<StoredMessage[]>>();
const queued: Array<() => void> = [];
let activePreloads = 0;
let cacheGeneration = 0;

function touch(key: string, messages: StoredMessage[]) {
  windows.delete(key);
  windows.set(key, messages);
  while (windows.size > MAX_WINDOWS) {
    const oldest = windows.keys().next().value;
    if (oldest) windows.delete(oldest);
  }
}

function runNext() {
  if (activePreloads >= MAX_CONCURRENT_PRELOADS) return;
  queued.shift()?.();
}

export function getConversationWindow(key: string): StoredMessage[] | null {
  const messages = windows.get(key);
  if (!messages) return null;
  touch(key, messages);
  return messages;
}

export function channelConversationWindowKey(
  viewerSlug: string | null | undefined,
  channelId: string,
): string {
  return `${viewerSlug ?? "anonymous"}:channel:${channelId}`;
}

export function dmConversationWindowKey(
  viewerSlug: string | null | undefined,
  peerSlug: string,
): string {
  return `${viewerSlug ?? "anonymous"}:dm:${peerSlug}`;
}

export function conversationWindowKeyForMessage(
  viewerSlug: string,
  message: StoredMessage,
  resolvedChannelId: string | null,
): string | null {
  if (message.envelope_kind !== "dm") {
    return resolvedChannelId
      ? channelConversationWindowKey(viewerSlug, resolvedChannelId)
      : null;
  }
  const peer = message.sender_slug === viewerSlug
    ? message.recipient_slug
    : message.sender_slug;
  return peer && peer !== viewerSlug
    ? dmConversationWindowKey(viewerSlug, peer)
    : null;
}

export function putConversationWindow(key: string, messages: StoredMessage[]) {
  if (messages.length === 0) return;
  touch(key, messages);
}

export function mergeConversationWindow(
  key: string,
  messages: StoredMessage[],
): StoredMessage[] | null {
  const cached = windows.get(key);
  if (!cached) return null;
  const merged = mergeInSentAtOrder(cached, messages);
  touch(key, merged);
  return merged;
}

export function mergeMessageIntoConversationWindow(
  viewerSlug: string,
  message: StoredMessage,
  resolvedChannelId: string | null = message.channel_id,
): void {
  const key = conversationWindowKeyForMessage(
    viewerSlug,
    message,
    resolvedChannelId,
  );
  if (!key) return;

  const cached = windows.get(key);
  if (!cached) return;

  const existingIndex = cached.findIndex(
    (candidate) => candidate.envelope_id === message.envelope_id,
  );
  if (existingIndex >= 0) {
    const next = [...cached];
    next[existingIndex] = message;
    touch(key, sortInSentAtOrder(next));
    return;
  }

  if (
    message.thread_root_id
    && !cached.some(
      (candidate) => candidate.envelope_id === message.thread_root_id,
    )
  ) {
    return;
  }

  touch(key, insertInSentAtOrder(cached, message));
}

export function invalidateConversationWindows(keys: Iterable<string>): void {
  for (const key of keys) windows.delete(key);
}

export function preloadConversationWindow(
  key: string,
  load: () => StoredMessage[],
): Promise<StoredMessage[]> {
  const cached = getConversationWindow(key);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(key);
  if (existing) return existing;

  const generation = cacheGeneration;
  const request = new Promise<StoredMessage[]>((resolve, reject) => {
    const run = () => {
      activePreloads += 1;
      setTimeout(() => {
        try {
          const messages = load();
          if (generation === cacheGeneration) {
            putConversationWindow(key, messages);
          }
          resolve(messages);
        } catch (error) {
          reject(error);
        } finally {
          activePreloads -= 1;
          if (inflight.get(key) === request) inflight.delete(key);
          runNext();
        }
      }, 0);
    };
    if (activePreloads < MAX_CONCURRENT_PRELOADS) run();
    else queued.push(run);
  });
  inflight.set(key, request);
  return request;
}

export function clearConversationWindows() {
  cacheGeneration += 1;
  windows.clear();
  inflight.clear();
}
