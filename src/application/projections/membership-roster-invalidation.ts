type RosterInvalidator = {
  removeChannel(channelId: string): void;
  removeSpace(spaceId: string): void;
};

let invalidator: RosterInvalidator | null = null;

export function registerMembershipRosterInvalidator(next: RosterInvalidator): () => void {
  invalidator = next;
  return () => {
    if (invalidator === next) invalidator = null;
  };
}

export function invalidateChannelRoster(channelId: string): void {
  invalidator?.removeChannel(channelId);
}

export function invalidateSpaceRoster(spaceId: string): void {
  invalidator?.removeSpace(spaceId);
}
