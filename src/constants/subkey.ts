// Subkey lifecycle timing — shared between keystore (session expiry checks),
// http/ws clients (rotation decisions), and identity/certs/subkey (TTL stamped
// onto each new SubkeyCert).

export const SUBKEY_TTL_HOURS = 47;
export const SUBKEY_TTL_MS = SUBKEY_TTL_HOURS * 3_600_000;
export const SUBKEY_ROTATION_MARGIN_MS = 5 * 60 * 1000;
