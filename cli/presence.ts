import { fetchPresence, reportPresence as putPresence, type PresenceMap } from "../src/huddo/presence";
import type { Account } from "./runtime";

const BEST_EFFORT_MS = 5_000;

export function reportPresence(acct: Account): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    putPresence(acct.http).catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, BEST_EFFORT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function readPresence(acct: Account, slugs: string[]): Promise<PresenceMap> {
  return fetchPresence(acct.http, slugs);
}
