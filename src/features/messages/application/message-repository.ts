import type {
  FollowedThreadSummary,
  MentionedMessage,
  MessageReadCursor,
  ReadCursorSnapshotResult,
  RootReadCursorSnapshot,
  ThreadReadCursorSnapshot,
  MessageWrite,
  MessageWriteContent,
  MessageWriteOptions,
  SenderActivity,
  StoredMessage,
  VerifyStatus,
} from "../domain/message";

export interface MessageRepository {
  bindMessageReplayOwner(runtimeId: string, generation: string): Promise<void>;
  claimMessageReplay(runtimeId: string, generation: string, replayKey: string): Promise<boolean>;
  releaseMessageReplay(runtimeId: string, generation: string, replayKey: string): Promise<void>;
  setBlockedSenders(slugs: string[]): Promise<void>;
  flush(): Promise<void>;
  init(): Promise<void>;
  bind(selfSlug: string): Promise<void>;
  unbind(): Promise<void>;
  getSelfSlug(): Promise<string | null>;
  getSendOutboxRecord(idempotencyKey: string): Promise<SendOutboxRecord | null>;
  enqueueSendOutbox(idempotencyKey: string, draftPayload: Uint8Array): Promise<SendOutboxRecord>;
  persistSealedSendOutbox(idempotencyKey: string, envelopeId: string, sealedPayload: Uint8Array): Promise<void>;
  commitSendOutbox(
    idempotencyKey: string,
    receiptPayload: Uint8Array,
    message: MessageWrite,
  ): Promise<void>;
  failSendOutbox(idempotencyKey: string): Promise<void>;
  retireSendOutbox(idempotencyKey: string): Promise<void>;
  listPendingSendOutbox(): Promise<SendOutboxRecord[]>;
  getAppliedSpacesMembership(idempotencyKey: string): Promise<{
    mutationPayload: Uint8Array;
    projectionPayload: Uint8Array;
  } | null>;
  getAppliedSpacesMembershipForOwner(selfSlug: string, idempotencyKey: string): Promise<{
    mutationPayload: Uint8Array;
    projectionPayload: Uint8Array;
  } | null>;
  persistAppliedSpacesMembership(
    idempotencyKey: string,
    mutationPayload: Uint8Array,
    projectionPayload: Uint8Array,
  ): Promise<void>;
  persistAppliedSpacesMembershipForOwner(
    selfSlug: string,
    idempotencyKey: string,
    mutationPayload: Uint8Array,
    projectionPayload: Uint8Array,
  ): Promise<void>;
  backfillUnattributed(channelIds?: string[]): Promise<number>;
  validateParent(
    parentId: string | null | undefined,
    channelId: string | null | undefined,
    spaceId: string | null | undefined,
  ): Promise<string | null>;
  resolveThreadRoot(
    parentId: string | null | undefined,
    channelId: string | null | undefined,
    spaceId: string | null | undefined,
  ): Promise<string | null>;
  saveMessage(
    message: MessageWrite,
    receivedAt?: number,
    options?: MessageWriteOptions,
  ): Promise<void>;
  updateVerifyStatus(envelopeId: string, status: VerifyStatus): Promise<void>;
  upgradeOpenFailedRow(
    envelopeId: string,
    message: MessageWriteContent,
    status: VerifyStatus,
  ): Promise<void>;
  getPendingVerifies(): Promise<{ envelope_id: string; sender_slug: string }[]>;
  getRawEnvelope(envelopeId: string): Promise<Uint8Array | null>;
  hasMessage(envelopeId: string): Promise<boolean>;
  hasFinishedMessageProjection(envelopeId: string): Promise<boolean>;
  markMessageProjected(envelopeId: string): Promise<void>;
  recordMessageProjectionFailure(envelopeId: string, maxAttempts: number): Promise<boolean>;
  getPost(envelopeId: string): Promise<StoredMessage | null>;
  resolveMessageChannelId(
    message: Pick<StoredMessage, "channel_id" | "thread_root_id">,
  ): Promise<string | null>;
  updateMessageSeq(envelopeId: string, seq: number): Promise<void>;
  getChannelReadCursor(channelId: string): Promise<MessageReadCursor | null>;
  getDmReadCursor(peerSlug: string): Promise<MessageReadCursor | null>;
  getThreadReadCursor(threadRootId: string): Promise<MessageReadCursor | null>;
  getReadCursorWatermark(): Promise<number | null>;
  applyThreadReadCursor(
    threadRootId: string,
    seq: number,
    envelopeId?: string,
  ): Promise<void>;
  applyReadCursorSnapshot(
    roots: RootReadCursorSnapshot[],
    threads: ThreadReadCursorSnapshot[],
    watermark?: number | null,
  ): Promise<ReadCursorSnapshotResult>;
  getChannelHistory(
    channelId: string,
    limit?: number,
    before?: number,
  ): Promise<StoredMessage[]>;
  getDmHistory(
    peerSlug: string,
    limit?: number,
    before?: number,
  ): Promise<StoredMessage[]>;
  getChannelHistorySince(
    channelId: string,
    since: number,
    limit?: number,
  ): Promise<StoredMessage[]>;
  getDmHistorySince(
    peerSlug: string,
    since: number,
    limit?: number,
  ): Promise<StoredMessage[]>;
  getChannelActivity(): Promise<
    Record<string, { count: number; lastAt: number }>
  >;
  getSenderActivity(
    senderSlug: string,
    limit?: number,
  ): Promise<SenderActivity[]>;
  getLatestDmPerPeer(peerSlugs: string[]): Promise<Map<string, StoredMessage>>;
  getChannelHistoryAnchoredOnRoots(
    channelId: string,
    rootLimit?: number,
    before?: number,
  ): Promise<StoredMessage[]>;
  getDmHistoryAnchoredOnRoots(
    peerSlug: string,
    rootLimit?: number,
    before?: number,
  ): Promise<StoredMessage[]>;
  getThreadReplyStats(
    rootIds: string[],
    excludedReplyIds?: string[],
  ): Promise<Record<string, { total: number; unread: number }>>;
  getKnownDmPeers(mySlug: string): Promise<string[]>;
  getOutboundDmPeers(mySlug: string): Promise<string[]>;
  getThreadReplies(rootId: string): Promise<StoredMessage[]>;
  deleteDmMessages(mySlug: string, peerSlug: string): Promise<number>;
  deleteChannelMessages(channelId: string): Promise<number>;
  searchMessages(
    query: string,
    options?: { spaceId?: string | null; dmOnly?: boolean; limit?: number },
  ): Promise<StoredMessage[]>;
  setMessageSaved(envelopeId: string, saved: boolean): Promise<void>;
  isMessageSaved(envelopeId: string): Promise<boolean>;
  getMessageDecorations(
    envelopeIds: string[],
  ): Promise<Record<string, { saved: boolean; followed: boolean }>>;
  getSavedMessages(): Promise<{ message: StoredMessage; savedAt: number }[]>;
  isThreadAutoFollowed(threadRootId: string): Promise<boolean>;
  isThreadFollowed(threadRootId: string): Promise<boolean>;
  setThreadFollowOverride(
    threadRootId: string,
    following: boolean,
  ): Promise<void>;
  getThreadResumeReply(threadRootId: string): Promise<StoredMessage | null>;
  markThreadRead(threadRootId: string, atLeast?: number): Promise<void>;
  getThreadReads(): Promise<Record<string, number>>;
  getSenderSubkeyIndex(
    sender: string,
  ): Promise<{ pkBySubkeyId: Map<string, Uint8Array>; deviceIdBySubkeyId: Map<string, string>; since: string } | null>;
  saveSenderSubkeyIndex(
    sender: string,
    index: { pkBySubkeyId: Map<string, Uint8Array>; deviceIdBySubkeyId: Map<string, string>; since: string },
  ): Promise<void>;
  getUnfollowedThreadRoots(): Promise<Set<string>>;
  getChannelUnreadThreadReplies(): Promise<Record<string, number>>;
  getDmUnreadThreadReplies(): Promise<Record<string, number>>;
  getFirstUnreadThreadRootForChannel(channelId: string): Promise<string | null>;
  getFirstUnreadThreadRootForDm(peer: string): Promise<string | null>;
  markAllThreadsRead(): Promise<string[]>;
  markChannelThreadsRead(channelId: string): Promise<string[]>;
  markDmThreadsRead(peerSlug: string): Promise<string[]>;
  getFollowedThreadsOverview(
    scope: string | { dmsOnly: true } | { all: true },
  ): Promise<FollowedThreadSummary[]>;
  countUnreadFollowedThreads(spaceId: string): Promise<number>;
  getMentionedMessages(): Promise<MentionedMessage[]>;
  getSpaceNotes(spaceId: string): Promise<StoredMessage[]>;
  getAllNotes(): Promise<StoredMessage[]>;
  getChannelThreadNotes(channelId: string): Promise<Map<string, StoredMessage>>;
  cleanup(retentionDays?: number): Promise<void>;
  count(): Promise<number>;
  getLatestSentAt(): Promise<number | null>;
  getMessagesInWindow(fromTs: number, toTs: number): Promise<StoredMessage[]>;
  getThreadHistoriesThrough(rootIds: string[], toTs: number): Promise<StoredMessage[]>;
}

export type SendOutboxRecord = Readonly<{
  sequence: number;
  idempotencyKey: string;
  draftPayload: Uint8Array;
  stage: "queued" | "sealed" | "committed" | "failed";
  envelopeId: string | null;
  sealedPayload: Uint8Array | null;
  receiptPayload: Uint8Array | null;
}>;
