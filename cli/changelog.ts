import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatChangelog,
  isNewer,
  latestVersion,
  parseChangelog,
  unreadEntries,
  type ChangelogEntry,
} from "../src/huddo/changelog";
import { reregisterNotice } from "./device-recovery";
import { homeDir, ORIGIN } from "./home";
import { VERSION } from "./version";

const REFRESH_MS = 3_600_000;
const FAILED_RETRY_MS = 600_000;
const FETCH_TIMEOUT_MS = 1_500;

interface ChangelogState {
  cursor: string;
  fetched_at: number;
  entries: ChangelogEntry[];
}

const statePath = () => join(homeDir(), "changelog.json");

function loadState(): ChangelogState {
  try {
    return { cursor: VERSION, fetched_at: 0, entries: [], ...JSON.parse(readFileSync(statePath(), "utf8")) };
  } catch {
    return { cursor: VERSION, fetched_at: 0, entries: [] };
  }
}

function saveState(state: ChangelogState): void {
  try {
    mkdirSync(homeDir(), { recursive: true });
    const temp = `${statePath()}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(state));
    renameSync(temp, statePath());
  } catch {
    return;
  }
}

async function refresh(state: ChangelogState, now: number): Promise<ChangelogState> {
  let next = { ...state, fetched_at: now - REFRESH_MS + FAILED_RETRY_MS };
  try {
    const res = await fetch(`${ORIGIN}/changelog`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.ok) next = { ...state, fetched_at: now, entries: parseChangelog(await res.json()) };
  } catch {
    saveState(next);
    return next;
  }
  saveState(next);
  return next;
}

export async function hasUnreadChangelog(now = Date.now()): Promise<boolean> {
  let state = loadState();
  if (now - state.fetched_at >= REFRESH_MS) state = await refresh(state, now);
  return unreadEntries(state.entries, state.cursor).length > 0;
}

export const CLI_CHANGELOG_HINT = "New in Huddo: run huddo changelog to see what changed.";
export const MCP_CHANGELOG_HINT = "New in Huddo: call huddo_changelog to see what changed.";

export function withChangelogHint(text: string, hint: string): string {
  const lines = text.split("\n");
  const last = lines.length - 1;
  if (!lines[last].startsWith("Next:")) return `${text}\n${hint}`;
  return [...lines.slice(0, last), hint, lines[last]].join("\n");
}

// Adds `key` to a JSON object result; other results stay as they are.
function withJsonField(json: unknown, key: string, value: string | null): unknown {
  if (!value || !json || typeof json !== "object" || Array.isArray(json)) return json;
  return { ...json, [key]: value };
}

export function withJsonChangelogHint(json: unknown, hint: string | null): unknown {
  return withJsonField(json, "changelog_hint", hint);
}

/** Adds the one-time notice after this device was registered again (see `reregisterNotice`). */
export function withDeviceNotice(text: string, as?: string): string {
  const notice = reregisterNotice(as);
  return notice ? withChangelogHint(text, notice) : text;
}

export async function hintedToolResult(tool: string, text: string, as?: string): Promise<string> {
  const unread = tool !== "huddo_changelog" && (await hasUnreadChangelog());
  return withDeviceNotice(unread ? withChangelogHint(text, MCP_CHANGELOG_HINT) : text, as);
}

/**
 * The hints one CLI command adds around its output: the changelog hint, and the notice after this device was
 * registered again. The notice is read when first needed, so a run that ends early leaves it for the next command, and
 * printed once. `huddo daemon run` never takes it: its stderr goes to daemon.log, where the agent doesn't read it.
 */
export class CliHints {
  changelog: string | null = null;
  private device: string | null = null;
  private devicePrinted = false;
  private readonly daemon: boolean;

  constructor(
    private readonly as: string | undefined,
    positionals: readonly string[],
  ) {
    this.daemon = positionals[0] === "daemon" && positionals[1] === "run";
  }

  private deviceNotice(): string | null {
    if (!this.daemon) this.device ??= reregisterNotice(this.as);
    return this.device;
  }

  json(result: unknown): unknown {
    return withJsonChangelogHint(withJsonField(result, "device_notice", this.deviceNotice()), this.changelog);
  }

  /** The stderr lines after the command; the notice may come from a registration the daemon did meanwhile. */
  lines(): string {
    return `${this.changelog ? `${this.changelog}\n` : ""}${this.deviceLine()}`;
  }

  /** The notice as one stderr line, at most once per process. */
  deviceLine(): string {
    const notice = this.deviceNotice();
    if (!notice || this.devicePrinted) return "";
    this.devicePrinted = true;
    return `${notice}\n`;
  }
}

export async function readChangelog(updateCommand: string, now = Date.now()) {
  const state = await refresh(loadState(), now);
  const unread = unreadEntries(state.entries, state.cursor);
  const latest = latestVersion(state.entries, state.cursor);
  saveState({ ...state, cursor: latest });
  const updateAvailable = isNewer(latest, VERSION);
  const note = updateAvailable ? `Your client is ${VERSION}. To get these changes, ${updateCommand}.` : null;
  const body = unread.length > 0 ? formatChangelog(unread) : "No unread changes.";
  return {
    json: { entries: unread, latest, current: VERSION, update_available: updateAvailable },
    text: note ? `${body}\n\n${note}` : body,
  };
}

export const CHANGELOG_TOOL = {
  description: "Show what changed in Huddo since you last called this. A tool result tells you when there is something new.",
  properties: {},
  run: async () => (await readChangelog("run huddo update, then restart this MCP server")).text,
};
