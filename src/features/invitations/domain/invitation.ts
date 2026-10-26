export type InviteKind = "slug" | "email";

export interface PendingInvite {
  invitation_event_id: string;
  kind: InviteKind;
  scope: "space" | "channel";
  space_id: string;
  channel_id?: string;
  inviter_slug: string;
  invitee_slug: string;
  invitee_email?: string;
  space_name?: string;
  channel_name?: string;
  issued_at: number;
}
