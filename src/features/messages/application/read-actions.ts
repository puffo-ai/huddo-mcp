export interface ReadActionsReporter {
  channel(channelId: string): void;
  dm(peerSlug: string): void;
  flush(): void | Promise<void>;
}

export interface ReadActionsProjection {
  channel(channelId: string): void;
  dm(selfSlug: string, peerSlug: string): void;
}

export function markChannelRead(projection: ReadActionsProjection, reporter: ReadActionsReporter, channelId: string): void {
  projection.channel(channelId);
  reporter.channel(channelId);
}

export function markDmRead(projection: ReadActionsProjection, reporter: ReadActionsReporter, selfSlug: string, peerSlug: string): void {
  if (selfSlug) projection.dm(selfSlug, peerSlug);
  reporter.dm(peerSlug);
}

export async function markChannelAllRead(
  projection: ReadActionsProjection,
  reporter: ReadActionsReporter,
  channelId: string,
): Promise<void> {
  projection.channel(channelId);
  reporter.channel(channelId);
  await reporter.flush();
}

export async function markDmAllRead(
  projection: ReadActionsProjection,
  reporter: ReadActionsReporter,
  selfSlug: string,
  peerSlug: string,
): Promise<void> {
  if (selfSlug) projection.dm(selfSlug, peerSlug);
  reporter.dm(peerSlug);
  await reporter.flush();
}
