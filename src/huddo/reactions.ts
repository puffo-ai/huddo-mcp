import { isPlaintextEnvelope } from "../message/core/types";
import type { StoredMessage } from "../message/store/types";
import { QUERY_MAX_IDS } from "../http/query-ids";
import type { SignedHttp } from "./presence";

export const REACTION_CONTENT_TYPE = "huddo/reaction/v1";
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"] as const;

export interface ReactionContent {
  type: "reaction";
  target: string;
  emoji: string;
  op: "add" | "remove";
}

export interface ReactionEvent {
  target: string;
  emoji: string;
  add: boolean;
  sender: string;
  seq: number;
}

export type ReactionState = Map<string, Map<string, Set<string>>>;

export interface ReactionSnapshot {
  asOfSeq: number;
  state: ReactionState;
  asOfByTarget?: ReadonlyMap<string, number>;
}

export interface ReactionChip {
  emoji: string;
  slugs: string[];
  mine: boolean;
}

export const EMPTY_SNAPSHOT: ReactionSnapshot = { asOfSeq: 0, state: new Map() };

export function reactionContent(target: string, emoji: string, add: boolean): ReactionContent {
  return { type: "reaction", target, emoji, op: add ? "add" : "remove" };
}

export function isReactionContent(content: unknown): content is ReactionContent {
  if (!content || typeof content !== "object") return false;
  const c = content as Record<string, unknown>;
  return (
    c.type === "reaction" &&
    typeof c.target === "string" &&
    typeof c.emoji === "string" &&
    (c.op === "add" || c.op === "remove")
  );
}

export function reactionFromStored(m: StoredMessage): ReactionEvent | null {
  if (m.content_type !== REACTION_CONTENT_TYPE || !isReactionContent(m.content) || !m.seq) return null;
  return { target: m.content.target, emoji: m.content.emoji, add: m.content.op === "add", sender: m.sender_slug, seq: m.seq };
}

export function reactionFromEnvelope(seq: number, envelope: unknown, channelId: string): ReactionEvent | null {
  if (!seq || !isPlaintextEnvelope(envelope as { type?: string })) return null;
  const payload = (envelope as { signed_payload?: { payload?: Record<string, unknown> } }).signed_payload?.payload;
  if (!payload || payload.channel_id !== channelId || payload.content_type !== REACTION_CONTENT_TYPE) return null;
  if (typeof payload.sender_slug !== "string" || !isReactionContent(payload.content)) return null;
  return {
    target: payload.content.target,
    emoji: payload.content.emoji,
    add: payload.content.op === "add",
    sender: payload.sender_slug,
    seq,
  };
}

export function setReaction(state: ReactionState, target: string, emoji: string, slug: string, add: boolean): void {
  let byEmoji = state.get(target);
  if (!byEmoji) {
    if (!add) return;
    byEmoji = new Map();
    state.set(target, byEmoji);
  }
  let slugs = byEmoji.get(emoji);
  if (!slugs) {
    if (!add) return;
    slugs = new Set();
    byEmoji.set(emoji, slugs);
  }
  if (add) slugs.add(slug);
  else slugs.delete(slug);
  if (slugs.size === 0) byEmoji.delete(emoji);
  if (byEmoji.size === 0) state.delete(target);
}

export function foldReactions(snapshot: ReactionSnapshot, events: readonly ReactionEvent[]): ReactionState {
  const state: ReactionState = new Map(
    [...snapshot.state].map(([target, byEmoji]) => [target, new Map([...byEmoji].map(([e, s]) => [e, new Set(s)]))]),
  );
  const asOf = (target: string) => snapshot.asOfByTarget?.get(target) ?? snapshot.asOfSeq;
  const fresh = events.filter((e) => e.seq > asOf(e.target)).sort((a, b) => a.seq - b.seq);
  for (const e of fresh) setReaction(state, e.target, e.emoji, e.sender, e.add);
  return state;
}

export function reactionChips(state: ReactionState, target: string, selfSlug: string | null): ReactionChip[] {
  const byEmoji = state.get(target);
  if (!byEmoji) return [];
  return [...byEmoji].map(([emoji, slugs]) => ({
    emoji,
    slugs: [...slugs],
    mine: selfSlug !== null && slugs.has(selfSlug),
  }));
}

interface StateResponse {
  as_of_seq: number;
  reactions: Record<string, { emoji: string; slugs: string[] }[]>;
}

export async function fetchReactionSnapshot(
  http: SignedHttp,
  spaceId: string,
  channelId: string,
  targets: readonly string[],
): Promise<ReactionSnapshot> {
  const state: ReactionState = new Map();
  const asOfByTarget = new Map<string, number>();
  const newest = [...new Set(targets)].slice(-QUERY_MAX_IDS);
  if (!newest.length) return { asOfSeq: 0, state, asOfByTarget };
  const res = await http.post<StateResponse>(`/v2/reactions/channel/${encodeURIComponent(channelId)}/query`, {
    space_id: spaceId,
    targets: newest,
  });
  for (const id of newest) asOfByTarget.set(id, res.as_of_seq);
  for (const [target, list] of Object.entries(res.reactions)) {
    for (const { emoji, slugs } of list) for (const slug of slugs) setReaction(state, target, emoji, slug, true);
  }
  return { asOfSeq: res.as_of_seq, state, asOfByTarget };
}

export function mergeReactionSnapshots(base: ReactionSnapshot, next: ReactionSnapshot): ReactionSnapshot {
  const state: ReactionState = new Map(base.state);
  const asOfByTarget = new Map(base.asOfByTarget ?? []);
  for (const [target, seq] of next.asOfByTarget ?? []) {
    asOfByTarget.set(target, seq);
    state.delete(target);
  }
  for (const [target, byEmoji] of next.state) state.set(target, byEmoji);
  const asOfSeq = base.state.size || base.asOfByTarget?.size ? Math.min(base.asOfSeq, next.asOfSeq) : next.asOfSeq;
  return { asOfSeq, state, asOfByTarget };
}
