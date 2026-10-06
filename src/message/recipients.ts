import type { PuffoHttpClient } from "../http/client";
import type { CryptoOps } from "../http/types";
import { HttpError } from "../http/types";

export interface RecipientDevice {
  device_id: string;
  // The slug that owns this device (from the device_cert). Surfaced
  // separately so callers can run an envelope-side membership check
  // before posting — the server enforces the same rule (PR puffo-
  // server#54), but failing client-side gives a useful error
  // message and avoids the round-trip.
  slug: string;
  kem_public_key: Uint8Array;
}

// /certs/active response shape — see puffo-server certs.rs::CertsActiveResponse.
interface CertsActiveEntry {
  slug: string;
  device_id: string;
  kem_public_key: string;
  signing_public_key: string;
  created_at: number;
}

interface CertsActiveResponse {
  devices: CertsActiveEntry[];
}

// Legacy /certs/sync shape — still used by ``fetchSenderSubkeyPks``
// below to walk the historical subkey chain.
interface CertSyncEntry {
  seq: number;
  kind: string;
  slug: string;
  cert: Record<string, unknown>;
}

interface CertSyncResponse {
  entries?: CertSyncEntry[];
  cache?: {
    identities?: Record<string, Record<string, unknown>>;
    slug_bindings?: Record<string, Record<string, unknown>>;
    devices?: Record<string, Record<string, unknown>>;
    subkeys?: Record<string, Record<string, unknown>>;
    device_revocations?: Record<string, Record<string, unknown>>;
    operator_attestations?: Record<string, Record<string, unknown>>;
    operator_revocations?: Record<string, Record<string, unknown>>;
  };
  next_cursor?: string | null;
  has_more?: boolean;
}

const eventTime = (event: Record<string, unknown>): number | null => {
  const payload = event.payload;
  if (!payload || typeof payload !== "object") return null;
  for (const key of [
    "created_at",
    "issued_at",
    "accepted_at",
    "rejected_at",
    "cancelled_at",
    "effective_from",
    "redeemed_at",
    "revoked_at",
  ]) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  }
  return null;
};

export async function fetchSenderEventChain(
  http: PuffoHttpClient,
  event: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const slug = event.signer_slug;
  const deviceId = event.signer_device_id;
  const subkeyId = event.signer_subkey_id;
  const atMs = eventTime(event);
  if (typeof slug !== "string" || typeof deviceId !== "string"
    || typeof subkeyId !== "string" || atMs === null) return null;

  let since = "0";
  const byKind = new Map<string, Record<string, unknown>[]>();
  while (true) {
    const response: CertSyncResponse = await http.get<CertSyncResponse>(
      `/certs/sync?slugs=${encodeURIComponent(slug)}&since=${encodeURIComponent(since)}`,
    );
    if (response.cache) {
      const cache = response.cache;
      const identity = cache.identities?.[slug];
      const slugBinding = cache.slug_bindings?.[slug];
      const device = cache.devices?.[deviceId];
      const subkey = cache.subkeys?.[subkeyId];
      if (!identity || !slugBinding || !device || !subkey) return null;
      return {
        identity,
        slug_binding: slugBinding,
        device,
        subkey,
        device_revocations: Object.values(cache.device_revocations ?? {}),
        operator_attestation: cache.operator_attestations?.[slug] ?? null,
        operator_revocation: cache.operator_revocations?.[slug] ?? null,
        at_ms: atMs,
      };
    }
    const entries: CertSyncEntry[] = response.entries ?? [];
    for (const entry of entries) {
      if (entry.slug !== slug) continue;
      const values = byKind.get(entry.kind) ?? [];
      values.push(entry.cert);
      byKind.set(entry.kind, values);
    }
    const nextCursor = response.next_cursor;
    if (!nextCursor || nextCursor === since || response.has_more === false) break;
    since = nextCursor;
  }
  const matching = (kind: string, field: string, expected: string) =>
    (byKind.get(kind) ?? []).find((cert) => cert[field] === expected);
  const identity = byKind.get("identity_cert")?.at(-1);
  const slugBinding = byKind.get("slug_binding")?.at(-1);
  const device = matching("device_cert", "device_id", deviceId);
  const subkey = matching("subkey_cert", "subkey_id", subkeyId);
  if (!identity || !slugBinding || !device || !subkey) return null;
  return {
    identity,
    slug_binding: slugBinding,
    device,
    subkey,
    device_revocations: byKind.get("device_revocation") ?? [],
    operator_attestation: byKind.get("operator_attestation")?.at(-1) ?? null,
    operator_revocation: byKind.get("operator_revocation")?.at(-1) ?? null,
    at_ms: atMs,
  };
}

interface LegacyDeviceCert {
  device_id?: string;
  keys?: {
    encryption?: {
      public_key?: string;
    };
  };
}

const MAX_RECIPIENT_SLUG_QUERY_CHARS = 1_500;

function chunkRecipientSlugs(slugs: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const slug of slugs) {
    const candidate = [...current, slug];
    if (current.length > 0 && encodeURIComponent(candidate.join(",")).length > MAX_RECIPIENT_SLUG_QUERY_CHARS) {
      chunks.push(current);
      current = [slug];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// Send-time recipient resolution via /certs/active (returns the
// current device_cert per device_id, HPKE pubkey already extracted).
// Falls back to the legacy /certs/sync walk if the server is too old
// to expose /certs/active.
export async function fetchRecipientDevices(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  slugs: string[],
): Promise<RecipientDevice[]> {
  const unique = Array.from(new Set(slugs.filter(Boolean)));
  if (unique.length === 0) return [];

  const devices: CertsActiveEntry[] = [];
  for (const chunk of chunkRecipientSlugs(unique)) {
    try {
      const resp = await http.get<CertsActiveResponse>(
        `/certs/active?slugs=${encodeURIComponent(chunk.join(","))}`,
      );
      devices.push(...(resp.devices ?? []));
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return fetchRecipientDevicesFromLegacySync(http, crypto, unique);
      }
      throw err;
    }
  }

  const recipients: RecipientDevice[] = [];
  for (const entry of devices) {
    if (!entry.device_id || !entry.kem_public_key || !entry.slug) continue;
    try {
      recipients.push({
        slug: entry.slug,
        device_id: entry.device_id,
        kem_public_key: crypto.base64urlDecode(entry.kem_public_key),
      });
    } catch {
      /* malformed base64 — skip the entry */
    }
  }
  return recipients;
}

async function fetchRecipientDevicesFromLegacySync(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  slugs: string[],
): Promise<RecipientDevice[]> {
  const byDevice = new Map<string, { seq: number; slug: string; cert: LegacyDeviceCert }>();
  for (const chunk of chunkRecipientSlugs(slugs)) {
    let since = "0";
    const csv = chunk.join(",");
    while (true) {
      const resp = await http.get<CertSyncResponse>(
        `/certs/sync?slugs=${encodeURIComponent(csv)}&since=${encodeURIComponent(since)}&limit=500`,
      );
      const entries = resp.entries ?? [];
      if (entries.length === 0) break;

      for (const entry of entries) {
        since = String(entry.seq);
        if (entry.kind !== "device_cert") continue;
        const cert = entry.cert as LegacyDeviceCert;
        const deviceId = cert.device_id;
        if (!entry.slug || !deviceId) continue;
        const existing = byDevice.get(deviceId);
        if (!existing || entry.seq > existing.seq) {
          byDevice.set(deviceId, { seq: entry.seq, slug: entry.slug, cert });
        }
      }

      if (!resp.has_more) break;
    }
  }

  const recipients: RecipientDevice[] = [];
  for (const { slug, cert } of byDevice.values()) {
    const kemPublicKey = cert.keys?.encryption?.public_key;
    if (!cert.device_id || !kemPublicKey) continue;
    try {
      recipients.push({
        slug,
        device_id: cert.device_id,
        kem_public_key: crypto.base64urlDecode(kemPublicKey),
      });
    } catch {
      /* malformed legacy cert — skip */
    }
  }

  return recipients;
}

// Client-side mirror of the server's channel-member-recipient check.
// Surfaces the offending slug before the wire (server returns 403);
// `allowedSlugs` must come from the same local membership cache that
// produced `recipients`.
export function validateRecipientsForChannel(
  recipients: RecipientDevice[],
  allowedSlugs: Iterable<string>,
  channelId: string,
): void {
  const allowed = new Set(allowedSlugs);
  for (const r of recipients) {
    if (!allowed.has(r.slug)) {
      throw new Error(
        `recipient device ${r.device_id} belongs to ${r.slug}, who is not a member of channel ${channelId}`,
      );
    }
  }
}

// DM variant — sender's own devices (multi-device read-back) + the
// named peer's devices are the only allowed recipients.
export function validateRecipientsForDm(
  recipients: RecipientDevice[],
  senderSlug: string,
  peerSlug: string,
): void {
  const allowed = new Set([senderSlug, peerSlug]);
  for (const r of recipients) {
    if (!allowed.has(r.slug)) {
      throw new Error(
        `recipient device ${r.device_id} belongs to ${r.slug}, who is not part of this DM (sender=${senderSlug}, peer=${peerSlug})`,
      );
    }
  }
}

// Per-sender subkey pk index. `since` is the high-water /certs/sync
// `seq`; passing it back makes refresh a delta walk (subkey_certs are
// append-only).
export interface SenderSubkeyIndex {
  pkBySubkeyId: Map<string, Uint8Array>;
  deviceIdBySubkeyId: Map<string, string>;
  since: string;
}

export function emptySenderSubkeyIndex(): SenderSubkeyIndex {
  return { pkBySubkeyId: new Map(), deviceIdBySubkeyId: new Map(), since: "0" };
}

/// Durable home of the per-sender index.
export interface SenderCertStore {
  getSenderSubkeyIndex(sender: string): SenderSubkeyIndex | null | Promise<SenderSubkeyIndex | null>;
  saveSenderSubkeyIndex(sender: string, index: SenderSubkeyIndex): void | Promise<void>;
}

/// Cache lookup with durable-store fallback so a fresh boot doesn't
/// re-walk cert chains; stale entries self-heal via unknown_subkey.
export async function senderIndexFor(
  cache: Map<string, SenderSubkeyIndex>,
  sender: string,
  store?: SenderCertStore | null,
): Promise<SenderSubkeyIndex> {
  let index = cache.get(sender);
  if (!index) {
    index = (store ? await store.getSenderSubkeyIndex(sender) : null) ?? emptySenderSubkeyIndex();
    // Older durable caches did not retain the cert's device binding. Rewalk
    // the append-only cert chain once so candidate admission never invents or
    // guesses a device id for an otherwise cached subkey.
    if (index.deviceIdBySubkeyId.size < index.pkBySubkeyId.size) index.since = "0";
    cache.set(sender, index);
  }
  return index;
}

// Walk /certs/sync forward from `index.since`, mutating `index` with
// any new subkey_cert entries. Also returns it for chaining.
export async function refreshSenderSubkeyIndex(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  slug: string,
  index: SenderSubkeyIndex,
  store?: SenderCertStore | null,
): Promise<SenderSubkeyIndex> {
  let since = index.since;

  while (true) {
    const path = `/certs/sync?slugs=${encodeURIComponent(slug)}&since=${encodeURIComponent(since)}`;
    const resp = await http.get<CertSyncResponse>(path);
    const entries = resp.entries ?? [];
    if (entries.length === 0) break;

    for (const entry of entries) {
      if (entry.kind === "subkey_cert") {
        const subkeyId = entry.cert.subkey_id as string | undefined;
        const pkB64 = entry.cert.subkey_public_key as string | undefined;
        const deviceId = entry.cert.device_id as string | undefined;
        if (subkeyId && pkB64 && !index.pkBySubkeyId.has(subkeyId)) {
          try {
            index.pkBySubkeyId.set(subkeyId, crypto.base64urlDecode(pkB64));
            if (deviceId) index.deviceIdBySubkeyId.set(subkeyId, deviceId);
          } catch {
            /* malformed base64 — skip */
          }
        }
        if (subkeyId && deviceId && !index.deviceIdBySubkeyId.has(subkeyId)) {
          index.deviceIdBySubkeyId.set(subkeyId, deviceId);
        }
      }
      since = String(entry.seq);
    }

    if (!resp.has_more) break;
  }

  const advanced = since !== index.since;
  index.since = since;
  if (advanced) await store?.saveSenderSubkeyIndex(slug, index);
  return index;
}

// Legacy array-of-pks fetch used by event/invite, which doesn't
// know the inviter's subkey_id outside its own loop.
export async function fetchSenderSubkeyPks(
  http: PuffoHttpClient,
  crypto: CryptoOps,
  slug: string,
): Promise<Uint8Array[]> {
  const index = await refreshSenderSubkeyIndex(
    http, crypto, slug, emptySenderSubkeyIndex(),
  );
  return Array.from(index.pkBySubkeyId.values());
}
