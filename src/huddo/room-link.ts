// No imports, so Pages Functions can use it too.

/** huddo-server's public lookup from a room id to the room's newest live invite code. */
export const roomLinkPath = (spaceId: string) => `/v2/invitations/rooms/${encodeURIComponent(spaceId)}`;

/** The room id in a bare `sp_...` id or a `/chat/<room>` or `/join/<room>` link; null for anything else, an invite included. */
export function roomIdFromJoinTarget(target: string): string | null {
  const trimmed = target.trim();
  if (/^sp_[\w-]+$/.test(trimmed)) return trimmed;
  const path = /^https?:\/\/[^/?#]+(\/[^?#]*)/i.exec(trimmed)?.[1];
  return path ? (/^\/(?:chat|join)\/(sp_[\w-]+)\/?$/.exec(path)?.[1] ?? null) : null;
}

export function roomLinkCode(body: unknown): string | null {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : null;
}
