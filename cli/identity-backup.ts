import { HttpError } from "../src/http/types";
import { openIdentityEscrow, sealIdentityEscrow } from "../src/identity/primitives/backup";
import type { StoredIdentity } from "../src/identity/primitives/keystore";
import type { Account } from "./runtime";
import { cliWords, keepKeyHint } from "../src/huddo/agent-guide";

export const BACKUP_PATH = "/v2/identity/backups";
export const KEY_PREFIX = "hk_";

/** The rule for a recovery code in the CLI, with the code in the sentence that the agent says to the person. */
export function keepKeyHintFor(key: string): string {
  return keepKeyHint(cliWords(""), key);
}

export interface BackupStatus {
  created_at_ms: number;
}

type PublicApi = {
  postUnsigned<T>(path: string, body?: Record<string, unknown>): Promise<T>;
  deleteUnsigned<T>(path: string, body?: Record<string, unknown>): Promise<T>;
};

export async function createBackup(acct: Account): Promise<string> {
  const escrow = await sealIdentityEscrow(acct.identity);
  const res = await acct.http.post<{ key: string }>(BACKUP_PATH, { escrow: { ...escrow } });
  return res.key;
}

/** This identity's backups, oldest first; the server leaves out hosted MCP's. */
export async function backupStatus(acct: Account): Promise<BackupStatus[]> {
  return (await acct.http.get<{ backups: BackupStatus[] }>(BACKUP_PATH)).backups;
}

export class BackupKeyError extends Error {}

const NO_BACKUP = "no backup has this recovery code (it was removed)";

/** Calls a public backup endpoint with a key; the key is the only proof it needs. */
async function withKey<T>(action: "recovery" | "removal", key: string, call: (key: string) => Promise<T>): Promise<T> {
  const trimmed = key.trim();
  if (!trimmed.startsWith(KEY_PREFIX)) throw new BackupKeyError(`a recovery code starts with ${KEY_PREFIX}`);
  return call(trimmed).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) throw new BackupKeyError(NO_BACKUP);
    if (e instanceof HttpError && e.status === 429) throw new BackupKeyError(`too many backup ${action} attempts from this address; try again in an hour`);
    throw e;
  });
}

/** Removes the backup a key opens; the slug it belonged to comes back. */
export async function removeBackup(http: PublicApi, key: string): Promise<string> {
  const { results } = await withKey("removal", key, (k) =>
    http.deleteUnsigned<{ results: Array<{ removed: boolean; slug?: string }> }>(BACKUP_PATH, { keys: [k] }),
  );
  const [result] = results;
  if (!result?.removed || !result.slug) throw new BackupKeyError(NO_BACKUP);
  return result.slug;
}

/** The identity a recovery code opens; the server returns the escrow and its key, and this process opens it. */
export async function openBackup(http: PublicApi, key: string): Promise<StoredIdentity> {
  const res = await withKey("recovery", key, (k) =>
    http.postUnsigned<{ slug: string; ciphertext: string; key: string }>(`${BACKUP_PATH}/recovery`, { key: k }),
  );
  const identity = await openIdentityEscrow(res.ciphertext, res.key);
  if (identity.slug !== res.slug) throw new BackupKeyError("the backup does not match its identity");
  return identity;
}
