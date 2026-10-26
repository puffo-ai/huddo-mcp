import { i18n } from "../i18n/i18n";

export const DAEMON_HEALTH_STATES = [
  "ok",
  "in_progress",
  "auth_failed",
  "api_error_abandoned",
  "provider_error",
  "server_unreachable",
  "mcp_unreachable",
  "no_progress",
  "runtime_stalled",
  "runtime_unresponsive",
  "refresh_broken",
  "unhandled_error",
  "codex_thread_wedged",
  "drained",
  "extra_usage_required",
  "unknown",
] as const;

export const HARD_BLOCKING_HEALTH_STATES = ["auth_failed", "refresh_broken", "extra_usage_required"] as const;

export const BLOCKING_HEALTH_LABELS: Readonly<Record<string, string>> = {
  auth_failed: "Auth error",
  refresh_broken: "Credential refresh failing",
  api_error_abandoned: "API errors — gave up",
  provider_error: "Model provider error",
  server_unreachable: "Server connection unavailable",
  mcp_unreachable: "Tool connection unavailable",
  no_progress: "Messages are not being processed",
  runtime_stalled: "No recent progress — check activity",
  runtime_unresponsive: "Runtime heartbeat missing",
  unhandled_error: "Crashed",
  codex_thread_wedged: "Session wedged",
  drained: "Quota unavailable",
  extra_usage_required: "Quota unavailable",
};

export function isBlockingHealth(health: string | null | undefined): boolean {
  return !!health && Object.prototype.hasOwnProperty.call(BLOCKING_HEALTH_LABELS, health);
}

export function isHardBlockingHealth(health: string | null | undefined): boolean {
  return !!health && (HARD_BLOCKING_HEALTH_STATES as readonly string[]).includes(health);
}

export function blockingHealthLabel(
  health: string | null | undefined,
): string | null {
  if (!health || !Object.prototype.hasOwnProperty.call(BLOCKING_HEALTH_LABELS, health)) {
    return null;
  }
  if (health === "drained" || health === "extra_usage_required") {
    return i18n.t("status.quotaUnavailable", { ns: "common" });
  }
  if (health === "provider_error" || health === "server_unreachable" ||
      health === "mcp_unreachable" || health === "no_progress" ||
      health === "runtime_stalled" || health === "runtime_unresponsive") {
    return i18n.t(`status.${health}`, { ns: "common" });
  }
  return BLOCKING_HEALTH_LABELS[health];
}

export function extraUsageHealthHint(health: string | null | undefined): string | null {
  return health === "extra_usage_required"
    ? i18n.t("status.extraUsageHint", { ns: "common" })
    : null;
}
