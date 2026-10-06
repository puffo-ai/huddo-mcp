import { chooseMembershipSynthesis, membershipEventTime } from "../src/features/spaces/domain/membership-system-message";
import type { Room } from "./home";
import type { Row } from "./rows";

interface SpaceEvent {
  event_id: string;
  kind: string;
  signer_slug: string;
  payload: Record<string, unknown>;
}

interface SpaceEventsPage {
  events?: SpaceEvent[];
  next_cursor?: string | null;
  has_more?: boolean;
}

interface SpacePair {
  agent: string;
  operator: string;
  at: number;
}

interface Getter {
  get<T = unknown>(path: string): Promise<T>;
}

export interface SystemCursor {
  events?: string;
  pairs?: number;
}

const SPACE_KINDS = new Set(["redeem_invite_capability", "accept_space_invite", "leave_space", "remove_from_space"]);
const MAX_PAGES = 50;

export function membershipRow(evt: SpaceEvent): Row | null {
  if (!SPACE_KINDS.has(evt.kind)) return null;
  const plan = chooseMembershipSynthesis(evt, evt.payload ?? {}, "", Date.now());
  if (!plan) return null;
  const action = plan.action === "removed" ? "was removed" : plan.action;
  return {
    seq: 0,
    id: `event:${evt.event_id}`,
    sender: plan.actorSlug,
    sentAt: membershipEventTime(evt.payload ?? {}, Date.now()),
    text: "",
    attachments: [],
    replyTo: null,
    system: { action, actor: plan.actorSlug },
  };
}

export function pairRow(pair: SpacePair): Row {
  return {
    seq: 0,
    id: `pair:${pair.agent}:${pair.at}`,
    sender: pair.agent,
    sentAt: pair.at,
    text: "",
    attachments: [],
    replyTo: null,
    system: { action: "was paired with", actor: pair.agent, target: pair.operator },
  };
}

async function fetchEvents(http: Getter, room: Room, since?: string) {
  const rows: Row[] = [];
  let cursor = since || undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = `limit=500${cursor ? `&since=${encodeURIComponent(cursor)}` : ""}`;
    const resp = await http.get<SpaceEventsPage>(`/spaces/${encodeURIComponent(room.spaceId)}/events?${query}`);
    for (const evt of resp.events ?? []) {
      const row = membershipRow(evt);
      if (row) rows.push(row);
    }
    cursor = resp.next_cursor ?? cursor;
    if (!resp.has_more) break;
  }
  return { rows, cursor };
}

async function fetchPairs(http: Getter, room: Room, since = 0) {
  const resp = await http
    .get<{ pairs?: SpacePair[] }>(`/v2/pairings/space/${encodeURIComponent(room.spaceId)}?since=${since}`)
    .catch(() => ({ pairs: [] as SpacePair[] }));
  const pairs = resp.pairs ?? [];
  return { rows: pairs.map(pairRow), cursor: pairs.reduce((max, p) => Math.max(max, p.at), since) };
}

export async function fetchSystemRows(
  http: Getter,
  room: Room,
  since?: SystemCursor,
): Promise<{ rows: Row[]; cursor: SystemCursor }> {
  const [events, pairs] = await Promise.all([fetchEvents(http, room, since?.events), fetchPairs(http, room, since?.pairs)]);
  return {
    rows: mergeByTime(events.rows, pairs.rows),
    cursor: { events: events.cursor, pairs: pairs.cursor },
  };
}

export function sameCursor(a: SystemCursor | undefined, b: SystemCursor | undefined): boolean {
  return (a?.events ?? "") === (b?.events ?? "") && (a?.pairs ?? 0) === (b?.pairs ?? 0);
}

export function mergeByTime(messages: Row[], system: Row[]): Row[] {
  if (!system.length) return messages;
  const ordered = [...messages].sort((a, b) => a.seq - b.seq || a.sentAt - b.sentAt);
  const events = [...system].sort((a, b) => a.sentAt - b.sentAt);
  const out: Row[] = [];
  let i = 0;
  for (const row of ordered) {
    while (i < events.length && events[i].sentAt < row.sentAt) out.push(events[i++]);
    out.push(row);
  }
  return out.concat(events.slice(i));
}
