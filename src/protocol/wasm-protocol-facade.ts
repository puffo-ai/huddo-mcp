import init, {
  protocolFacadeVersion,
  signingPublicKeyFingerprint,
  normalizeMessageEnvelopeWire,
  normalizeSignedEventWire,
  notificationAuthorityVersion,
  notificationProfileAuthorityVersion,
  WasmClientRuntime,
  WasmAttachmentAuthority,
  WasmAgentProvisionAuthority,
  issueAgentOperatorAttestation,
  WasmDeviceEnrollmentAuthority,
  WasmIdentitySessionAuthority,
  WasmMessageAuthority,
  WasmNotificationAuthority,
  WasmNotificationProfileAuthority,
  WasmRecoveryAuthority,
  WasmRootDeviceCertAuthority,
  WasmSendOutboxAuthority,
  WasmSpacesMembershipAuthority,
  WasmSyncReceiveAuthority,
  WasmSubkeyCertAuthority,
  WasmTransportSigner,
} from "puffo-crypto-wasm-v2";
import wasmUrl from "puffo-crypto-wasm-v2/puffo_crypto_wasm_v2_bg.wasm?url";

export const SUPPORTED_PROTOCOL_FACADE_VERSION = 1;

export interface ProtocolFacadeBindings {
  protocolFacadeVersion(): number;
  normalizeMessageEnvelopeWire(json: string): string;
  normalizeSignedEventWire(json: string): string;
  signingPublicKeyFingerprint(publicKeyBase64url: string): string;
}

export interface WasmTransportSignerFacade {
  signHttp(runtimeId: string, generation: string, method: string, path: string, body: Uint8Array): unknown;
  signWebSocket(runtimeId: string, generation: string): unknown;
  signEvent(runtimeId: string, generation: string, eventJson: string): string;
  verifyEvent(runtimeId: string, generation: string, eventJson: string, chainJson: string): void;
  dispose(runtimeId: string, generation: string): void;
  free(): void;
}

export interface WasmMessageAuthorityFacade {
  signPlaintextMessageEnvelope(fence: unknown, context: unknown, payloadJson: string): string;
  sealMessageEnvelope(
    fence: Readonly<{ runtimeId: string; generation: string }>,
    context: unknown,
    payloadJson: string,
    recipients: readonly unknown[],
  ): string;
  supplementMessageRecipients(
    fence: Readonly<{ runtimeId: string; generation: string }>,
    supplementationHandle: string,
    recipients: readonly unknown[],
  ): string;
  finishMessageEnvelope(
    fence: Readonly<{ runtimeId: string; generation: string }>,
    supplementationHandle: string,
  ): void;
  openMessageEnvelopeOnce(
    host: unknown,
    fence: Readonly<{ runtimeId: string; generation: string }>,
    envelopeJson: string,
    selfDeviceId: string,
    senders: readonly unknown[],
    nowMs: string,
    maxClockSkewMs: string,
  ): Promise<string>;
  openPlaintextMessageEnvelopeOnce(
    host: unknown,
    fence: Readonly<{ runtimeId: string; generation: string }>,
    envelopeJson: string,
    senders: readonly unknown[],
    nowMs: string,
    maxClockSkewMs: string,
  ): Promise<string>;
  free(): void;
}

export type WasmAccountKeyAuthorityFacade = WasmMessageAuthorityFacade
  & Omit<WasmTransportSignerFacade, "dispose" | "free">
  & Omit<WasmSubkeyCertAuthorityFacade, "issue" | "dispose" | "free">
  & {
  signHttpAsDevice(runtimeId: string, generation: string, method: string, path: string, body: Uint8Array): unknown;
  openDeviceKem(runtimeId: string, generation: string, encappedKey: Uint8Array, info: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  issue(runtimeId: string, generation: string, issuedAt: bigint, expiresAt: bigint): unknown;
  dispose(): void;
};

export type WasmAccountKeyAuthorityInput = Readonly<{
  namespace: string;
  slug: string;
  deviceId: string;
  subkeyId: string;
  generation: string;
  rootSigningSeed: Uint8Array;
  deviceSigningSeed: Uint8Array;
  subkeySigningSeed: Uint8Array;
  deviceKemSeed: Uint8Array;
}>;

export async function createWasmAccountKeyAuthority(
  input: WasmAccountKeyAuthorityInput,
): Promise<WasmAccountKeyAuthorityFacade> {
  await initializeWasm();
  const runtimeId = input.namespace;
  const fence = { runtimeId, generation: input.generation };
  const authority = (WasmMessageAuthority as unknown as {
    startAccount(
      runtimeId: string,
      generation: string,
      namespace: string,
      slug: string,
      deviceId: string,
      subkeyId: string,
      rootSigningSeed: Uint8Array,
      deviceSigningSeed: Uint8Array,
      subkeySigningSeed: Uint8Array,
      deviceKemSeed: Uint8Array,
    ): WasmMessageAuthorityFacade & {
      signHttp(fence: unknown, method: string, path: string, body: Uint8Array): unknown;
      signHttpAsDevice(fence: unknown, method: string, path: string, body: Uint8Array): unknown;
      openDeviceKem(fence: unknown, encappedKey: Uint8Array, info: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
      signWebSocket(fence: unknown): unknown;
      signEvent(fence: unknown, eventJson: string): string;
      verifyEvent(fence: unknown, eventJson: string, chainJson: string): void;
      issueSubkeyCertificate(fence: unknown, issuedAt: bigint, expiresAt: bigint): unknown;
      disposeAccount(fence: unknown): void;
    };
  }).startAccount(
    runtimeId,
    input.generation,
    input.namespace,
    input.slug,
    input.deviceId,
    input.subkeyId,
    input.rootSigningSeed,
    input.deviceSigningSeed,
    input.subkeySigningSeed,
    input.deviceKemSeed,
  );
  const assertFence = (candidateRuntimeId: string, candidateGeneration: string): void => {
    if (candidateRuntimeId !== runtimeId || candidateGeneration !== input.generation) {
      throw new Error("stale_owner");
    }
  };
  return {
    signPlaintextMessageEnvelope: (...args) => authority.signPlaintextMessageEnvelope(...args),
    sealMessageEnvelope: (...args) => authority.sealMessageEnvelope(...args),
    supplementMessageRecipients: (...args) => authority.supplementMessageRecipients(...args),
    finishMessageEnvelope: (...args) => authority.finishMessageEnvelope(...args),
    openMessageEnvelopeOnce: (...args) => authority.openMessageEnvelopeOnce(...args),
    openPlaintextMessageEnvelopeOnce: (...args) => authority.openPlaintextMessageEnvelopeOnce(...args),
    signHttp(candidateRuntimeId, candidateGeneration, method, path, body) {
      assertFence(candidateRuntimeId, candidateGeneration);
      return authority.signHttp(fence, method, path, body);
    },
    signHttpAsDevice(candidateRuntimeId, candidateGeneration, method, path, body) {
      assertFence(candidateRuntimeId, candidateGeneration);
      return authority.signHttpAsDevice(fence, method, path, body);
    },
    openDeviceKem(candidateRuntimeId, candidateGeneration, encappedKey, info, aad, ciphertext) {
      assertFence(candidateRuntimeId, candidateGeneration);
      return authority.openDeviceKem(fence, encappedKey, info, aad, ciphertext);
    },
    signWebSocket(candidateRuntimeId, candidateGeneration) {
      assertFence(candidateRuntimeId, candidateGeneration);
      return authority.signWebSocket(fence);
    },
    signEvent(candidateRuntimeId, candidateGeneration, eventJson) {
      assertFence(candidateRuntimeId, candidateGeneration);
      return authority.signEvent(fence, eventJson);
    },
    verifyEvent(candidateRuntimeId, candidateGeneration, eventJson, chainJson) {
      assertFence(candidateRuntimeId, candidateGeneration);
      authority.verifyEvent(fence, eventJson, chainJson);
    },
    issue(candidateRuntimeId, candidateGeneration, issuedAt, expiresAt) {
      assertFence(candidateRuntimeId, candidateGeneration);
      return authority.issueSubkeyCertificate(fence, issuedAt, expiresAt);
    },
    dispose: () => authority.disposeAccount(fence),
    free: () => authority.free(),
  };
}

export async function createWasmMessageAuthority(
  runtimeId: string,
  generation: string,
  rootSigningSeed: Uint8Array,
  deviceSigningSeed: Uint8Array,
  subkeySigningSeed: Uint8Array,
  deviceKemSeed: Uint8Array,
): Promise<WasmMessageAuthorityFacade> {
  await initializeWasm();
  return new WasmMessageAuthority(
    runtimeId,
    generation,
    rootSigningSeed,
    deviceSigningSeed,
    subkeySigningSeed,
    deviceKemSeed,
  ) as unknown as WasmMessageAuthorityFacade;
}

export function createWasmTransportSigner(
  runtimeId: string,
  generation: string,
  namespace: string,
  slug: string,
  deviceId: string,
  keyId: string,
  seed: Uint8Array,
): WasmTransportSignerFacade {
  return WasmTransportSigner.start(runtimeId, generation, namespace, slug, deviceId, keyId, seed);
}

export interface WasmSubkeyCertAuthorityFacade {
  issue(runtimeId: string, generation: string, issuedAt: bigint, expiresAt: bigint): unknown;
  dispose(runtimeId: string, generation: string): void;
  free(): void;
}

export interface WasmRootDeviceCertAuthorityFacade {
  phase1(runtimeId: string, generation: string): unknown;
  complete(runtimeId: string, generation: string, slug: string, issuedAt: bigint): unknown;
  dispose(runtimeId: string, generation: string): void;
  free(): void;
}

export interface WasmAgentProvisionAuthorityFacade {
  phase1(runtimeId: string, generation: string): unknown;
  complete(runtimeId: string, generation: string, slug: string, issuedAt: bigint): unknown;
  dispose(runtimeId: string, generation: string): void;
  free(): void;
}

export function createWasmAgentProvisionAuthority(
  runtimeId: string,
  generation: string,
  namespace: string,
  operatorRootSeed: Uint8Array,
  issuedAt: bigint,
): WasmAgentProvisionAuthorityFacade {
  return WasmAgentProvisionAuthority.start(
    runtimeId,
    generation,
    namespace,
    operatorRootSeed,
    issuedAt,
  );
}

export function issueWasmAgentOperatorAttestation(
  operatorRootSeed: Uint8Array,
  agentRootPublicKey: string,
  issuedAt: bigint,
): unknown {
  return issueAgentOperatorAttestation(operatorRootSeed, agentRootPublicKey, issuedAt);
}

export function createWasmRootDeviceCertAuthority(
  runtimeId: string,
  generation: string,
  namespace: string,
  identityType: "human" | "agent",
  declaredOperatorPublicKey: string | undefined,
  issuedAt: bigint,
  expiresAt: bigint | undefined,
): WasmRootDeviceCertAuthorityFacade {
  return WasmRootDeviceCertAuthority.start(
    runtimeId,
    generation,
    namespace,
    identityType,
    declaredOperatorPublicKey,
    issuedAt,
    expiresAt,
  );
}

export interface WasmDeviceEnrollmentAuthorityFacade {
  begin(runtimeId: string, generation: string): unknown;
  approve(
    runtimeId: string,
    generation: string,
    slug: string,
    token: string,
    identityCertJson: string,
    identityProfileJson: string | undefined,
    issuedAt: bigint,
  ): unknown;
  complete(runtimeId: string, generation: string, responseJson: string): unknown;
  dispose(runtimeId: string, generation: string): void;
  free(): void;
}

export function createWasmNewDeviceEnrollmentAuthority(
  runtimeId: string,
  generation: string,
  namespace: string,
): WasmDeviceEnrollmentAuthorityFacade {
  return WasmDeviceEnrollmentAuthority.startNewDevice(runtimeId, generation, namespace);
}

export function createWasmEnrollmentApproverAuthority(
  runtimeId: string,
  generation: string,
  namespace: string,
  rootSeed: Uint8Array,
): WasmDeviceEnrollmentAuthorityFacade {
  return WasmDeviceEnrollmentAuthority.startApprover(runtimeId, generation, namespace, rootSeed);
}

export function createWasmSubkeyCertAuthority(
  runtimeId: string,
  generation: string,
  namespace: string,
  deviceId: string,
  deviceSeed: Uint8Array,
): WasmSubkeyCertAuthorityFacade {
  return WasmSubkeyCertAuthority.start(
    runtimeId,
    generation,
    namespace,
    deviceId,
    deviceSeed,
  );
}

export type WasmRecoveryOperation = "request" | "withdraw" | "provide" | "import";
export type WasmRecoveryPhase = "prepared" | "claimed" | "blobStored" | "submitted" | "imported" | "finished";
export type WasmRecoveryCommand = Readonly<{
  transactionId: string;
  operation: WasmRecoveryOperation;
  payload: Uint8Array;
}>;
export type WasmRecoveryRecord = Readonly<{
  command: WasmRecoveryCommand;
  phase: WasmRecoveryPhase;
  payload: Uint8Array;
}>;
export interface WasmRecoveryAuthorityFacade {
  run(command: WasmRecoveryCommand): Promise<Readonly<{ record: WasmRecoveryRecord; resumed: boolean }>>;
  advanceGeneration(next: string): void;
  free(): void;
}

export async function startWasmRecoveryAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmRecoveryAuthorityFacade> {
  await initializeWasm();
  const authority = WasmRecoveryAuthority.start(runtimeId, generation, host);
  return {
    async run(command) {
      const result = await authority.run(command) as {
        resumed?: unknown;
        record?: { command?: unknown; phase?: unknown; payload?: unknown };
      };
      const record = result.record;
      const nestedCommand = record?.command as Partial<WasmRecoveryCommand> | null | undefined;
      if (typeof result.resumed !== "boolean"
        || !record
        || !nestedCommand
        || typeof nestedCommand.transactionId !== "string"
        || !["request", "withdraw", "provide", "import"].includes(String(nestedCommand.operation))
        || (!Array.isArray(nestedCommand.payload) && !ArrayBuffer.isView(nestedCommand.payload))
        || !["prepared", "claimed", "blobStored", "submitted", "imported", "finished"].includes(String(record.phase))
        || (!Array.isArray(record.payload) && !ArrayBuffer.isView(record.payload))) {
        throw new Error("Rust recovery authority returned an invalid result");
      }
      return {
        resumed: result.resumed,
        record: {
          command: {
            transactionId: nestedCommand.transactionId,
            operation: nestedCommand.operation as WasmRecoveryOperation,
            payload: Uint8Array.from(nestedCommand.payload as ArrayLike<number>),
          },
          phase: record.phase as WasmRecoveryPhase,
          payload: Uint8Array.from(record.payload as ArrayLike<number>),
        },
      };
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export interface ProtocolFacade {
  readonly version: number;
  normalizeMessageEnvelopeWire(wireJson: string): string;
  normalizeSignedEventWire(wireJson: string): string;
  signingPublicKeyFingerprint(publicKeyBase64url: string): string;
}

export interface WasmClientRuntimeFacade {
  command(name: string, payload: Uint8Array): Promise<Uint8Array>;
  query(name: string, payload: Uint8Array): Promise<Uint8Array>;
  drainEvents(): Promise<unknown[]>;
  stop(): Promise<void>;
}

export type WasmNotificationOutcome =
  | "subscribed" | "unsubscribed" | "already_unsubscribed" | "unsupported"
  | "permission_denied" | "permission_required" | "service_worker_unavailable" | "failed";

export interface WasmNotificationAuthorityFacade {
  reconcile(mode: "off" | "wake_only" | "on", intent: "user_gesture" | "background"): Promise<WasmNotificationOutcome>;
  advanceGeneration(next: string): void;
  free(): void;
}

export async function startWasmNotificationAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmNotificationAuthorityFacade> {
  await initializeWasm();
  if (notificationAuthorityVersion() !== 1) {
    throw new Error("Unsupported Rust notification authority version");
  }
  const authority = WasmNotificationAuthority.start(runtimeId, generation, host);
  return {
    async reconcile(mode, intent) {
      const result = await authority.reconcile(mode, intent) as string;
      if (!["subscribed", "unsubscribed", "already_unsubscribed", "unsupported", "permission_denied", "permission_required", "service_worker_unavailable", "failed"].includes(result)) {
        throw new Error("Rust notification authority returned an invalid result");
      }
      return result as WasmNotificationOutcome;
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export type WasmNotificationProfileCommand =
  | Readonly<{ kind: "load"; space_ids: string[]; direct_slugs: string[] }>
  | Readonly<{ kind: "change_rule"; scope: "all" | "space" | "channel" | "dm"; target_id: string | null; rule: "on" | "off_hour" | "off_day" | "off_forever" }>
  | Readonly<{ kind: "change_scopes"; scope: "space" | "dm"; target_ids: string[]; enabled: boolean }>;

export interface WasmNotificationProfileResult {
  profile: unknown | null;
  settings: unknown[];
  preferences: unknown | null;
}

export interface WasmNotificationProfileAuthorityFacade {
  run(command: WasmNotificationProfileCommand): Promise<WasmNotificationProfileResult>;
  advanceGeneration(next: string): void;
  free(): void;
}

export async function startWasmNotificationProfileAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmNotificationProfileAuthorityFacade> {
  await initializeWasm();
  if (notificationProfileAuthorityVersion() !== 1) {
    throw new Error("Unsupported Rust notification profile authority version");
  }
  const authority = WasmNotificationProfileAuthority.start(runtimeId, generation, host);
  return {
    async run(command) {
      const result = await authority.run(command) as Partial<WasmNotificationProfileResult>;
      if (!Array.isArray(result.settings)
        || !(result.profile === null || typeof result.profile === "object")
        || !(result.preferences === null || typeof result.preferences === "object")) {
        throw new Error("Rust notification profile authority returned an invalid result");
      }
      return result as WasmNotificationProfileResult;
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export type WasmAttachmentCommand = Readonly<{
  transactionId: string;
  operation: "upload" | "open";
  payload: Uint8Array;
}>;

export interface WasmAttachmentAuthorityFacade {
  run(command: WasmAttachmentCommand): Promise<Readonly<{
    replayed: boolean;
    projection: Readonly<{ payload: Uint8Array }>;
  }>>;
  advanceGeneration(next: string): void;
  free(): void;
}

export async function startWasmAttachmentAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmAttachmentAuthorityFacade> {
  await initializeWasm();
  const authority = WasmAttachmentAuthority.start(runtimeId, generation, host);
  return {
    async run(command) {
      const result = await authority.run(command) as {
        replayed?: unknown;
        projection?: { payload?: unknown };
      };
      if (typeof result.replayed !== "boolean"
        || (!Array.isArray(result.projection?.payload)
          && !ArrayBuffer.isView(result.projection?.payload))) {
        throw new Error("Rust attachment authority returned an invalid result");
      }
      return {
        replayed: result.replayed,
        projection: { payload: Uint8Array.from(result.projection!.payload as ArrayLike<number>) },
      };
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export interface WasmIdentitySessionAuthorityFacade {
  authenticate(operation: string, request: Uint8Array): Promise<unknown>;
  restore(): Promise<unknown>;
  validateActive(): Promise<unknown>;
  logout(): Promise<void>;
  free(): void;
}

export interface WasmSyncReceiveAuthorityFacade {
  catchUp(reason: "startup" | "reconnect" | "manual"): Promise<"ready" | "failed" | "cancelled">;
  receiveLive(envelopeId: string, sequence: string | undefined, payload: Uint8Array): Promise<"projected" | "already_projected" | "terminal_failure">;
  advanceGeneration(next: string): void;
  free(): void;
}

export interface WasmSendOutboxAuthorityFacade {
  send(idempotencyKey: string, payload: Uint8Array): Promise<"sent" | "already_committed" | "queued_for_retry">;
  drain(): Promise<number>;
  advanceGeneration(next: string): void;
  free(): void;
}

export type WasmSpacesMembershipMutation = Readonly<{
  idempotencyKey: string;
  kind: string;
  spaceId: string;
  channelId?: string;
  payload: Uint8Array;
}>;

export interface WasmSpacesMembershipAuthorityFacade {
  apply(mutation: WasmSpacesMembershipMutation): Promise<Readonly<{
    outcome: "applied" | "already_applied";
    projection: Readonly<{ eventCursor: string; payload: Uint8Array }>;
  }>>;
  advanceGeneration(next: string): void;
  free(): void;
}

export async function startWasmSpacesMembershipAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmSpacesMembershipAuthorityFacade> {
  await initializeWasm();
  const authority = WasmSpacesMembershipAuthority.start(runtimeId, generation, host);
  return {
    async apply(mutation) {
      const result = await authority.apply(mutation) as {
        outcome?: unknown;
        projection?: { eventCursor?: unknown; payload?: unknown };
      };
      if ((result.outcome !== "applied" && result.outcome !== "already_applied")
        || typeof result.projection?.eventCursor !== "string"
        || (!Array.isArray(result.projection.payload)
          && !ArrayBuffer.isView(result.projection.payload))) {
        throw new Error("Rust spaces/membership authority returned an invalid outcome");
      }
      return {
        outcome: result.outcome,
        projection: {
          eventCursor: result.projection.eventCursor,
          payload: Uint8Array.from(result.projection.payload as ArrayLike<number>),
        },
      } as Awaited<ReturnType<WasmSpacesMembershipAuthorityFacade["apply"]>>;
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export async function startWasmSendOutboxAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmSendOutboxAuthorityFacade> {
  await initializeWasm();
  const authority = WasmSendOutboxAuthority.start(runtimeId, generation, host);
  const outcome = (value: string) => {
    if (value !== "sent" && value !== "already_committed" && value !== "queued_for_retry") {
      throw new Error("Rust send/outbox authority returned an invalid outcome");
    }
    return value;
  };
  return {
    send: async (idempotencyKey, payload) => outcome(await authority.send(idempotencyKey, payload)),
    drain: () => authority.drain(),
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export async function startWasmSyncReceiveAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmSyncReceiveAuthorityFacade> {
  await initializeWasm();
  const authority = WasmSyncReceiveAuthority.start(runtimeId, generation, host);
  return {
    async catchUp(reason) {
      const outcome = await authority.catchUp(reason);
      if (outcome !== "ready" && outcome !== "failed" && outcome !== "cancelled") {
        throw new Error("Rust sync authority returned an invalid outcome");
      }
      return outcome;
    },
    async receiveLive(envelopeId, sequence, payload) {
      const outcome = await authority.receiveLive(envelopeId, sequence, payload);
      if (outcome !== "projected" && outcome !== "already_projected" && outcome !== "terminal_failure") {
        throw new Error("Rust receive authority returned an invalid disposition");
      }
      return outcome;
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

export async function startWasmIdentitySessionAuthority(
  runtimeId: string,
  protocolHost: unknown,
  projectionHost: unknown,
): Promise<WasmIdentitySessionAuthorityFacade> {
  await initializeWasm();
  return WasmIdentitySessionAuthority.start(runtimeId, protocolHost, projectionHost);
}

export function bindProtocolFacade(bindings: ProtocolFacadeBindings): ProtocolFacade {
  const version = bindings.protocolFacadeVersion();
  if (version !== SUPPORTED_PROTOCOL_FACADE_VERSION) {
    throw new Error(
      `Unsupported Puffo protocol facade version ${version}; expected ${SUPPORTED_PROTOCOL_FACADE_VERSION}`,
    );
  }
  return {
    version,
    normalizeMessageEnvelopeWire(wireJson) {
      return bindings.normalizeMessageEnvelopeWire(wireJson);
    },
    normalizeSignedEventWire(wireJson) {
      return bindings.normalizeSignedEventWire(wireJson);
    },
    signingPublicKeyFingerprint(publicKeyBase64url) {
      return bindings.signingPublicKeyFingerprint(publicKeyBase64url);
    },
  };
}

let initialized: Promise<ProtocolFacade> | null = null;

let wasmInitialized: Promise<void> | null = null;

function initializeWasm(): Promise<void> {
  if (!wasmInitialized) {
    wasmInitialized = init({ module_or_path: wasmUrl }).then(() => undefined).catch((error: unknown) => {
      wasmInitialized = null;
      throw error;
    });
  }
  return wasmInitialized;
}

export async function startWasmClientRuntime(
  runtimeId: string,
  namespace: string,
  serverOrigin: string,
  identitySlug: string,
  host: unknown,
): Promise<WasmClientRuntimeFacade> {
  await initializeWasm();
  return WasmClientRuntime.start(runtimeId, namespace, serverOrigin, identitySlug, host);
}

export function loadWasmProtocolFacade(): Promise<ProtocolFacade> {
  if (!initialized) {
    initialized = initializeWasm().then(() => bindProtocolFacade({
      protocolFacadeVersion,
      normalizeMessageEnvelopeWire,
      normalizeSignedEventWire,
      signingPublicKeyFingerprint,
    })).catch((error: unknown) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}
