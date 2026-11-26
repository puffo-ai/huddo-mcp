export const SYNC_SNAPSHOT_VERSION = 1 as const;
export const PENDING_MESSAGE_PAGE_SIZE = 1_000;

export type CatchUpReason = "startup" | "reconnect" | "manual";

export type CatchUpPhase =
  | "idle"
  | "fetching"
  | "processing"
  | "persisting"
  | "acknowledging"
  | "hydrating_cursors"
  | "ready"
  | "error";

export type CatchUpErrorCode =
  | "pending_fetch_failed"
  | "persistence_failed"
  | "ack_failed"
  | "cursor_hydration_failed"
  | "unexpected_sync_failure";

export interface CatchUpError {
  code: CatchUpErrorCode;
  category: "network" | "storage" | "sync";
  retryable: boolean;
}

export interface CatchUpSnapshot {
  version: typeof SYNC_SNAPSHOT_VERSION;
  eventSequence: number;
  operationId: string | null;
  reason: CatchUpReason | null;
  attempt: number;
  phase: CatchUpPhase;
  total: number;
  processed: number;
  failed: number;
  error: CatchUpError | null;
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): () => void;
}

export interface ProcessEnvelopeResult {
  acknowledgedEnvelopeId: string;
}

export interface CatchUpPorts<PendingItem = unknown> {
  fetchPending(cancellation: CancellationToken, after?: number): Promise<readonly PendingItem[]>;
  sequenceOf?(item: PendingItem): number | undefined;
  processEnvelope(
    item: PendingItem,
    cancellation: CancellationToken,
  ): Promise<ProcessEnvelopeResult>;
  persist(cancellation: CancellationToken): Promise<void>;
  acknowledge(
    envelopeIds: readonly string[],
    cancellation: CancellationToken,
  ): Promise<void>;
  hydrateReadCursors(cancellation: CancellationToken): Promise<void>;
  yieldToHost(): Promise<void>;
  waitBeforeRetry(attempt: number, cancellation: CancellationToken): Promise<void>;
}

export type CatchUpResult =
  | { outcome: "ready"; snapshot: CatchUpSnapshot }
  | { outcome: "failed"; snapshot: CatchUpSnapshot }
  | { outcome: "cancelled"; snapshot: CatchUpSnapshot };

export type CatchUpObserver = (snapshot: CatchUpSnapshot) => void;
