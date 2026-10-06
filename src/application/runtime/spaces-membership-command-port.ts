import type { PuffoHttpClient } from "../../http/client";
import {
  postSpaceEvents,
  type PostSpaceEventsResponse,
  type SignedSpaceEvent,
} from "../../event/signed-space-event";
import type { MessageRepository } from "../../features/messages/application/message-repository";
import {
  adaptMessageStoreForSpacesMembership,
  createRustSpacesMembershipPort,
  type RustSpacesMembershipPort,
  type SpacesMembershipMutation,
} from "./spaces-membership-rust-adapter";

export interface SpacesMembershipCommandPort {
  readonly authority: "typescript" | "rust";
  submit(
    http: PuffoHttpClient,
    spaceId: string,
    events: SignedSpaceEvent[],
    options?: { isEncrypted?: boolean },
  ): Promise<PostSpaceEventsResponse>;
  advanceGeneration(next: string): void;
  dispose(): void;
}

export class SpacesMembershipStaleOwnerError extends Error {
  readonly code = "stale_owner";

  constructor() {
    super("spaces/membership session owner changed");
    this.name = "SpacesMembershipStaleOwnerError";
  }
}

let installed: SpacesMembershipCommandPort | null = null;

export function installSpacesMembershipCommandPort(port: SpacesMembershipCommandPort): void {
  if (installed) throw new Error("spaces/membership authority already installed");
  installed = port;
}

export function createTypeScriptSpacesMembershipCommandPort(): SpacesMembershipCommandPort {
  return {
    authority: "typescript",
    submit: postSpaceEvents,
    advanceGeneration() {},
    dispose() {},
  };
}

export function advanceSpacesMembershipGeneration(next: number): void {
  installed?.advanceGeneration(String(next));
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

export async function createRustSpacesMembershipCommandPort(
  repository: MessageRepository,
  runtimeId = "spaces-membership",
  generation = "1",
): Promise<SpacesMembershipCommandPort> {
  const pendingHttp = new Map<string, PuffoHttpClient>();
  const pendingOwner = new Map<string, string>();
  let activeGeneration = generation;
  let desiredGeneration = generation;
  let pending = 0;
  let tail = Promise.resolve();
  let rust!: RustSpacesMembershipPort;
  rust = await createRustSpacesMembershipPort({
    runtimeId,
    generation,
    repository: adaptMessageStoreForSpacesMembership(repository, (key) => {
      const owner = pendingOwner.get(key);
      if (!owner) throw new SpacesMembershipStaleOwnerError();
      return owner;
    }),
    async submit(mutation) {
      const operationGeneration = activeGeneration;
      const http = pendingHttp.get(mutation.idempotencyKey);
      if (!http) throw new Error("spaces/membership submit context is missing");
      const events = mutation.payload.events;
      if (!Array.isArray(events)) throw new Error("spaces/membership events are invalid");
      const options = mutation.payload.options as { isEncrypted?: boolean } | undefined;
      const response = await postSpaceEvents(
        http,
        mutation.spaceId,
        events as unknown as SignedSpaceEvent[],
        options,
      );
      if (operationGeneration !== desiredGeneration) {
        throw new SpacesMembershipStaleOwnerError();
      }
      return {
        eventCursor: mutation.idempotencyKey,
        payload: response as unknown as Readonly<Record<string, unknown>>,
      };
    },
    async project() {},
  });
  return {
    authority: "rust",
    submit(http, spaceId, events, options) {
      const operationGeneration = desiredGeneration;
      const idempotencyKey = events.map((event) => event.event_id).join(":");
      if (!idempotencyKey) throw new Error("spaces/membership event batch is empty");
      const first = events[0];
      pending += 1;

      const operation = tail.then(async () => {
        if (operationGeneration !== desiredGeneration) {
          throw new SpacesMembershipStaleOwnerError();
        }
        if (activeGeneration !== desiredGeneration) {
          rust.advanceGeneration(desiredGeneration);
          activeGeneration = desiredGeneration;
        }
        const owner = await repository.getSelfSlug();
        if (operationGeneration !== desiredGeneration) {
          throw new SpacesMembershipStaleOwnerError();
        }
        if (!owner) {
          // Pre-bind surfaces (onboarding, invite landing) have no projection
          // owner yet; post like the TypeScript authority would.
          return await postSpaceEvents(
            http,
            spaceId,
            events,
            options,
          ) as PostSpaceEventsResponse;
        }
        const mutation: SpacesMembershipMutation = {
          idempotencyKey,
          kind: events.length === 1 ? first.kind : "space_event_batch",
          spaceId,
          ...(typeof first.payload.channel_id === "string"
            ? { channelId: first.payload.channel_id }
            : {}),
          payload: { events, ...(options ? { options } : {}) },
        };
        pendingHttp.set(idempotencyKey, http);
        pendingOwner.set(idempotencyKey, owner);
        try {
          const result = await rust.apply(mutation);
          if (operationGeneration !== desiredGeneration) {
            throw new SpacesMembershipStaleOwnerError();
          }
          return result.projection.payload as PostSpaceEventsResponse;
        } catch (error) {
          if (operationGeneration !== desiredGeneration) {
            throw new SpacesMembershipStaleOwnerError();
          }
          throw error;
        } finally {
          pendingHttp.delete(idempotencyKey);
          pendingOwner.delete(idempotencyKey);
        }
      });
      tail = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation.finally(() => {
        pending -= 1;
        if (pending === 0 && activeGeneration !== desiredGeneration) {
          rust.advanceGeneration(desiredGeneration);
          activeGeneration = desiredGeneration;
        }
      });
    },
    advanceGeneration(next) {
      if (BigInt(next) <= BigInt(desiredGeneration)) return;
      desiredGeneration = next;
      if (pending === 0) {
        rust.advanceGeneration(next);
        activeGeneration = next;
      }
    },
    dispose: () => rust.dispose(),
  };
}

export function resetSpacesMembershipCommandPortForTests(): void {
  installed?.dispose();
  installed = null;
}
