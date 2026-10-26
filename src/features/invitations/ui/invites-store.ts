import { useSyncExternalStore } from "react";
import { invitationProjection, leaseInvitationProjection, updateInvitationProjection, type InvitationProjection } from "../../../application/projections/invitation-projection";
import type { ProjectionOwner, ProjectionToken } from "../../../application/projections/owned-projection-store";
import type { PendingInvite } from "../domain";

export type InvitationOwnerToken = ProjectionToken;
interface InvitationActions {
  reset(): void;
}
export type InvitationState = InvitationProjection & InvitationActions & { ownerSlug: string | null; generation: number };

let activeToken: ProjectionToken | null = null;

function mergeRows(snapshot: PendingInvite[], overlay: Record<string, PendingInvite>, resolved: Record<string, true>): PendingInvite[] {
  const rows = new Map<string, PendingInvite>();
  for (const row of snapshot) if (!resolved[row.invitation_event_id]) rows.set(row.invitation_event_id, row);
  for (const row of Object.values(overlay)) if (!resolved[row.invitation_event_id]) rows.set(row.invitation_event_id, row);
  return [...rows.values()];
}

export function bindInvitationProjection(owner: ProjectionOwner): ProjectionToken {
  activeToken = leaseInvitationProjection(owner);
  return activeToken;
}

export function captureInvitationToken(owner: ProjectionOwner): ProjectionToken | null {
  if (!activeToken || !invitationProjection.accepts(activeToken)) return null;
  const current = activeToken.owner;
  return current.serverUrl === owner.serverUrl && current.slug === owner.slug && current.generation === owner.generation
    ? activeToken : null;
}

export function projectInvitation(token: ProjectionToken, kind: "incoming" | "sent", invite: PendingInvite): boolean {
  if (!invitationProjection.accepts(token)) return false;
  if (invitationProjection.getSnapshot().value.resolvedIds[invite.invitation_event_id]) return false;
  return updateInvitationProjection(token, (state) => {
    if (kind === "incoming") {
      const incomingOverlay = { ...state.incomingOverlay, [invite.invitation_event_id]: invite };
      return { ...state, incomingOverlay, pending: mergeRows(state.pending, incomingOverlay, state.resolvedIds) };
    }
    const sentOverlay = { ...state.sentOverlay, [invite.invitation_event_id]: invite };
    return { ...state, sentOverlay, sent: mergeRows(state.sent, sentOverlay, state.resolvedIds) };
  });
}

export function removeInvitation(token: ProjectionToken, id: string): boolean {
  return updateInvitationProjection(token, (state) => {
    const incomingOverlay = { ...state.incomingOverlay }; delete incomingOverlay[id];
    const sentOverlay = { ...state.sentOverlay }; delete sentOverlay[id];
    return { ...state, pending: state.pending.filter((row) => row.invitation_event_id !== id), sent: state.sent.filter((row) => row.invitation_event_id !== id), incomingOverlay, sentOverlay, resolvedIds: { ...state.resolvedIds, [id]: true } };
  });
}

const actions: InvitationActions = {
  reset: () => { activeToken = null; invitationProjection.clear(); },
};

let cachedProjection = invitationProjection.getSnapshot();
let cached: InvitationState = { ...cachedProjection.value, ...actions, ownerSlug: null, generation: 0 };
function snapshot(): InvitationState {
  const projection = invitationProjection.getSnapshot();
  if (projection !== cachedProjection) {
    cachedProjection = projection;
    cached = { ...projection.value, ...actions, ownerSlug: projection.owner?.slug ?? null, generation: projection.owner?.generation ?? 0 };
  }
  return cached;
}
function subscribe(listener: () => void) { return invitationProjection.subscribe(listener); }
type Hook = { <T>(selector: (state: InvitationState) => T): T; getState(): InvitationState; subscribe(listener: () => void): () => void };
export const useInvitesStore: Hook = Object.assign(
  function useInvitationSelector<T>(selector: (state: InvitationState) => T): T { return selector(useSyncExternalStore(subscribe, snapshot, snapshot)); },
  { getState: snapshot, subscribe },
);

export type { PendingInvite } from "../domain";
