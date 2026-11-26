import { CoreLeader, type RuntimeHandle, type SignedSend, type SocketLike } from "./leader";
import { CORE_LOCK, type Build, type Channel } from "./protocol";

export type HostConfig = Readonly<{
  apiUrl: string;
  namespace: string;
  syncIntervalMs?: number;
  pollMs?: number;
  clientLabel?: string;
}>;

export type HostStatus =
  | Readonly<{ type: "leading"; epoch: string }>
  | Readonly<{ type: "failed"; error: string }>
  | Readonly<{ type: "outdated" }>
  | Readonly<{ type: "stepped_down" }>;

/** How a Worker hands the runtime to a newer build (formal/app/BuildHandover.tla). */
export type HostHandover = Readonly<{
  build: Build;
  newestLed(): Promise<number>;
  recordLed(builtAt: number): Promise<void>;
  deployed(): Promise<Build | null>;
}>;

export type HostDeps = Readonly<{
  locks: { request(name: string, callback: () => Promise<void>): Promise<void> };
  loadRuntime(configJson: string): Promise<RuntimeHandle>;
  /** The runtime config; defaults to the web profile. */
  profile?(config: HostConfig): string;
  channel(): Channel;
  openSocket(url: string): SocketLike;
  send?: SignedSend;
  migrate?(payload: string): Promise<string>;
  signup?(payload: string, execute: (command: string) => string, query: (query: string) => string): Promise<string>;
  newEpoch(): string;
  every(ms: number, run: () => void): void;
  report(status: HostStatus): void;
  handover?: HostHandover;
}>;

export const HUDDO_SIGNS_EVERY_MESSAGE_WITHOUT_SEALING = true;

export function webProfile(config: HostConfig): string {
  return JSON.stringify({
    profile: "web",
    api_url: config.apiUrl,
    namespace: config.namespace,
    sync_interval_ms: config.syncIntervalMs ?? null,
    realtime: true,
    plaintext_messages: HUDDO_SIGNS_EVERY_MESSAGE_WITHOUT_SEALING,
  });
}

/**
 * Waits for the leader lock, then runs the runtime until the Worker ends or a newer build takes over. A Worker whose
 * build is older than one that has already led frees the lock without running the runtime.
 */
export function runCoreHost(config: HostConfig, deps: HostDeps): Promise<void> {
  const handover = deps.handover;
  const fail = (error: unknown) => deps.report({ type: "failed", error: error instanceof Error ? error.message : String(error) });
  return deps.locks.request(CORE_LOCK, async () => {
    let runtime: RuntimeHandle;
    try {
      if (handover) {
        if ((await handover.newestLed()) > handover.build.builtAt) {
          deps.report({ type: "outdated" });
          return;
        }
        // Recorded before the runtime opens the store, which a newer core may change.
        await handover.recordLed(handover.build.builtAt);
      }
      runtime = await deps.loadRuntime((deps.profile ?? webProfile)(config));
    } catch (error) {
      fail(error);
      return;
    }
    const epoch = deps.newEpoch();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let stopped = false;
    let deciding = false;
    const stepDown = async () => {
      if (!handover || stopped || deciding) return;
      deciding = true;
      const deployed = await handover.deployed();
      deciding = false;
      if (stopped || !deployed || deployed.builtAt <= handover.build.builtAt) return;
      stopped = true;
      leader.stop();
      deps.report({ type: "stepped_down" });
      release();
    };
    const leader = new CoreLeader(runtime, deps.channel(), {
      epoch,
      build: handover?.build,
      onStepDown: handover ? () => void stepDown() : undefined,
      openSocket: deps.openSocket,
      send: deps.send,
      apiUrl: config.apiUrl,
      migrate: deps.migrate,
      signup: deps.signup,
    });
    leader.start();
    deps.report({ type: "leading", epoch });
    deps.every(config.pollMs ?? 250, () => {
      if (!stopped) leader.tick();
    });
    return held;
  });
}
