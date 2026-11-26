import type { CoreClient } from "./client";
import { STALE_LEGACY_KEYS, type LegacyCerts } from "./legacy-identity";
import { unknownOutcome, type CallKind } from "./protocol";

export type LegacyAccount = Readonly<{ slug: string; deviceId: string; subkeyId: string }>;

export type LegacyRow = Readonly<{
  envelope_id: string;
  sender_slug: string;
  verify_status?: string;
  channel_id?: string | null;
}>;

export const LEGACY_BACKFILL_LIMIT = 2000;

export type MigrationDeps = Readonly<{
  client: Pick<CoreClient, "call">;
  fetchCerts(account: LegacyAccount): Promise<LegacyCerts | null>;
}>;

export type ImportCounts = Readonly<{ imported: number; skipped: number; unsynced: number }>;

export type MigrationReport = Readonly<{ identity: "imported" | "present"; backfilled: number } & ImportCounts>;

const LOOKUP_BATCH = 200;

type Envelope = { ok?: Record<string, unknown>; err?: { code: string; message: string } };

async function ok(client: MigrationDeps["client"], kind: CallKind, payload: unknown): Promise<Record<string, unknown>> {
  const outcome = await client.call(kind, JSON.stringify(payload));
  if (outcome.status === "unknown") throw unknownOutcome(`${kind}`, outcome);
  const envelope = JSON.parse(outcome.envelope) as Envelope;
  if (!envelope.ok) throw new Error(`${envelope.err?.code}: ${envelope.err?.message}`);
  return envelope.ok;
}

export function importableRow(row: LegacyRow): boolean {
  return (
    row.verify_status === "verified" &&
    row.sender_slug !== "system" &&
    !row.envelope_id.startsWith("local-membership-") &&
    !row.envelope_id.startsWith("mcr_")
  );
}

/** Opens the account's core session unless this runtime already has it open. */
export async function ensureSession(client: MigrationDeps["client"], slug: string): Promise<void> {
  const status = await ok(client, "query", { type: "runtime_status" });
  if ((status.open_sessions as string[] | undefined)?.includes(slug)) return;
  await ok(client, "execute", { type: "open_session", slug });
}

export const STALE_IMPORT_RETRY_DELAYS_MS = [250, 750, 1500, 3000] as const;

const isStaleImport = (error: unknown) => error instanceof Error && error.message.startsWith(`${STALE_LEGACY_KEYS}:`);

/** Puts the signed-in account into the core runtime and opens its session; safe to repeat. When the keys
 * rotate under the import, re-reads the account and tries again a few times. */
export async function importIdentity(
  client: MigrationDeps["client"],
  account: LegacyAccount,
  fetchCerts: MigrationDeps["fetchCerts"],
  reloadAccount: () => Promise<LegacyAccount | null>,
  delays: readonly number[] = STALE_IMPORT_RETRY_DELAYS_MS,
): Promise<MigrationReport["identity"]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await importIdentityOnce(client, account, fetchCerts);
    } catch (error) {
      if (!isStaleImport(error) || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      account = (await reloadAccount()) ?? account;
    }
  }
}

async function importIdentityOnce(
  client: MigrationDeps["client"],
  account: LegacyAccount,
  fetchCerts: MigrationDeps["fetchCerts"],
): Promise<MigrationReport["identity"]> {
  const identities = await ok(client, "query", { type: "list_identities" });
  const item = (identities.items as Array<{ slug: string; local_device_id?: string }>).find((entry) => entry.slug === account.slug);
  const present = item !== undefined && item.local_device_id === account.deviceId;
  if (item && !present) await ok(client, "execute", { type: "remove_from_this_device", slug: account.slug });
  if (!present) {
    const certs = await fetchCerts(account);
    if (!certs) throw new Error(`certificates for ${account.slug} are not on the server`);
    await ok(client, "migrate", certs);
  }
  await ensureSession(client, account.slug);
  return present ? "present" : "imported";
}

/** The importable rows core does not hold yet. */
export async function rowsMissingFromCore(client: MigrationDeps["client"], rows: readonly LegacyRow[]): Promise<LegacyRow[]> {
  const importable = rows.filter(importableRow);
  const held = new Set<string>();
  for (let start = 0; start < importable.length; start += LOOKUP_BATCH) {
    const ids = importable.slice(start, start + LOOKUP_BATCH).map((row) => row.envelope_id);
    const found = (await ok(client, "query", { type: "get_messages", envelope_ids: ids })).items as Array<{ envelope_id: string }>;
    for (const item of found) held.add(item.envelope_id);
  }
  return importable.filter((row) => !held.has(row.envelope_id));
}

/** Pulls the server-kept history of every channel the TypeScript store has rows for; rows core cannot import
 * (from before the account joined) come back this way. Returns the rows stored. */
export async function backfillLegacyChannels(
  client: MigrationDeps["client"],
  rows: readonly LegacyRow[],
  limit = LEGACY_BACKFILL_LIMIT,
): Promise<number> {
  const channels = [...new Set(rows.filter(importableRow).flatMap((row) => (row.channel_id ? [row.channel_id] : [])))];
  let stored = 0;
  for (const channel_id of channels) {
    const outcome = await client
      .call("request", JSON.stringify({ v: 2, name: "backfill_channel_history", payload: { channel_id, limit } }))
      .catch(() => null);
    if (outcome?.status === "done") stored += (JSON.parse(outcome.envelope) as Envelope & { ok?: { stored?: number } }).ok?.stored ?? 0;
  }
  return stored;
}

/** Copies the TypeScript store's verified rows into core. */
export async function importHistory(
  client: MigrationDeps["client"],
  rows: readonly LegacyRow[],
  batchSize = 200,
): Promise<ImportCounts> {
  const importable = rows.filter(importableRow);
  let imported = 0;
  let skipped = 0;
  let unsynced = 0;
  for (let start = 0; start < importable.length; start += batchSize) {
    const counts = (await ok(client, "execute", {
      type: "import_local_history",
      messages: importable.slice(start, start + batchSize),
    })) as Record<string, number>;
    imported += counts.imported;
    skipped += counts.skipped_existing + counts.skipped_unusable + counts.skipped_denied;
    unsynced += counts.skipped_unsynced;
  }
  return { imported, skipped, unsynced };
}
