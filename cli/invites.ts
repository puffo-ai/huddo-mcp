import { listInviteLinks, revokeInviteLink } from "../src/features/invitations/adapters/invitation-link-service";
import { INVITE_LINK_NEVER_EXPIRES_AT } from "../src/features/invitations/domain/capability";
import { invitePath } from "../src/huddo/config";
import { safeLine } from "../src/huddo/projection";
import { ORIGIN } from "./home";
import { account, currentRoom, errorText, type Ctx } from "./ops";
import { awaitCoreSpaceEvents } from "../src/application/runtime/core-space-port";
import { UserError } from "./text-args";

async function owned<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (e) {
    throw new UserError(errorText(e));
  }
}

function codeOf(linkOrCode: string): string {
  const last = linkOrCode.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop()!;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** The room's invite links, newest first: all of them for the owner side, the caller's own for other members. */
export async function listInvites(ctx: Ctx, roomArg?: string) {
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const links = (await owned(listInviteLinks(acct.http, room.spaceId))).sort((a, b) => b.created_at - a.created_at);
  const invites = links.map((l) => ({
    url: `${ORIGIN}${invitePath(l.short_code)}`,
    code: l.short_code,
    state: l.state,
    issuer: l.issuer_slug,
    uses: l.uses,
    maxUses: l.max_uses,
    createdAt: new Date(l.created_at).toISOString(),
    expiresAt: l.expires_at >= INVITE_LINK_NEVER_EXPIRES_AT ? null : new Date(l.expires_at).toISOString(),
  }));
  const lines = invites.map((i) =>
    [
      i.url,
      i.state,
      `by ${i.issuer}`,
      `${i.uses}${i.maxUses === null ? "" : `/${i.maxUses}`} uses`,
      `created ${i.createdAt}`,
      i.expiresAt ? `expires ${i.expiresAt}` : "never expires",
    ].join(" | "),
  );
  return {
    json: { spaceId: room.spaceId, room: room.name, invites },
    text: lines.length ? lines.join("\n") : `no invite links you can see in "${safeLine(room.name)}" (${room.spaceId})`,
  };
}

export async function revokeInvite(ctx: Ctx, linkOrCode: string, roomArg?: string) {
  const code = codeOf(linkOrCode);
  if (!code) throw new UserError("usage: huddo revoke-invite <invite link or code>");
  const acct = account(ctx);
  const room = await currentRoom(acct, roomArg);
  const link = (await owned(listInviteLinks(acct.http, room.spaceId))).find((l) => l.short_code === code);
  if (!link) throw new UserError(`no invite link ${code} that you can see in "${safeLine(room.name)}"; huddo list-invite shows them`);
  if (link.state !== "active") throw new UserError(`invite link ${code} is already ${link.state}`);
  const signer = await (await awaitCoreSpaceEvents()).signer();
  await owned(revokeInviteLink(acct.http, ctx.rt.crypto, signer, { shortCode: code, inviteId: link.invite_id, spaceId: room.spaceId }));
  return {
    json: { spaceId: room.spaceId, room: room.name, code, revoked: true },
    text: `revoked invite link ${code} in "${safeLine(room.name)}" (${room.spaceId}); nobody can join with it now`,
  };
}
