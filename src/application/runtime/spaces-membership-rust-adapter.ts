import { startWasmSpacesMembershipAuthority } from "../../protocol/wasm-protocol-facade";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SpacesMembershipMutation = Readonly<{
  idempotencyKey: string;
  kind: string;
  spaceId: string;
  channelId?: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type SpacesMembershipProjection = Readonly<{
  eventCursor: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type DurableSpacesMembershipMutation = Readonly<{
  mutation: SpacesMembershipMutation;
  projection: SpacesMembershipProjection;
}>;

export interface SpacesMembershipRepository {
  lookup(idempotencyKey: string): Promise<DurableSpacesMembershipMutation | null>;
  persistApplied(row: DurableSpacesMembershipMutation): Promise<void>;
  flush(): Promise<void>;
}

export interface SpacesMembershipMessageStore {
  getSelfSlug(): Promise<string | null>;
  getAppliedSpacesMembership(idempotencyKey: string): {
    mutationPayload: Uint8Array;
    projectionPayload: Uint8Array;
  } | null | Promise<{ mutationPayload: Uint8Array; projectionPayload: Uint8Array } | null>;
  persistAppliedSpacesMembership(
    idempotencyKey: string,
    mutationPayload: Uint8Array,
    projectionPayload: Uint8Array,
  ): void | Promise<void>;
  getAppliedSpacesMembershipForOwner(selfSlug: string, idempotencyKey: string): {
    mutationPayload: Uint8Array;
    projectionPayload: Uint8Array;
  } | null | Promise<{ mutationPayload: Uint8Array; projectionPayload: Uint8Array } | null>;
  persistAppliedSpacesMembershipForOwner(
    selfSlug: string,
    idempotencyKey: string,
    mutationPayload: Uint8Array,
    projectionPayload: Uint8Array,
  ): void | Promise<void>;
  flush(): Promise<void>;
}

export interface RustSpacesMembershipDependencies {
  runtimeId: string;
  generation: string;
  repository: SpacesMembershipRepository;
  submit(mutation: SpacesMembershipMutation): Promise<SpacesMembershipProjection>;
  project(projection: SpacesMembershipProjection): Promise<void>;
}

export interface RustSpacesMembershipPort {
  readonly authority: "rust";
  apply(mutation: SpacesMembershipMutation): Promise<Readonly<{
    outcome: "applied" | "already_applied";
    projection: SpacesMembershipProjection;
  }>>;
  advanceGeneration(next: string): void;
  dispose(): void;
}

const encode = (value: Readonly<Record<string, unknown>>): Uint8Array =>
  encoder.encode(JSON.stringify(value));

const decode = (value: ArrayLike<number>): Readonly<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(decoder.decode(Uint8Array.from(value)));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid spaces/membership payload");
  }
  return parsed as Readonly<Record<string, unknown>>;
};

const encodeRow = <T>(value: T): Uint8Array => encoder.encode(JSON.stringify(value));
const decodeRow = <T>(value: Uint8Array): T => JSON.parse(decoder.decode(value)) as T;

export function adaptMessageStoreForSpacesMembership(
  store: SpacesMembershipMessageStore,
  ownerFor: (idempotencyKey: string) => string,
): SpacesMembershipRepository {
  return {
    async lookup(idempotencyKey) {
      const row = await store.getAppliedSpacesMembershipForOwner(
        ownerFor(idempotencyKey), idempotencyKey,
      );
      if (row === null) return null;
      return {
        mutation: decodeRow<SpacesMembershipMutation>(row.mutationPayload),
        projection: decodeRow<SpacesMembershipProjection>(row.projectionPayload),
      };
    },
    async persistApplied(row) {
      await store.persistAppliedSpacesMembershipForOwner(
        ownerFor(row.mutation.idempotencyKey),
        row.mutation.idempotencyKey,
        encodeRow(row.mutation),
        encodeRow(row.projection),
      );
    },
    flush: () => store.flush(),
  };
}

const toWireMutation = (value: SpacesMembershipMutation) => ({
  idempotencyKey: value.idempotencyKey,
  kind: value.kind,
  spaceId: value.spaceId,
  ...(value.channelId === undefined ? {} : { channelId: value.channelId }),
  payload: encode(value.payload),
});

const fromWireMutation = (value: ReturnType<typeof toWireMutation>): SpacesMembershipMutation => ({
  idempotencyKey: value.idempotencyKey,
  kind: value.kind,
  spaceId: value.spaceId,
  ...(value.channelId === undefined ? {} : { channelId: value.channelId }),
  payload: decode(value.payload),
});

export async function createRustSpacesMembershipPort(
  dependencies: RustSpacesMembershipDependencies,
): Promise<RustSpacesMembershipPort> {
  const host = {
    async lookup(_context: unknown, key: string) {
      const row = await dependencies.repository.lookup(key);
      if (row === null) return null;
      return {
        mutation: toWireMutation(row.mutation),
        projection: { eventCursor: row.projection.eventCursor, payload: encode(row.projection.payload) },
      };
    },
    async submit(_context: unknown, mutation: ReturnType<typeof toWireMutation>) {
      const projection = await dependencies.submit(fromWireMutation(mutation));
      return { eventCursor: projection.eventCursor, payload: encode(projection.payload) };
    },
    async persistApplied(
      _context: unknown,
      mutation: ReturnType<typeof toWireMutation>,
      projection: { eventCursor: string; payload: Uint8Array },
    ) {
      await dependencies.repository.persistApplied({
        mutation: fromWireMutation(mutation),
        projection: { eventCursor: projection.eventCursor, payload: decode(projection.payload) },
      });
    },
    flush: () => dependencies.repository.flush(),
    async project(_context: unknown, projection: { eventCursor: string; payload: Uint8Array }) {
      await dependencies.project({
        eventCursor: projection.eventCursor,
        payload: decode(projection.payload),
      });
    },
  };
  const authority = await startWasmSpacesMembershipAuthority(
    dependencies.runtimeId,
    dependencies.generation,
    host,
  );
  return {
    authority: "rust",
    async apply(mutation) {
      const result = await authority.apply(toWireMutation(mutation));
      return {
        outcome: result.outcome,
        projection: {
          eventCursor: result.projection.eventCursor,
          payload: decode(result.projection.payload),
        },
      };
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    dispose: () => authority.free(),
  };
}
