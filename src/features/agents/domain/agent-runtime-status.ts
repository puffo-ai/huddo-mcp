export interface AgentStatusEntry {
  agent_slug: string;
  status: string;
  profile_source?: "lingtai" | null;
  current_message_id?: string | null;
  activity?: string | null;
  error_text?: string | null;
  health?: string | null;
  last_heartbeat_at: number;
}

export interface ProcessingRunEntry {
  run_id: string;
  message_id: string;
  agent_slug: string;
  started_at: number;
  ended_at?: number | null;
  succeeded?: boolean | null;
  error_text?: string | null;
}

export function decodeAgentStatusEntry(value: unknown): AgentStatusEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.agent_slug !== "string" || !entry.agent_slug
    || typeof entry.status !== "string" || !entry.status
    || typeof entry.last_heartbeat_at !== "number"
    || !Number.isFinite(entry.last_heartbeat_at)) return null;
  return {
    ...(entry.runtime !== undefined ? {
      profile_source: entry.runtime && typeof entry.runtime === "object" && !Array.isArray(entry.runtime)
        && (entry.runtime as Record<string, unknown>).profile_source === "lingtai" ? "lingtai" as const : null,
    } : {}),
    agent_slug: entry.agent_slug,
    status: entry.status,
    current_message_id: typeof entry.current_message_id === "string" ? entry.current_message_id : null,
    activity: typeof entry.activity === "string" ? entry.activity : null,
    error_text: typeof entry.error_text === "string" ? entry.error_text : null,
    last_heartbeat_at: entry.last_heartbeat_at,
    ...(typeof entry.health === "string" || entry.health === null ? { health: entry.health } : {}),
  };
}

export function mergeAgentStatusEntry(
  previous: AgentStatusEntry | undefined,
  incoming: AgentStatusEntry,
): AgentStatusEntry {
  if (previous && previous.last_heartbeat_at > incoming.last_heartbeat_at) return previous;
  if (incoming.profile_source === undefined && previous?.profile_source !== undefined) {
    incoming = { ...incoming, profile_source: previous.profile_source };
  }
  if (incoming.health === undefined && previous?.health !== undefined) {
    return { ...incoming, health: previous.health };
  }
  return incoming;
}
