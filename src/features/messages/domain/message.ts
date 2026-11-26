export const VerifyStatus = {
  Verified: "verified",
  Pending: "pending",
  VerifyFailed: "verify_failed",
  OpenFailed: "open_failed",
} as const;

export type VerifyStatus = (typeof VerifyStatus)[keyof typeof VerifyStatus];

export interface StoredMessage {
  envelope_id: string;
  seq?: number | null;
  envelope_kind: string;
  sender_slug: string;
  channel_id: string | null;
  space_id: string | null;
  recipient_slug: string | null;
  content_type: string;
  content: unknown;
  sent_at: number;
  received_at: number;
  thread_root_id: string | null;
  reply_to_id: string | null;
  is_visible_to_human: boolean;
  verify_status: VerifyStatus;
  send_state?: "pending" | "failed";
}

export interface MessageWrite {
  envelope_id: string;
  seq?: number | null;
  envelope_kind?: string;
  sender_slug: string;
  channel_id?: string | null;
  space_id?: string | null;
  recipient_slug?: string | null;
  content_type?: string;
  content: unknown;
  sent_at?: number;
  thread_root_id?: string | null;
  reply_to_id?: string | null;
  is_visible_to_human?: boolean;
}

export interface MessageWriteOptions {
  verifyStatus?: VerifyStatus;
  rawEnvelope?: Uint8Array | null;
}

export type MessageWriteContent = Omit<MessageWrite, "envelope_id">;

export interface MessageReadCursor {
  seq: number;
  envelopeId: string;
}

export interface RootReadCursorSnapshot {
  scopeType: "channel" | "direct";
  scopeId: string;
  seq: number;
}

export interface ReadCursorSnapshotResult {
  readChannelIds: string[];
  readDmPeerSlugs: string[];
}

export interface MentionedMessage {
  message: StoredMessage;
}

export interface SenderActivity {
  channelId: string | null;
  dmPeer: string | null;
  count: number;
  lastAt: number;
}
