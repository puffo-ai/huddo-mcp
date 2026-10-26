import type { PendingInvite } from "../domain";

export interface InvitationProjection {
  replace(snapshot: {
    incoming?: PendingInvite[];
    outgoing?: PendingInvite[];
  }): boolean | void;
  remove(id: string): void;
}

export async function resolveInvitation(
  projection: InvitationProjection,
  request: () => Promise<void>,
  id: string,
): Promise<void> {
  await request();
  projection.remove(id);
}
