import { createSubkeyCert } from "../../identity/certs/subkey";
import type { SubkeyCertAuthorityPort } from "./subkey-cert-authority-port";

export function createTypeScriptSubkeyCertAuthorityPort(): SubkeyCertAuthorityPort {
  return {
    authority: "typescript",
    issue(input) {
      if (!input.crypto) throw new Error("TypeScript subkey certificate authority requires CryptoOps");
      const pair = input.crypto.generateEd25519KeyPair();
      return {
        cert: createSubkeyCert(
          input.crypto,
          input.deviceSecretKey,
          input.deviceId,
          pair.publicKey,
          input.issuedAt,
        ),
        secretKey: pair.secretKey,
      };
    },
    dispose() {},
  };
}
