export interface CryptoOps {
  ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array;
  ed25519Verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): void;
  ed25519PublicKeyFromSecret(secretKey: Uint8Array): Uint8Array;
  kemPublicKeyFromSecret(secretKey: Uint8Array): Uint8Array;
  generateEd25519KeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array };
  generateKemKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array };
  hpkeSeal(
    recipientPk: Uint8Array,
    info: Uint8Array,
    aad: Uint8Array,
    plaintext: Uint8Array
  ): { enc: Uint8Array; ciphertext: Uint8Array };
  hpkeOpen(
    recipientSk: Uint8Array,
    enc: Uint8Array,
    info: Uint8Array,
    aad: Uint8Array,
    ciphertext: Uint8Array
  ): Uint8Array;
  aeadSeal(
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array
  ): Uint8Array;
  aeadOpen(
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array
  ): Uint8Array;
  base64urlEncode(data: Uint8Array): string;
  base64urlDecode(s: string): Uint8Array;
  canonicalizeForSigning(json: string): Uint8Array;
  generateRandomBytes(n: number): Uint8Array;
  sha256(data: Uint8Array): Uint8Array;
}

export interface AuthHeaders {
  version: string;
  slug: string;
  signer_id: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`HTTP ${status}: ${body}`);
    this.name = "HttpError";
  }
}

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export class HttpTimeoutError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly timeoutMs: number,
  ) {
    super(`HTTP ${method} ${path} timed out after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}

export class StaleHttpSessionError extends Error {
  constructor() {
    super("HTTP client belongs to a stale authentication session");
    this.name = "StaleHttpSessionError";
  }
}

export class SessionRecoveryError extends Error {
  constructor(public readonly cause: unknown) {
    super("Session recovery failed after an unauthorized response", { cause });
    this.name = "SessionRecoveryError";
  }
}
