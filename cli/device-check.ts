import { HttpError } from "../src/http/types";

const REJOIN = "re-join with `huddo join <invite>` or remove this HUDDO_HOME";
export const KEEPS_HAPPENING = ` If this keeps happening, ${REJOIN}`;
const REVOKED_RECOVERY = "to use this identity here again, import a key backup with `huddo identity import <file> --passphrase P` or re-join with `huddo join <invite>`";

// Answers that a rotation can only fix if the server still accepts the device:
// auth 401 `reason`s (huddo-server auth.rs) and the subkey route's `error`s.
// `storage_error`, `signature_invalid` and `unknown` are left out on purpose,
// so a server with a broken database never makes its daemons stop.
const MEANING: Record<string, string> = {
  cert_not_found: "does not know this device",
  DEVICE_NOT_FOUND: "does not know this device",
  device_revoked: "has revoked this device",
  DEVICE_REVOKED: "has revoked this device",
  device_expired: "says this device has expired",
  operator_revoked: "has revoked the attestation that vouches for this agent",
};

const REVOKED = new Set(["device_revoked", "DEVICE_REVOKED", "operator_revoked"]);
const REGISTRABLE = new Set(["cert_not_found", "DEVICE_NOT_FOUND", "device_expired"]);

export const isRevocation = (code: string | null): boolean => code !== null && REVOKED.has(code);
export const canRegisterAgain = (code: string | null): boolean => code !== null && REGISTRABLE.has(code);

// The code when `e` says the server rejects this device's credentials. For a
// subkey-signed request `cert_not_found` can also mean only the subkey is stale,
// which a rotation fixes; for the device-signed `POST /devices/subkeys` it
// cannot.
export function deviceRejection(e: unknown): string | null {
  if (!(e instanceof HttpError) || e.status < 400 || e.status > 403) return null;
  try {
    const body = JSON.parse(e.body) as { error?: unknown; reason?: unknown };
    const code = e.status === 401 ? body.reason : body.error;
    return typeof code === "string" && Object.hasOwn(MEANING, code) ? code : null;
  } catch {
    return null;
  }
}

// What a command prints for such an answer, instead of the raw body.
export function deviceRejectionText(e: unknown): string | null {
  const code = deviceRejection(e);
  if (!code) return null;
  if (isRevocation(code)) return `the server rejected this device's credentials (${code}): it ${MEANING[code]}; ${REVOKED_RECOVERY}`;
  return `the server rejected this device's credentials (${code}): it ${MEANING[code]}, or only the subkey is stale.${KEEPS_HAPPENING}`;
}
