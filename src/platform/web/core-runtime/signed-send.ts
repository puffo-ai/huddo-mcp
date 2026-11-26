import type { SignedSend } from "./leader";

export const SIGNED_SEND_TIMEOUT_MS = 30_000;

export const sendSigned: SignedSend = async (url, { method, headers, body }) => {
  const response = await fetch(url, {
    method,
    headers,
    body: body as BodyInit | undefined,
    signal: AbortSignal.timeout(SIGNED_SEND_TIMEOUT_MS),
  });
  return { status: response.status, body: new Uint8Array(await response.arrayBuffer()) };
};
