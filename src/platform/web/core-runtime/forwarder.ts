import type { Build, CallKind, CallOutcome, Channel, ChannelMessage, CoreEvent } from "./protocol";

type Pending = {
  kind: CallKind;
  payload: string;
  posted: boolean;
  acceptedEpoch: string | null;
  timer: ReturnType<typeof setTimeout>;
  grace: ReturnType<typeof setTimeout> | null;
  resolve(outcome: CallOutcome): void;
};

export type ForwarderEvents = Readonly<{
  onEvents?(epoch: string, events: readonly CoreEvent[], truncated: boolean): void;
  onLeader?(epoch: string, build?: Build): void;
}>;

export type ForwarderTiming = Readonly<{
  timeoutMs(kind: CallKind): number;
  graceMs: number;
}>;

export const CALL_TIMEOUT_MS = 60_000;
export const MIGRATE_TIMEOUT_MS = 180_000;
export const LEADER_CHANGE_GRACE_MS = 3_000;

const defaultTiming: ForwarderTiming = {
  timeoutMs: (kind) => (kind === "migrate" || kind === "signup" ? MIGRATE_TIMEOUT_MS : CALL_TIMEOUT_MS),
  graceMs: LEADER_CHANGE_GRACE_MS,
};

/** Tab side of formal/app/TabLeader.tla (Mode = "hold"): a call is posted once a leader is known and never resent, except queries. */
export class CoreForwarder {
  private readonly pending = new Map<string, Pending>();
  private epoch: string | null = null;
  private readonly stop: () => void;

  constructor(
    private readonly channel: Channel,
    private readonly handlers: ForwarderEvents = {},
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly timing: ForwarderTiming = defaultTiming,
  ) {
    this.stop = channel.listen((message) => this.receive(message));
    channel.post({ type: "hello" });
  }

  get leaderEpoch(): string | null {
    return this.epoch;
  }

  call(kind: CallKind, payload: string): Promise<CallOutcome> {
    const id = this.newId();
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(id, { status: "unknown", reason: "timed_out" }), this.timing.timeoutMs(kind));
      const call: Pending = { kind, payload, posted: false, acceptedEpoch: null, timer, grace: null, resolve };
      this.pending.set(id, call);
      if (this.epoch !== null) this.post(id, call);
    });
  }

  /** Asks the leader to say who it is again, after this tab missed the channel (it was frozen). */
  rediscover(): void {
    this.channel.post({ type: "hello" });
  }

  dispose(): void {
    this.stop();
    for (const id of [...this.pending.keys()]) this.settle(id, { status: "unknown", reason: "closed" });
  }

  private post(id: string, call: Pending): void {
    call.posted = true;
    call.acceptedEpoch = null;
    this.channel.post({ type: "call", id, kind: call.kind, payload: call.payload });
  }

  private settle(id: string, outcome: CallOutcome): void {
    const call = this.pending.get(id);
    if (!call) return;
    this.pending.delete(id);
    clearTimeout(call.timer);
    if (call.grace) clearTimeout(call.grace);
    call.resolve(outcome);
  }

  private receive(message: ChannelMessage): void {
    switch (message.type) {
      case "leader":
        this.leaderChanged(message.epoch, message.build);
        break;
      case "accepted": {
        const call = this.pending.get(message.id);
        if (!call) break;
        call.acceptedEpoch = message.epoch;
        if (message.epoch === this.epoch && call.grace) {
          clearTimeout(call.grace);
          call.grace = null;
        }
        break;
      }
      case "result":
        this.settle(message.id, { status: "done", envelope: message.envelope });
        break;
      case "events":
        if (message.epoch === this.epoch) this.handlers.onEvents?.(message.epoch, message.events, message.truncated);
        break;
      default:
        break;
    }
  }

  private leaderChanged(epoch: string, build?: Build): void {
    if (epoch === this.epoch) return;
    this.epoch = epoch;
    for (const [id, call] of this.pending) {
      if (!call.posted || (call.kind === "query" && call.acceptedEpoch !== epoch)) {
        this.post(id, call);
      } else if (call.acceptedEpoch !== epoch && !call.grace) {
        call.grace = setTimeout(() => this.settle(id, { status: "unknown", reason: "leader_changed" }), this.timing.graceMs);
      }
    }
    this.handlers.onLeader?.(epoch, build);
  }
}
