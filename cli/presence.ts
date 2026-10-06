import { join } from "node:path";
import {
  fetchPresence,
  reportPresence as putPresence,
  type LivePresenceState,
  type PresenceMap,
} from "../src/huddo/presence";
import { identityDir, readJson, writeJson } from "./home";
import type { Account } from "./runtime";

const BEST_EFFORT_MS = 5_000;

interface PresenceFile {
  manual?: { state: LivePresenceState; note: string | null };
}

const filePath = (slug: string) => join(identityDir(slug), "presence.json");
const load = (slug: string): PresenceFile => readJson<PresenceFile>(filePath(slug)) ?? {};

export function reportPresence(acct: Account, state: LivePresenceState): Promise<void> {
  const manual = load(acct.identity.slug).manual;
  const note = manual?.state === state ? manual.note : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    putPresence(acct.http, state, note).catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, BEST_EFFORT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function setPresence(acct: Account, state: LivePresenceState, note: string | null): Promise<void> {
  writeJson(filePath(acct.identity.slug), { manual: { state, note } } satisfies PresenceFile);
  await putPresence(acct.http, state, note);
}

export function readPresence(acct: Account, slugs: string[]): Promise<PresenceMap> {
  return fetchPresence(acct.http, slugs);
}
