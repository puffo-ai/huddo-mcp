import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
  const config = loadConfig();
  patch(config);
  writeJson(configPath(), config);
  return config;
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
  const state = loadState(slug);
  patch(state);
  writeJson(statePath(slug), state);
  return state;
}
