import { mergeAgentStatusEntry } from "../../features/agents/domain/agent-runtime-status";
import type { AgentStatusEntry, ProcessingRunEntry } from "../../features/agents/domain/agent-runtime-status";
import { OwnedProjectionStore, type ProjectionOwner, type ProjectionToken } from "./owned-projection-store";

export interface AgentIntegrationProjection {
  statuses: Record<string, AgentStatusEntry>;
  runsByMessage: Record<string, Record<string, ProcessingRunEntry>>;
  loadedMessageIds: Set<string>;
  currentContextBySlug: Record<string, number>;
}

const emptyAgentIntegrationProjection = (): AgentIntegrationProjection => ({
  statuses: {}, runsByMessage: {}, loadedMessageIds: new Set<string>(), currentContextBySlug: {},
});

export const agentIntegrationProjection = new OwnedProjectionStore<AgentIntegrationProjection>(emptyAgentIntegrationProjection);

function sameStatus(left: AgentStatusEntry | undefined, right: AgentStatusEntry): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left) as Array<keyof AgentStatusEntry>;
  const rightKeys = Object.keys(right) as Array<keyof AgentStatusEntry>;
  return leftKeys.length === rightKeys.length && rightKeys.every((key) => left[key] === right[key]);
}

function sameRun(left: ProcessingRunEntry | undefined, right: ProcessingRunEntry): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left) as Array<keyof ProcessingRunEntry>;
  const rightKeys = Object.keys(right) as Array<keyof ProcessingRunEntry>;
  return leftKeys.length === rightKeys.length && rightKeys.every((key) => left[key] === right[key]);
}

export function leaseAgentIntegrationProjection(owner: ProjectionOwner): ProjectionToken {
  return agentIntegrationProjection.lease(owner);
}

export function setProjectedAgentStatuses(token: ProjectionToken, entries: AgentStatusEntry[]): boolean {
  return agentIntegrationProjection.update(token, (state) => {
    let statuses = state.statuses;
    for (const entry of entries) {
      const current = statuses[entry.agent_slug];
      const next = mergeAgentStatusEntry(current, entry);
      if (next === current || sameStatus(current, next)) continue;
      if (statuses === state.statuses) statuses = { ...statuses };
      statuses[entry.agent_slug] = next;
    }
    return statuses === state.statuses ? state : { ...state, statuses };
  });
}

export function upsertProjectedAgentStatus(token: ProjectionToken, entry: AgentStatusEntry): boolean {
  return agentIntegrationProjection.update(token, (state) => {
    const current = state.statuses[entry.agent_slug];
    const next = mergeAgentStatusEntry(current, entry);
    return next === current || sameStatus(current, next) ? state : { ...state, statuses: { ...state.statuses, [entry.agent_slug]: next } };
  });
}

export function setProjectedRunsForMessages(token: ProjectionToken, messageIds: string[], runs: ProcessingRunEntry[]): boolean {
  return agentIntegrationProjection.update(token, (state) => {
    const nextBuckets = new Map<string, Record<string, ProcessingRunEntry>>();
    for (const id of messageIds) nextBuckets.set(id, {});
    for (const run of runs) {
      if (!nextBuckets.has(run.message_id)) continue;
      const bucket = nextBuckets.get(run.message_id)!;
      bucket[run.run_id] = run;
    }
    let runsChanged = false;
    const runsByMessage = { ...state.runsByMessage };
    for (const id of messageIds) {
      const current = state.runsByMessage[id] ?? {};
      const next = nextBuckets.get(id) ?? {};
      const currentIds = Object.keys(current);
      const nextIds = Object.keys(next);
      const same = currentIds.length === nextIds.length && nextIds.every((runId) => sameRun(current[runId], next[runId]));
      if (!same) { runsByMessage[id] = next; runsChanged = true; }
    }
    const newlyLoaded = messageIds.filter((id) => !state.loadedMessageIds.has(id));
    if (!runsChanged && newlyLoaded.length === 0) return state;
    const loadedMessageIds = newlyLoaded.length === 0 ? state.loadedMessageIds : new Set(state.loadedMessageIds);
    for (const id of newlyLoaded) loadedMessageIds.add(id);
    return { ...state, runsByMessage: runsChanged ? runsByMessage : state.runsByMessage, loadedMessageIds };
  });
}

export function upsertProjectedRun(token: ProjectionToken, run: ProcessingRunEntry): boolean {
  return agentIntegrationProjection.update(token, (state) => {
    const bucket = state.runsByMessage[run.message_id] ?? {};
    if (sameRun(bucket[run.run_id], run)) return state;
    return { ...state, runsByMessage: { ...state.runsByMessage, [run.message_id]: { ...bucket, [run.run_id]: run } } };
  });
}

export function setProjectedCurrentContext(token: ProjectionToken, agentSlug: string, currentContext: number): boolean {
  return agentIntegrationProjection.update(token, (state) => state.currentContextBySlug[agentSlug] === currentContext
    ? state
    : { ...state, currentContextBySlug: { ...state.currentContextBySlug, [agentSlug]: currentContext } });
}

export function clearProjectedCurrentContext(token: ProjectionToken, agentSlug: string): boolean {
  return agentIntegrationProjection.update(token, (state) => {
    if (!(agentSlug in state.currentContextBySlug)) return state;
    const currentContextBySlug = { ...state.currentContextBySlug };
    delete currentContextBySlug[agentSlug];
    return { ...state, currentContextBySlug };
  });
}
