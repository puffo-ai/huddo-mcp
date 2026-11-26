import { unknownOutcome } from "./protocol";
import type { CoreHttpTransport } from "../../../http/core-transport-port";
import { CoreRequestError } from "../../../http/types";
import type { CoreClient } from "./client";

type SignedResponse = { ok?: { status: number; body_b64: string }; err?: { code: string; message: string } };

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

function requestBody(body: Uint8Array): Record<string, unknown> {
  if (body.length === 0) return {};
  try {
    return { body_json: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) };
  } catch {
    return { body_b64: toBase64(body) };
  }
}

/** Signs and sends through the core runtime's signed_request passthrough. */
export function createCoreHttpTransport(
  client: Pick<CoreClient, "call">,
  serverUrl: string,
  slug: string,
): CoreHttpTransport {
  return {
    serverUrl,
    slug,
    async send(method, path, body) {
      const [route, search = ""] = path.split("?");
      const payload = {
        method,
        path: route,
        query: Object.fromEntries(new URLSearchParams(search)),
        slug,
        ...requestBody(body),
      };
      const outcome = await client.call("request", JSON.stringify({ v: 2, name: "signed_request", payload }));
      if (outcome.status === "unknown") throw unknownOutcome(`${method} ${route}:`, outcome);
      const envelope = JSON.parse(outcome.envelope) as SignedResponse;
      if (!envelope.ok) throw new CoreRequestError(envelope.err?.code ?? "unknown", `${method} ${route}: ${envelope.err?.code}: ${envelope.err?.message}`);
      const { status, body_b64 } = envelope.ok;
      const bytes = fromBase64(body_b64);
      return new Response(status === 204 || status === 304 ? null : bytes, { status });
    },
  };
}
