import { reportPresence as putPresence } from "../src/huddo/presence";
import type { Account } from "./runtime";

const BEST_EFFORT_MS = 5_000;

// Best effort: never rejects and gives up waiting after 5s. A failure goes to
// `onError` (the daemon logs it and checks its device on cert_not_found).
export function reportPresence(acct: Account, onError: (e: unknown) => void = () => undefined): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    putPresence(acct.http).catch(onError),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, BEST_EFFORT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}
