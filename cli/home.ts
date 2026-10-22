import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SERVER_URL = (process.env.HUDDO_SERVER_URL || "https://api.huddo.ai").replace(/\/+$/, "");
export const ORIGIN = (process.env.HUDDO_ORIGIN || "https://huddo.ai").replace(/\/+$/, "");

export function homeDir(): string {
  return process.env.HUDDO_HOME || join(homedir(), ".huddo");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function identityDir(slug: string): string {
  return join(homeDir(), "identities", encodeURIComponent(slug));
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {}
  renameSync(tmp, path);
}

const LOCK_STALE_MS = 10_000;
const heldLocks = new Set<string>();

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockHolder(lock: string): number | null {
  try {
    return Number.parseInt(readFileSync(lock, "utf8"), 10);
  } catch {
    return null;
  }
}

function lockAge(lock: string): number | null {
  try {
    return Date.now() - statSync(lock).mtimeMs;
  } catch {
    return null;
  }
}

function tryCreateLock(lock: string): boolean {
  try {
    const fd = openSync(lock, "wx", 0o600);
    try {
      writeSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "EPERM" || code === "EACCES" || code === "EBUSY") return false;
    throw e;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function deadOrStale(lock: string, maxAge: number | null): boolean {
  const holder = lockHolder(lock);
  const age = lockAge(lock);
  if (age === null) return false;
  if (holder === null || Number.isNaN(holder)) return age > 1_000;
  if (holder !== process.pid && !pidAlive(holder)) return true;
  return maxAge !== null && age > maxAge;
}

function breakIfStale(lock: string, maxAge: number | null): void {
  const breaker = `${lock}.break`;
  if (!tryCreateLock(breaker)) {
    const age = lockAge(breaker);
    if (age !== null && age > LOCK_STALE_MS) rmSync(breaker, { force: true });
    return;
  }
  try {
    if (deadOrStale(lock, maxAge)) rmSync(lock, { force: true });
  } finally {
    rmSync(breaker, { force: true });
  }
}

export function withFileLock<T>(path: string, work: () => T): T {
  const lock = `${path}.lock`;
  if (heldLocks.has(lock)) return work();
  ensureDir(dirname(path));
  while (!tryCreateLock(lock)) {
    if (deadOrStale(lock, LOCK_STALE_MS)) breakIfStale(lock, LOCK_STALE_MS);
    else sleepSync(5);
  }
  heldLocks.add(lock);
  try {
    return work();
  } finally {
    heldLocks.delete(lock);
    rmSync(lock, { force: true });
  }
}

export function acquireProcessLock(lock: string): boolean {
  ensureDir(dirname(lock));
  for (let attempt = 0; attempt < 5; attempt++) {
    if (tryCreateLock(lock)) return true;
    if (lockHolder(lock) === process.pid) return true;
    if (!deadOrStale(lock, null)) return false;
    breakIfStale(lock, null);
  }
  return false;
}

export function releaseProcessLock(lock: string): void {
  if (lockHolder(lock) === process.pid) rmSync(lock, { force: true });
}

export function removeFile(path: string): void {
  rmSync(path, { force: true });
}

export function listIdentitySlugs(): string[] {
  const dir = join(homeDir(), "identities");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "identity.json")))
    .map((d) => decodeURIComponent(d.name))
    .sort();
}

interface HomeConfig {
  active?: string;
  names?: Record<string, string>;
}

const configPath = () => join(homeDir(), "config.json");

export function loadConfig(): HomeConfig {
  return readJson<HomeConfig>(configPath()) ?? {};
}

export function updateConfig(patch: (c: HomeConfig) => void): HomeConfig {
  return withFileLock(configPath(), () => {
    const config = loadConfig();
    patch(config);
    writeJson(configPath(), config);
    return config;
  });
}

export interface Room {
  spaceId: string;
  channelId: string;
  name: string;
}

export interface IdentityState {
  room?: Room;
  rooms?: Record<string, Room>;
  cursors?: Record<string, number>;
  systemCursors?: Record<string, { events?: string; pairs?: number }>;
  pairing?: { spaceId: string; room: string; code: string; startedAt: number };
  operator?: string;
}

const statePath = (slug: string) => join(identityDir(slug), "state.json");

export function loadState(slug: string): IdentityState {
  return readJson<IdentityState>(statePath(slug)) ?? {};
}

export function updateState(slug: string, patch: (s: IdentityState) => void): IdentityState {
  return withFileLock(statePath(slug), () => {
    const state = loadState(slug);
    patch(state);
    writeJson(statePath(slug), state);
    return state;
  });
}
