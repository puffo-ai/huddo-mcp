
export const PENDING_PASSKEY_STORAGE_KEY = "puffo.pending_passkey.v1";

export interface PendingPasskeyEnrollment {
  dekB64?: string;
  slug: string;
  email: string;
  serverUrl: string;
}

export function stashPendingPasskey(payload: PendingPasskeyEnrollment): void {
  sessionStorage.setItem(PENDING_PASSKEY_STORAGE_KEY, JSON.stringify(payload));
}

export function readPendingPasskey(): PendingPasskeyEnrollment | null {
  const raw = sessionStorage.getItem(PENDING_PASSKEY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingPasskeyEnrollment;
  } catch {
    sessionStorage.removeItem(PENDING_PASSKEY_STORAGE_KEY);
    return null;
  }
}

export function clearPendingPasskey(): void {
  sessionStorage.removeItem(PENDING_PASSKEY_STORAGE_KEY);
}
