export type AccountSessionOwner = Readonly<{
  slug: string;
  serverUrl: string;
  generation: number;
}>;

export interface AccountSessionOwnerFence {
  assertActive(): void;
  addCleanup(cleanup: () => void): () => void;
}

export class StaleAccountSessionOwnerError extends Error {
  constructor() {
    super("stale agent provision owner");
    this.name = "StaleAccountSessionOwnerError";
  }
}

type BoundOwner = Readonly<{
  value: AccountSessionOwner;
  cleanups: Set<() => void>;
}>;

let current: BoundOwner | null = null;

export function bindAccountSessionOwner(owner: AccountSessionOwner | null): void {
  if (current) {
    for (const cleanup of current.cleanups) {
      try {
        cleanup();
      } catch {
      }
    }
    current.cleanups.clear();
  }
  current = owner ? { value: owner, cleanups: new Set() } : null;
}

export function captureAccountSessionOwnerFence(
  slug: string,
  serverUrl: string,
): AccountSessionOwnerFence {
  const captured = current;
  if (!captured || captured.value.slug !== slug || captured.value.serverUrl !== serverUrl) {
    throw new Error("Agent provision requires the active account session owner");
  }
  return {
    assertActive() {
      if (current !== captured) throw new StaleAccountSessionOwnerError();
    },
    addCleanup(cleanup) {
      if (current !== captured) throw new StaleAccountSessionOwnerError();
      captured.cleanups.add(cleanup);
      return () => captured.cleanups.delete(cleanup);
    },
  };
}

export function resetAccountSessionOwnerForTests(): void {
  current = null;
}
