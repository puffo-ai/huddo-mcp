import type { CoreEvent } from "./protocol";

type Listener = (events: readonly CoreEvent[]) => void;

const listeners = new Set<Listener>();

export function publishCoreEvents(events: readonly CoreEvent[]): void {
  for (const listener of [...listeners]) listener(events);
}

export function subscribeCoreEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type RealtimeStateQuery = () => Promise<string | null>;

let realtimeState: RealtimeStateQuery = async () => null;

export function registerRealtimeStateQuery(query: RealtimeStateQuery): void {
  realtimeState = query;
}

export function currentRealtimeState(): Promise<string | null> {
  return realtimeState();
}
