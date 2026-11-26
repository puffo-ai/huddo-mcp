import type { CoreSpaceEvent, CoreSpaceEvents } from "../application/runtime/core-space-port";
import { generateEventNonce, generateEventUuid } from "../event/signed-space-event";
import type { SpaceCommandPort } from "../features/spaces/application";

type Nonce = () => string;
type CryptoOps = Parameters<typeof generateEventUuid>[0];

export const nonceFrom = (crypto: CryptoOps): Nonce => () => generateEventNonce(crypto);

export function leaveEvents(
  spaceId: string,
  removeFirst: readonly string[],
  newOwner: string | undefined,
  nonce: Nonce,
  now = Date.now(),
): CoreSpaceEvent[] {
  return [
    ...removeFirst.map((removed) => ({
      kind: "remove_from_space",
      payload: { space_id: spaceId, removed_slug: removed, effective_from: now, nonce: nonce() },
    })),
    ...(newOwner
      ? [{ kind: "transfer_space_ownership", payload: { space_id: spaceId, new_owner_slug: newOwner, issued_at: now, nonce: nonce() } }]
      : []),
    { kind: "leave_space", payload: { space_id: spaceId, effective_from: now, nonce: nonce() } },
  ];
}

export const transferEvent = (spaceId: string, newOwner: string, nonce: Nonce, now = Date.now()): CoreSpaceEvent => ({
  kind: "transfer_space_ownership",
  payload: { space_id: spaceId, new_owner_slug: newOwner, issued_at: now, nonce: nonce() },
});

export const removeEvent = (spaceId: string, removed: string, nonce: Nonce, now = Date.now()): CoreSpaceEvent => ({
  kind: "remove_from_space",
  payload: { space_id: spaceId, removed_slug: removed, effective_from: now, nonce: nonce() },
});

/** Space and channel creation through the core runtime; Huddo rooms are plaintext. */
export function coreSpaceCommands(core: CoreSpaceEvents, crypto: CryptoOps, betaCode?: string): SpaceCommandPort {
  const nonce = nonceFrom(crypto);
  return {
    async createSpace(name) {
      const spaceId = `sp_${generateEventUuid(crypto)}`;
      const joinedAt = Date.now();
      const response = await core.submit(
        [{ kind: "create_space", payload: { space_id: spaceId, name, created_at: joinedAt, nonce: nonce() } }],
        undefined,
        betaCode,
      );
      const general = response.server_emitted_events.find((event) => event.kind === "create_channel");
      return {
        spaceId,
        name,
        joinedAt,
        defaultChannel: general
          ? {
              channelId: general.payload.channel_id as string,
              name: general.payload.name as string,
              isPublic: general.payload.is_public === true,
            }
          : undefined,
      };
    },
    async createChannel(spaceId, name) {
      const channelId = `ch_${generateEventUuid(crypto)}`;
      await core.submit(
        [{ kind: "create_channel", payload: { space_id: spaceId, channel_id: channelId, name, created_at: Date.now(), nonce: nonce() } }],
        false,
      );
      return { channelId, spaceId, name, isEncrypted: false };
    },
  };
}
