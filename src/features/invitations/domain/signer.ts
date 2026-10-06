export interface InvitationSignerSession {
  slug: string;
  deviceId: string;
  subkeyId: string;
  subkeySecretKey: Uint8Array;
}
