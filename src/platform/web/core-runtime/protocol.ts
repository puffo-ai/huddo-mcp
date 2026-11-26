export const CORE_CHANNEL = "huddo-core-runtime";
export const CORE_LOCK = "huddo-core-runtime-leader";

export type CallKind = "execute" | "query" | "request" | "migrate" | "signup";

export type CoreEvent = Readonly<{ seq: number; at_ms: number; type: string } & Record<string, unknown>>;

/** A bundle's version and build time (ms); builds are ordered by build time. */
export type Build = Readonly<{ version: string; builtAt: number }>;

export type ChannelMessage =
  | Readonly<{ type: "call"; id: string; kind: CallKind; payload: string }>
  | Readonly<{ type: "accepted"; id: string; epoch: string }>
  | Readonly<{ type: "result"; id: string; epoch: string; envelope: string }>
  | Readonly<{ type: "leader"; epoch: string; build?: Build }>
  | Readonly<{ type: "events"; epoch: string; events: readonly CoreEvent[]; truncated: boolean }>
  | Readonly<{ type: "hello" }>
  | Readonly<{ type: "step_down" }>;

export type CallOutcome =
  | Readonly<{ status: "done"; envelope: string }>
  | Readonly<{ status: "unknown"; reason: UnknownReason }>;

export type UnknownReason = "leader_changed" | "timed_out" | "closed";

const UNKNOWN_WHY: Record<UnknownReason, string> = {
  leader_changed: "after a leader change",
  timed_out: "after the call timed out",
  closed: "after the runtime closed",
};

/** A call whose result never came back; the reason says whether repeating it can help. */
export class UnknownOutcomeError extends Error {
  constructor(
    what: string,
    readonly reason: UnknownReason,
  ) {
    super(`${what} outcome unknown ${UNKNOWN_WHY[reason]}`);
    // Screens can't import this class, so they recognise it by name (src/huddo/error-text.ts).
    this.name = "UnknownOutcomeError";
  }
}

export function unknownOutcome(what: string, outcome: Readonly<{ reason: UnknownReason }>): Error {
  return new UnknownOutcomeError(what, outcome.reason);
}

export const lostToLeaderChange = (error: unknown): boolean => error instanceof UnknownOutcomeError && error.reason === "leader_changed";

export type Channel = Readonly<{
  post(message: ChannelMessage): void;
  listen(handler: (message: ChannelMessage) => void): () => void;
}>;

export function broadcastChannel(name = CORE_CHANNEL): Channel & { close(): void } {
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => channel.postMessage(message),
    listen(handler) {
      const listener = (event: MessageEvent<ChannelMessage>) => handler(event.data);
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
    close: () => channel.close(),
  };
}
