import { join } from "node:path";
import { identityDir, readJson, writeJson } from "./home";

interface ListenerRecord {
  pid: number;
  startedAt: number;
  endedAt?: number;
  room?: string | null;
}

export interface ListenerState {
  listening: boolean;
  startedAt?: number;
  endedAt?: number;
  pid?: number;
  room?: string | null;
}

const listenerPath = (slug: string) => join(identityDir(slug), "listener.json");

function read(slug: string): ListenerRecord | null {
  try {
    return readJson<ListenerRecord>(listenerPath(slug));
  } catch {
    return null;
  }
}

function write(slug: string, record: ListenerRecord): void {
  try {
    writeJson(listenerPath(slug), record);
  } catch {}
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function markListening(slug: string, room?: string | null): void {
  write(slug, { pid: process.pid, startedAt: Date.now(), room: room ?? null });
}

export function markStopped(slug: string): void {
  const record = read(slug);
  if (record && record.pid === process.pid && record.endedAt === undefined) write(slug, { ...record, endedAt: Date.now() });
}

export function listenerState(slug: string): ListenerState {
  const record = read(slug);
  if (!record) return { listening: false };
  const running = record.endedAt === undefined && alive(record.pid);
  return {
    listening: running,
    startedAt: record.startedAt,
    endedAt: record.endedAt ?? (running ? undefined : record.startedAt),
    pid: record.pid,
    room: record.room ?? null,
  };
}
