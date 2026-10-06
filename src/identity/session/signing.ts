import type { AuthHeaders, CryptoOps } from "../../http/types";

const AUTH_VERSION = "v1";
const NONCE_BYTES = 16;

export function buildSigningMessage(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: Uint8Array
): Uint8Array {
  const prefix = new TextEncoder().encode(
    `${method}\n${path}\n${timestamp}\n${nonce}\n`
  );
  const msg = new Uint8Array(prefix.length + body.length);
  msg.set(prefix);
  msg.set(body, prefix.length);
  return msg;
}

export function signRequest(
  crypto: CryptoOps,
  signingKey: Uint8Array,
  slug: string,
  signerId: string,
  method: string,
  path: string,
  body: Uint8Array = new Uint8Array(0),
  timestampMs?: number,
  nonce?: string
): AuthHeaders {
  const ts = timestampMs ?? Date.now();
  const timestamp = ts.toString();

  if (nonce === undefined) {
    nonce = crypto.base64urlEncode(crypto.generateRandomBytes(NONCE_BYTES));
  }

  const message = buildSigningMessage(method, path, timestamp, nonce, body);
  const sig = crypto.ed25519Sign(signingKey, message);

  return {
    version: AUTH_VERSION,
    slug,
    signer_id: signerId,
    timestamp,
    nonce,
    signature: crypto.base64urlEncode(sig),
  };
}

export function authHeadersToRecord(headers: AuthHeaders): Record<string, string> {
  return {
    "x-puffo-version": headers.version,
    "x-puffo-slug": headers.slug,
    "x-puffo-signer-id": headers.signer_id,
    "x-puffo-timestamp": headers.timestamp,
    "x-puffo-nonce": headers.nonce,
    "x-puffo-signature": headers.signature,
    "content-type": "application/json",
  };
}
