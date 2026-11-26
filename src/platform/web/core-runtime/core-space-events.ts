import type { CoreSignedEvent, CoreSpaceEvent, CoreSpaceEvents } from "../../../application/runtime/core-space-port";
import type { CoreClient } from "./client";
import { unknownOutcome, type CallKind } from "./protocol";

type Envelope = { ok?: Record<string, unknown>; err?: { code: string; message: string } };

export function createCoreSpaceEvents(client: Pick<CoreClient, "call">, slug: string): CoreSpaceEvents {
  async function ok(kind: CallKind, name: string, payload: unknown): Promise<Record<string, unknown>> {
    const body = kind === "request" ? { v: 2, name, payload } : payload;
    const outcome = await client.call(kind, JSON.stringify(body));
    if (outcome.status === "unknown") throw unknownOutcome(`${name}`, outcome);
    const envelope = JSON.parse(outcome.envelope) as Envelope;
    if (!envelope.ok) throw new Error(`${name}: ${envelope.err?.code}: ${envelope.err?.message}`);
    return envelope.ok;
  }
  return {
    async submit(events, isEncrypted, betaCode) {
      const payload = {
        events,
        ...(isEncrypted === undefined ? {} : { is_encrypted: isEncrypted }),
        ...(betaCode ? { beta_code: betaCode } : {}),
      };
      const result = await ok("request", "submit_space_events", payload);
      return { server_emitted_events: (result.server_emitted_events as CoreSpaceEvent[] | undefined) ?? [] };
    },
    async signer() {
      const identities = await ok("query", "list_identities", { type: "list_identities" });
      const record = (identities.items as Array<{ slug: string; local_device_id: string; active_subkey_id: string }>).find(
        (item) => item.slug === slug,
      );
      if (!record) throw new Error(`${slug} is not in the core runtime`);
      return {
        slug,
        deviceId: record.local_device_id,
        subkeyId: record.active_subkey_id,
        sign: async (kind, payload) => (await ok("request", "sign_space_event", { kind, payload })) as unknown as CoreSignedEvent,
      };
    },
  };
}
