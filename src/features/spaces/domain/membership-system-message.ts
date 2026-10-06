import type { MessageWrite } from "../../messages/domain/message";
import { REDEEM_INVITE_CAPABILITY_KIND } from "../../invitations/domain/capability";

export const MEMBERSHIP_SYSTEM_CONTENT_TYPE = "system/membership";

export type MembershipAction = "joined" | "left" | "removed";

// Persisted content stays additive so older clients can ignore new fields.
export interface MembershipSystemContent {
  action: MembershipAction;
  actor_slug: string;
  kicker_slug?: string;
  inviter_slug?: string;
}

export function isMembershipSystemContent(
  contentType: string | null | undefined,
): boolean {
  return contentType === MEMBERSHIP_SYSTEM_CONTENT_TYPE;
}

export function parseMembershipSystemContent(
  content: unknown,
): MembershipSystemContent | null {
  if (content == null) return null;
  let parsed: unknown = content;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const c = parsed as Partial<MembershipSystemContent>;
  if (
    (c.action === "joined" || c.action === "left" || c.action === "removed")
    && typeof c.actor_slug === "string" && c.actor_slug.length > 0
  ) {
    const out: MembershipSystemContent = {
      action: c.action,
      actor_slug: c.actor_slug,
    };
    if (typeof c.kicker_slug === "string" && c.kicker_slug.length > 0) {
      out.kicker_slug = c.kicker_slug;
    }
    if (typeof c.inviter_slug === "string" && c.inviter_slug.length > 0) {
      out.inviter_slug = c.inviter_slug;
    }
    return out;
  }
  return null;
}

export interface SynthesizeArgs {
  channelId: string;
  spaceId: string | null;
  action: MembershipAction;
  actorSlug: string;
  kickerSlug?: string;
  inviterSlug?: string;
  now: number;
  // A stable event id lets reconnect replay deduplicate the synthetic message.
  eventId?: string;
}

export function buildMembershipSystemMessage(
  args: SynthesizeArgs,
): MessageWrite {
  const content: MembershipSystemContent = {
    action: args.action,
    actor_slug: args.actorSlug,
  };
  if (args.action === "removed" && args.kickerSlug) {
    content.kicker_slug = args.kickerSlug;
  }
  if (args.action === "joined" && args.inviterSlug) {
    content.inviter_slug = args.inviterSlug;
  }
  const envelopeIdSuffix = args.eventId ?? String(args.now);
  const envelopeId =
    `local-membership-${args.action}-${args.channelId}-`
    + `${args.actorSlug}-${envelopeIdSuffix}`;
  return {
    envelope_id: envelopeId,
    envelope_kind: "channel",
    sender_slug: "system",
    channel_id: args.channelId,
    space_id: args.spaceId,
    recipient_slug: null,
    content_type: MEMBERSHIP_SYSTEM_CONTENT_TYPE,
    content: JSON.stringify(content),
    sent_at: args.now,
    // MessageList requires a null root id for top-level system rows.
    thread_root_id: null,
    reply_to_id: null,
    is_visible_to_human: true,
  };
}

export type SynthesisPlan = {
  action: MembershipAction;
  actorSlug: string;
  kickerSlug?: string;
  inviterSlug?: string;
  now: number;
  eventId?: string;
  target:
    | { kind: "channel"; channelId: string; spaceId: string | null }
    | { kind: "space"; spaceId: string };
};

function extractInviterSlug(payload: Record<string, unknown>): string | undefined {
  const orig = payload.original_invite;
  if (!orig || typeof orig !== "object") return undefined;
  const slug = (orig as { signer_slug?: unknown }).signer_slug;
  return typeof slug === "string" && slug.length > 0 ? slug : undefined;
}

export function chooseMembershipSynthesis(
  evt: { kind?: string; signer_slug?: string; event_id?: string },
  payload: Record<string, unknown>,
  viewerSlug: string,
  now: number,
): SynthesisPlan | null {
  void viewerSlug;
  const common = { now, eventId: evt.event_id };
  if (evt.kind === "add_to_channel") {
    const actorSlug = payload.added_slug as string | undefined;
    const channelId = payload.channel_id as string | undefined;
    if (!actorSlug || !channelId) return null;
    const sourceRedemptionId = payload.source_redemption_id;
    return {
      ...common,
      eventId: typeof sourceRedemptionId === "string"
        && sourceRedemptionId.length > 0
        ? sourceRedemptionId
        : evt.event_id,
      action: "joined",
      actorSlug,
      target: {
        kind: "channel",
        channelId,
        spaceId: (payload.space_id as string | undefined) ?? null,
      },
    };
  }
  if (evt.kind === "accept_channel_invite" || evt.kind === "leave_channel") {
    const actorSlug = evt.signer_slug ?? "";
    if (!actorSlug) return null;
    const channelId = payload.channel_id as string | undefined;
    if (!channelId) return null;
    const spaceId = (payload.space_id as string | undefined) ?? null;
    const isAccept = evt.kind === "accept_channel_invite";
    return {
      ...common,
      action: isAccept ? "joined" : "left",
      actorSlug,
      inviterSlug: isAccept ? extractInviterSlug(payload) : undefined,
      target: { kind: "channel", channelId, spaceId },
    };
  }
  if (evt.kind === "remove_from_channel") {
    const actorSlug = (payload.removed_slug as string | undefined) ?? "";
    if (!actorSlug) return null;
    const channelId = payload.channel_id as string | undefined;
    if (!channelId) return null;
    const spaceId = (payload.space_id as string | undefined) ?? null;
    return {
      ...common,
      action: "removed",
      actorSlug,
      kickerSlug: evt.signer_slug ?? undefined,
      target: { kind: "channel", channelId, spaceId },
    };
  }
  if (evt.kind === "accept_space_invite" || evt.kind === "leave_space") {
    const actorSlug = evt.signer_slug ?? "";
    if (!actorSlug) return null;
    const spaceId = payload.space_id as string | undefined;
    if (!spaceId) return null;
    const isAccept = evt.kind === "accept_space_invite";
    return {
      ...common,
      action: isAccept ? "joined" : "left",
      actorSlug,
      inviterSlug: isAccept ? extractInviterSlug(payload) : undefined,
      target: { kind: "space", spaceId },
    };
  }
  if (evt.kind === "redeem_invite_capability") {
    const actorSlug = evt.signer_slug ?? "";
    if (!actorSlug) return null;
    const spaceId = payload.space_id as string | undefined;
    if (!spaceId) return null;
    return { ...common, action: "joined", actorSlug, target: { kind: "space", spaceId } };
  }
  if (evt.kind === "remove_from_space") {
    const actorSlug = (payload.removed_slug as string | undefined) ?? "";
    if (!actorSlug) return null;
    const spaceId = payload.space_id as string | undefined;
    if (!spaceId) return null;
    return {
      ...common,
      action: "removed",
      actorSlug,
      kickerSlug: evt.signer_slug ?? undefined,
      target: { kind: "space", spaceId },
    };
  }
  return null;
}

const EVENT_TIME_FIELDS = ["redeemed_at", "accepted_at", "issued_at", "effective_from"] as const;

export function membershipEventTime(payload: Record<string, unknown>, now: number): number {
  for (const field of EVENT_TIME_FIELDS) {
    const raw = payload[field];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) continue;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return Math.min(ms, now);
  }
  return now;
}

export function membershipRetryKey(
  evt: { kind?: string; event_id?: string },
  plan: SynthesisPlan,
): string | null {
  // DEDUP: redemption-level; channel-event-level.
  if (evt.kind === REDEEM_INVITE_CAPABILITY_KIND && plan.eventId) {
    return `${REDEEM_INVITE_CAPABILITY_KIND}:${plan.eventId}`;
  }
  if (evt.kind === "add_to_channel" && evt.event_id) {
    return `add_to_channel:${evt.event_id}`;
  }
  return null;
}

export interface MembershipRetryContext {
  retryKey: string | null;
  targetCount: number;
  waitingForGrantedChannels: boolean;
  waitingForAuthoritativeRosters: boolean;
  hasStore: boolean;
}

export function shouldRetryMembershipSynthesis(
  evt: { kind?: string },
  ctx: MembershipRetryContext,
): boolean {
  if (!ctx.retryKey) return false;
  if (evt.kind === REDEEM_INVITE_CAPABILITY_KIND) {
    return ctx.targetCount === 0
      || ctx.waitingForGrantedChannels
      || ctx.waitingForAuthoritativeRosters
      || !ctx.hasStore;
  }
  if (evt.kind === "add_to_channel") {
    return ctx.targetCount === 0 || !ctx.hasStore;
  }
  return false;
}
