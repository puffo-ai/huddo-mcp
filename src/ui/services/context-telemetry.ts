export interface ContextRuntime {
  maxContext: number;
  thresholdPct: number | null;
}

export interface ContextTelemetry extends ContextRuntime {
  currentContext: number;
  autoCompactThreshold: number | null;
  usedPct: number;
}

export const AUTOCOMPACT_ENV_KEY = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE";
const MIN_CONTEXT_WINDOW = 100_000;
const MAX_CONTEXT_WINDOW = 1_000_000;

export const AUTOCOMPACT_BANDS: readonly { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "75%", value: "75" },
  { label: "50%", value: "50" },
  { label: "30%", value: "30" },
];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function asCurrentContext(payload: Record<string, unknown>): number | null {
  const current = num(payload.current_context);
  return current === null || !Number.isInteger(current) || current < 0 ? null : current;
}

export function currentContextFromStatusEvent(
  event: string,
  payload: Record<string, unknown>,
): number | null {
  if (event !== "turn_complete") return null;
  return asCurrentContext(payload);
}

export function contextRuntime(
  maxContext: unknown,
  thresholdPct: unknown,
): ContextRuntime | null {
  const max = num(maxContext);
  const thresholdMissing = thresholdPct === null || thresholdPct === undefined;
  const threshold = thresholdMissing ? null : num(thresholdPct);
  if (
    max === null
    || !Number.isInteger(max)
    || max < MIN_CONTEXT_WINDOW
    || max > MAX_CONTEXT_WINDOW
    || (!thresholdMissing && threshold === null)
    || (threshold !== null && (threshold <= 0 || threshold > 100))
  ) {
    return null;
  }
  return { maxContext: max, thresholdPct: threshold };
}

export function combineContextTelemetry(
  runtime: ContextRuntime | null,
  currentContext: number | null | undefined,
): ContextTelemetry | null {
  if (!runtime || currentContext === null || currentContext === undefined) return null;
  return {
    ...runtime,
    currentContext,
    autoCompactThreshold: runtime.thresholdPct === null
      ? null
      : Math.floor(runtime.maxContext * runtime.thresholdPct / 100),
    usedPct: currentContext / runtime.maxContext * 100,
  };
}

export function bandValueFromRuntime(runtime: ContextRuntime | null | undefined): string {
  if (!runtime || runtime.thresholdPct === null) return "";
  const exact = String(Math.round(runtime.thresholdPct));
  return AUTOCOMPACT_BANDS.some((band) => band.value === exact) ? exact : "";
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)));
  return `${Math.round(n / 1000)}K`;
}
