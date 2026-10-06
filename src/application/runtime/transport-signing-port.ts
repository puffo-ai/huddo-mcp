import type { AuthHeaders, CryptoOps } from "../../http/types";
import { signRequest } from "../../identity/session/signing";

export type TransportSigningCredential = Readonly<{
  deviceId: string;
  keyId: string;
  secretKey: Uint8Array;
}>;

export type TransportSigningInput = Readonly<{
  serverUrl: string;
  slug: string;
  credential: TransportSigningCredential;
  crypto: CryptoOps;
}>;

export type WsConnectPayload = Readonly<{
  type: "connect";
  slug: string;
  subkey_id: string;
  nonce: string;
  timestamp: number;
  signature: string;
}>;

export interface TransportSigningPort {
  readonly authority: "typescript" | "rust";
  readonly typedEventAuthority: "typescript" | "rust";
  signHttp(
    input: TransportSigningInput,
    method: string,
    path: string,
    body: Uint8Array,
  ): AuthHeaders;
  signWebSocket(input: TransportSigningInput): WsConnectPayload;
  signEvent<T extends Record<string, unknown>>(
    input: TransportSigningInput,
    event: T,
  ): T;
  verifyEvent(
    input: TransportSigningInput,
    event: Record<string, unknown>,
    chain: Record<string, unknown>,
  ): boolean;
  dispose(): void;
}

export function createTypeScriptTransportSigningPort(): TransportSigningPort {
  return {
    authority: "typescript",
    typedEventAuthority: "typescript",
    signHttp: (input, method, path, body) => signRequest(
      input.crypto,
      input.credential.secretKey,
      input.slug,
      input.credential.keyId,
      method,
      path,
      body,
    ),
    signWebSocket: (input) => {
      const timestamp = Date.now();
      const nonce = input.crypto.base64urlEncode(input.crypto.generateRandomBytes(16));
      const message = new TextEncoder().encode(
        `ws-connect\n${input.slug}\n${input.credential.keyId}\n${nonce}\n${timestamp}`,
      );
      return {
        type: "connect",
        slug: input.slug,
        subkey_id: input.credential.keyId,
        nonce,
        timestamp,
        signature: input.crypto.base64urlEncode(
          input.crypto.ed25519Sign(input.credential.secretKey, message),
        ),
      };
    },
    signEvent: (input, event) => {
      const signed = { ...event, signature: "" };
      const canonical = input.crypto.canonicalizeForSigning(JSON.stringify(signed));
      return {
        ...signed,
        signature: input.crypto.base64urlEncode(
          input.crypto.ed25519Sign(input.credential.secretKey, canonical),
        ),
      };
    },
    verifyEvent: () => {
      throw new Error("TypeScript transport port does not own typed-event verification");
    },
    dispose: () => undefined,
  };
}

let installed: TransportSigningPort = createTypeScriptTransportSigningPort();

export function installTransportSigningPort(port: TransportSigningPort): void {
  installed.dispose();
  installed = port;
}

export function transportSigningPort(): TransportSigningPort {
  return installed;
}

export function clearTransportSigningHandles(): void {
  installed.dispose();
}

export function resetTransportSigningPortForTests(): void {
  installTransportSigningPort(createTypeScriptTransportSigningPort());
}
