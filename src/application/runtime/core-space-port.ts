export type CoreSpaceEvent = Readonly<{ kind: string; payload: Record<string, unknown> }>;

export type CoreEventSigner = Readonly<{
  slug: string;
  deviceId: string;
  subkeyId: string;
  sign(kind: string, payload: Record<string, unknown>): Promise<CoreSignedEvent>;
}>;

export type CoreSignedEvent = {
  type: "signed_event";
  version: 1;
  event_id: string;
  kind: string;
  payload: Record<string, unknown>;
  signer_slug: string;
  signer_device_id: string;
  signer_subkey_id: string;
  signature: string;
};

export type CoreSpaceEvents = Readonly<{
  /** `betaCode` is the room invite code; core sends it as a header, never inside an event. */
  submit(
    events: readonly CoreSpaceEvent[],
    isEncrypted?: boolean,
    betaCode?: string,
  ): Promise<{ server_emitted_events: CoreSpaceEvent[] }>;
  signer(): Promise<CoreEventSigner>;
}>;

let installed: CoreSpaceEvents | null = null;
const waiters = new Set<(port: CoreSpaceEvents) => void>();

export function installCoreSpaceEvents(port: CoreSpaceEvents | null): void {
  installed = port;
  if (port) for (const waiter of [...waiters]) waiter(port);
}

export function coreSpaceEvents(): CoreSpaceEvents | null {
  return installed;
}

export function awaitCoreSpaceEvents(timeoutMs = 30_000): Promise<CoreSpaceEvents> {
  if (installed) return Promise.resolve(installed);
  return new Promise((resolve, reject) => {
    const ready = (port: CoreSpaceEvents) => {
      clearTimeout(timer);
      waiters.delete(ready);
      resolve(port);
    };
    const timer = setTimeout(() => {
      waiters.delete(ready);
      reject(new Error("The core runtime did not start. Reload the page and try again."));
    }, timeoutMs);
    waiters.add(ready);
  });
}
