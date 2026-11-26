import type { CoreReadState, ReadCursor, UnreadSummary } from "../../../application/runtime/core-read-state-port";
import type { CoreClient } from "./client";
import { unknownOutcome, type CallKind } from "./protocol";

type Envelope = { ok?: Record<string, unknown>; err?: { code: string; message: string } };

export function createCoreReadState(client: Pick<CoreClient, "call">): CoreReadState {
  async function ok(kind: CallKind, name: string, body: unknown): Promise<Record<string, unknown>> {
    const outcome = await client.call(kind, JSON.stringify(body));
    if (outcome.status === "unknown") throw unknownOutcome(`${name}`, outcome);
    const envelope = JSON.parse(outcome.envelope) as Envelope;
    if (!envelope.ok) throw new Error(`${name}: ${envelope.err?.code}: ${envelope.err?.message}`);
    return envelope.ok;
  }
  const request = (name: string, payload: unknown) => ok("request", name, { v: 2, name, payload });
  const query = (type: string) => ok("query", type, { type });
  return {
    async markRead(scopeType, scopeId, upToSeq, upToEnvelopeId) {
      const result = await request("mark_read", {
        scope_type: scopeType,
        scope_id: scopeId,
        ...(upToSeq === undefined ? {} : { up_to_seq: upToSeq }),
        ...(upToEnvelopeId === undefined ? {} : { up_to_envelope_id: upToEnvelopeId }),
      });
      return (result.cursor as ReadCursor | null) ?? null;
    },
    async sync() {
      return ((await request("sync_read_cursors", {})).changed as ReadCursor[] | undefined) ?? [];
    },
    async cursors() {
      return ((await query("read_cursors")).items as ReadCursor[] | undefined) ?? [];
    },
    async unreadSummary() {
      const result = (await query("unread_summary")) as Partial<UnreadSummary>;
      return { channels: result.channels ?? [], directs: result.directs ?? [] };
    },
  };
}
