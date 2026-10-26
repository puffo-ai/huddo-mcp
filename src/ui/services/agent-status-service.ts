import type { AgentStatusEntry } from "../../features/agents/domain/agent-runtime-status";
export type { AgentStatusEntry, ProcessingRunEntry } from "../../features/agents/domain/agent-runtime-status";
import { isBlockingHealth, isHardBlockingHealth } from "./agent-health";

export const OFFLINE_THRESHOLD_MS = 120_000;

export const STALE_PROCESSING_RUN_MS = 15 * 60_000;


export type EffectiveStatus = "idle" | "busy" | "error" | "paused" | "offline";

export function effectiveStatus(
  entry: AgentStatusEntry | null | undefined,
  nowMs: number,
): EffectiveStatus {
  if (!entry) return "offline";
  if (entry.status === "paused") return "paused";
  if (nowMs - entry.last_heartbeat_at > OFFLINE_THRESHOLD_MS) return "offline";
  if (isHardBlockingHealth(entry.health)) return "error";
  if (entry.status === "busy") return "busy";
  if (isBlockingHealth(entry.health)) return "error";
  if (entry.status === "error" || entry.status === "idle") {
    return entry.status;
  }
  return "offline";
}
