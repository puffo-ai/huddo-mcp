import type { StoredMessage } from "../../message/store/types";

export function compareKey(a: StoredMessage, b: StoredMessage): number {
  if (a.sent_at !== b.sent_at) return a.sent_at - b.sent_at;
  return a.envelope_id < b.envelope_id
    ? -1
    : a.envelope_id > b.envelope_id
      ? 1
      : 0;
}

export function insertInSentAtOrder(
  messages: StoredMessage[],
  m: StoredMessage,
): StoredMessage[] {
  if (messages.length === 0) return [m];
  const last = messages[messages.length - 1];
  if (compareKey(last, m) <= 0) return [...messages, m];
  for (let i = 0; i < messages.length; i++) {
    if (compareKey(messages[i], m) > 0) {
      return [...messages.slice(0, i), m, ...messages.slice(i)];
    }
  }
  throw new Error("insertInSentAtOrder: unreachable");
}

export function mergeInSentAtOrder(
  sorted: StoredMessage[],
  more: StoredMessage[],
): StoredMessage[] {
  if (more.length === 0) return sorted;
  const seen = new Set(sorted.map((m) => m.envelope_id));
  const deduped: StoredMessage[] = [];
  for (const m of more) {
    if (seen.has(m.envelope_id)) continue;
    seen.add(m.envelope_id);
    deduped.push(m);
  }
  if (deduped.length === 0) return sorted;
  deduped.sort(compareKey);
  const out: StoredMessage[] = [];
  let i = 0;
  let j = 0;
  while (i < sorted.length && j < deduped.length) {
    if (compareKey(sorted[i], deduped[j]) <= 0) {
      out.push(sorted[i++]);
    } else {
      out.push(deduped[j++]);
    }
  }
  while (i < sorted.length) out.push(sorted[i++]);
  while (j < deduped.length) out.push(deduped[j++]);
  return out;
}

export function sortInSentAtOrder(messages: StoredMessage[]): StoredMessage[] {
  return [...messages].sort(compareKey);
}
