import { handsOver, isNewer, thisBuild } from "./build-handover";
import { CoreForwarder, type ForwarderEvents } from "./forwarder";
import type { HostConfig, HostStatus } from "./host";
import { broadcastChannel, type Build, type CallKind, type CallOutcome, type Channel } from "./protocol";
import { currentWebClientLabel } from "../../../http/client-label";

export type CoreClient = Readonly<{
  call(kind: CallKind, payload: string): Promise<CallOutcome>;
  close(): void;
}>;

export type PageLifecycle = Readonly<{
  on(event: "freeze" | "resume", run: () => void): () => void;
}>;

export type CoreClientDeps = Readonly<{
  createWorker(): Worker;
  channel(): Channel & { close(): void };
  label?(): string;
  lifecycle?: PageLifecycle;
  /** This tab's build; without it the tab never hands over or reloads. */
  build?: Build;
  reload?(): void;
}>;

const documentLifecycle: PageLifecycle = {
  on(event, run) {
    if (typeof document === "undefined") return () => undefined;
    document.addEventListener(event, run);
    return () => document.removeEventListener(event, run);
  },
};

const browserDeps: CoreClientDeps = {
  createWorker: () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "huddo-core-runtime" }),
  channel: () => broadcastChannel(),
  label: currentWebClientLabel,
  lifecycle: documentLifecycle,
  build: thisBuild,
  reload: () => window.location.reload(),
};

/**
 * Every tab starts a Worker; the lock winner runs the runtime, calls always go through the channel. A tab the browser
 * freezes stops its Worker first, so a frozen leader never keeps the lock from the other tabs; it starts a new Worker
 * when it resumes.
 *
 * After a deploy (formal/app/BuildHandover.tla): a tab of a newer build asks an older leader to step down, and a tab
 * that sees a newer leader, or whose Worker stepped down or found a newer build, stops its Worker and reloads.
 */
export function startCoreClient(
  config: HostConfig,
  handlers: ForwarderEvents & { onStatus?(status: HostStatus): void } = {},
  deps: CoreClientDeps = browserDeps,
): CoreClient {
  const own = deps.build && handsOver(deps.build) ? deps.build : null;
  let retired = false;
  let worker: Worker | null = startWorker();
  const channel = deps.channel();
  const forwarder = new CoreForwarder(channel, {
    ...handlers,
    onLeader(epoch, build) {
      handlers.onLeader?.(epoch, build);
      if (!own || !build) return;
      if (isNewer(build, own)) retire();
      else if (isNewer(own, build)) channel.post({ type: "step_down" });
    },
  });
  const stopFreeze = deps.lifecycle?.on("freeze", () => {
    worker?.terminate();
    worker = null;
  });
  const stopResume = deps.lifecycle?.on("resume", () => {
    if (!retired) worker ??= startWorker();
    forwarder.rediscover();
  });
  return {
    async call(kind, payload) {
      const outcome = await forwarder.call(kind, payload);
      // An older leader's core does not know this tab's command: ask it again to check for a newer build.
      if (own && outcome.status === "done" && outcome.envelope.includes('"invalid_request"') && outcome.envelope.includes("unknown variant")) {
        channel.post({ type: "step_down" });
      }
      return outcome;
    },
    close() {
      stopFreeze?.();
      stopResume?.();
      forwarder.dispose();
      channel.close();
      worker?.terminate();
      worker = null;
    },
  };

  /** This tab never runs the runtime again: a newer build has it, or may have changed its store. */
  function retire(): void {
    if (retired) return;
    retired = true;
    worker?.terminate();
    worker = null;
    deps.reload?.();
  }

  function startWorker(): Worker {
    const next = deps.createWorker();
    let heard = false;
    next.onmessage = (event: MessageEvent<HostStatus>) => {
      heard = true;
      if (event.data.type === "outdated" || event.data.type === "stepped_down") retire();
      else handlers.onStatus?.(event.data);
    };
    // A Worker script that fails to load (an asset gone after a deploy, a blocked request) fires only this event.
    // Once the Worker has reported a status it is running, and its own failures arrive as statuses instead.
    next.onerror = (event: Event) => {
      if (heard) return;
      handlers.onStatus?.({ type: "failed", error: (event as ErrorEvent).message || "the runtime worker could not load" });
    };
    next.postMessage(deps.label ? { ...config, clientLabel: deps.label() } : config);
    return next;
  }
}
