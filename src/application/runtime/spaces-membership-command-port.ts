import type { PuffoHttpClient } from "../../http/client";
import {
  postSpaceEvents,
  type PostSpaceEventsResponse,
  type SignedSpaceEvent,
} from "../../event/signed-space-event";

export interface SpacesMembershipCommandPort {
  submit(
    http: PuffoHttpClient,
    spaceId: string,
    events: SignedSpaceEvent[],
    options?: { isEncrypted?: boolean },
  ): Promise<PostSpaceEventsResponse>;
  dispose(): void;
}

let installed: SpacesMembershipCommandPort | null = null;

export function installSpacesMembershipCommandPort(port: SpacesMembershipCommandPort): void {
  if (installed) throw new Error("spaces/membership authority already installed");
  installed = port;
}

export function createTypeScriptSpacesMembershipCommandPort(): SpacesMembershipCommandPort {
  return {
    submit: postSpaceEvents,
    dispose() {},
  };
}

export async function submitSpacesMembershipEvents(
  http: PuffoHttpClient,
  spaceId: string,
  events: SignedSpaceEvent[],
  options?: { isEncrypted?: boolean },
): Promise<PostSpaceEventsResponse> {
  if (!installed && import.meta.env.MODE === "test") {
    installed = createTypeScriptSpacesMembershipCommandPort();
  }
  if (!installed) throw new Error("spaces/membership authority is not installed");
  return installed.submit(http, spaceId, events, options);
}

export function resetSpacesMembershipCommandPortForTests(): void {
  installed?.dispose();
  installed = null;
}
