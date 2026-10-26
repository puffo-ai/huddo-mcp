import { useSyncExternalStore } from "react";
import {
  agentIntegrationProjection, clearProjectedCurrentContext, leaseAgentIntegrationProjection,
  setProjectedAgentStatuses, setProjectedCurrentContext, setProjectedRunsForMessages,
  upsertProjectedAgentStatus, upsertProjectedRun, type AgentIntegrationProjection,
} from "../../application/projections/agent-integration-projection";
import type { ProjectionOwner, ProjectionToken } from "../../application/projections/owned-projection-store";
import { STALE_PROCESSING_RUN_MS, type AgentStatusEntry, type ProcessingRunEntry } from "../services/agent-status-service";

export type AgentIntegrationOwnerToken = ProjectionToken;
interface AgentIntegrationActions {
  setStatuses(entries: AgentStatusEntry[]): boolean;
  setCurrentContext(agentSlug: string, currentContext: number): boolean;
  clearCurrentContext(agentSlug: string): boolean;
  upsertStatus(entry: AgentStatusEntry): boolean;
  setRunsForMessages(messageIds: string[], runs: ProcessingRunEntry[]): boolean;
  upsertRun(run: ProcessingRunEntry): boolean;
  reset(): void;
}
export type AgentIntegrationState = AgentIntegrationProjection & AgentIntegrationActions;

let activeToken: ProjectionToken | null = null;
export function bindAgentIntegrationProjection(owner: ProjectionOwner): ProjectionToken {
  activeToken = leaseAgentIntegrationProjection(owner);
  return activeToken;
}
export function captureAgentIntegrationToken(owner: ProjectionOwner): ProjectionToken | null {
  if (!activeToken || !agentIntegrationProjection.accepts(activeToken)) return null;
  const current = activeToken.owner;
  return current.serverUrl === owner.serverUrl && current.slug === owner.slug && current.generation === owner.generation ? activeToken : null;
}
export function currentAgentIntegrationToken(): ProjectionToken | null {
  return activeToken && agentIntegrationProjection.accepts(activeToken) ? activeToken : null;
}
export function assertAgentIntegrationToken(token: ProjectionToken): void {
  if (!agentIntegrationProjection.accepts(token)) throw new Error("stale agent integration projection owner");
}
export function watchAgentIntegrationToken(token: ProjectionToken, onInvalidated: () => void): () => void {
  const check = () => { if (!agentIntegrationProjection.accepts(token)) onInvalidated(); };
  const unsubscribe = agentIntegrationProjection.subscribeAuthority(check);
  check();
  return unsubscribe;
}
export function releaseAgentIntegrationProjection(token: ProjectionToken): boolean {
  const released = agentIntegrationProjection.release(token);
  if (released && activeToken === token) activeToken = null;
  return released;
}
function withTestToken(write: (token: ProjectionToken) => boolean): boolean {
  if (process.env.NODE_ENV !== "test") throw new Error("ambient agent integration writer is test-only");
  return activeToken ? write(activeToken) : false;
}
const actions: AgentIntegrationActions = {
  setStatuses: (entries) => withTestToken((token) => setProjectedAgentStatuses(token, entries)),
  setCurrentContext: (slug, value) => withTestToken((token) => setProjectedCurrentContext(token, slug, value)),
  clearCurrentContext: (slug) => withTestToken((token) => clearProjectedCurrentContext(token, slug)),
  upsertStatus: (entry) => withTestToken((token) => upsertProjectedAgentStatus(token, entry)),
  setRunsForMessages: (ids, runs) => withTestToken((token) => setProjectedRunsForMessages(token, ids, runs)),
  upsertRun: (run) => withTestToken((token) => upsertProjectedRun(token, run)),
  reset: () => {
    if (process.env.NODE_ENV !== "test") throw new Error("agent integration reset is test-only");
    activeToken = null;
    agentIntegrationProjection.clear();
    if (process.env.NODE_ENV === "test") {
      activeToken = leaseAgentIntegrationProjection({ serverUrl: "test://agent-integration", slug: "test", generation: 1 });
    }
  },
};

let cachedProjection = agentIntegrationProjection.getSnapshot();
let cached: AgentIntegrationState = { ...cachedProjection.value, ...actions };
function snapshot(): AgentIntegrationState {
  const projection = agentIntegrationProjection.getSnapshot();
  if (projection !== cachedProjection) { cachedProjection = projection; cached = { ...projection.value, ...actions }; }
  return cached;
}
type Hook = {
  <T>(selector: (state: AgentIntegrationState) => T): T;
  getState(): AgentIntegrationState;
  subscribe(listener: () => void): () => void;
  setState(patch: Partial<AgentIntegrationProjection> | ((state: AgentIntegrationState) => Partial<AgentIntegrationProjection>)): void;
};
function setTestState(patch: Partial<AgentIntegrationProjection> | ((state: AgentIntegrationState) => Partial<AgentIntegrationProjection>)): void {
  if (process.env.NODE_ENV !== "test") throw new Error("agent integration projection test writer is unavailable");
  if (!activeToken) activeToken = leaseAgentIntegrationProjection({ serverUrl: "test://agent-integration", slug: "test", generation: 1 });
  const token = activeToken;
  agentIntegrationProjection.update(token, (state) => ({ ...state, ...(typeof patch === "function" ? patch(snapshot()) : patch) }));
}
export const useAgentIntegrationStore: Hook = Object.assign(
  function useAgentIntegrationSelector<T>(selector: (state: AgentIntegrationState) => T): T {
    return selector(useSyncExternalStore(agentIntegrationProjection.subscribe, snapshot, snapshot));
  },
  { getState: snapshot, subscribe: agentIntegrationProjection.subscribe, setState: setTestState },
);

export function selectRunsForMessage(state: AgentIntegrationState, messageId: string): ProcessingRunEntry[] {
  const bucket = state.runsByMessage[messageId];
  if (!bucket) return [];
  return Object.values(bucket).sort((a, b) => a.started_at - b.started_at);
}
export function isProcessingRunActive(run: ProcessingRunEntry, statuses: Record<string, AgentStatusEntry>, nowMs: number = Date.now()): boolean {
  if (run.ended_at != null || nowMs - run.started_at > STALE_PROCESSING_RUN_MS) return false;
  const status = statuses[run.agent_slug];
  return status?.status === "busy" && status.current_message_id === run.message_id;
}
export { clearProjectedCurrentContext, setProjectedAgentStatuses, setProjectedCurrentContext, setProjectedRunsForMessages, upsertProjectedAgentStatus, upsertProjectedRun };
