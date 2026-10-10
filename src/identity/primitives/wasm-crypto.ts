import init, {
  WasmEd25519KeyPair,
  WasmKemKeyPair,
  ed25519Verify,
  hpkeSeal,
  hpkeOpen,
  aeadSeal,
  aeadOpen,
  base64urlEncode,
  base64urlDecode,
  canonicalizeForSigning,
  sha256,
} from "puffo-crypto-wasm-v2";
import wasmUrl from "puffo-crypto-wasm-v2/puffo_crypto_wasm_v2_bg.wasm?url";

import type { CryptoOps } from "../../http/types";

export async function createWasmCrypto(): Promise<CryptoOps> {
  await init({ module_or_path: wasmUrl });

  return {
    ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
      const kp = WasmEd25519KeyPair.fromBytes(secretKey);
      try {
        return kp.sign(message);
      } finally {
        kp.free();
      }
    },

    ed25519Verify(
      publicKey: Uint8Array,
      message: Uint8Array,
      signature: Uint8Array,
    ): void {
      ed25519Verify(publicKey, message, signature);
    },

    ed25519PublicKeyFromSecret(secretKey: Uint8Array): Uint8Array {
      const kp = WasmEd25519KeyPair.fromBytes(secretKey);
      try {
        return kp.publicKeyBytes();
      } finally {
        kp.free();
      }
    },

    generateEd25519KeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
      const kp = WasmEd25519KeyPair.generate();
      try {
        return {
          publicKey: kp.publicKeyBytes(),
          secretKey: kp.secretBytes(),
        };
      } finally {
        kp.free();
      }
    },

    kemPublicKeyFromSecret(secretKey: Uint8Array): Uint8Array {
      const kp = WasmKemKeyPair.fromSecretBytes(secretKey);
      try {
        return kp.publicKeyBytes();
      } finally {
        kp.free();
      }
    },

    generateKemKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
      const kp = WasmKemKeyPair.generate();
      try {
        return {
          publicKey: kp.publicKeyBytes(),
          secretKey: kp.secretBytes(),
        };
      } finally {
        kp.free();
      }
    },

    hpkeSeal(
      recipientPk: Uint8Array,
      info: Uint8Array,
      aad: Uint8Array,
      plaintext: Uint8Array,
    ): { enc: Uint8Array; ciphertext: Uint8Array } {
      const out = hpkeSeal(recipientPk, info, aad, plaintext);
      try {
        return { enc: out.enc, ciphertext: out.ciphertext };
      } finally {
        out.free();
      }
    },

    hpkeOpen(
      recipientSk: Uint8Array,
      enc: Uint8Array,
      info: Uint8Array,
      aad: Uint8Array,
      ciphertext: Uint8Array,
    ): Uint8Array {
      return hpkeOpen(recipientSk, enc, info, aad, ciphertext);
    },

    aeadSeal(
      key: Uint8Array,
      nonce: Uint8Array,
      plaintext: Uint8Array,
      aad: Uint8Array,
    ): Uint8Array {
      return aeadSeal(key, nonce, plaintext, aad);
    },

    aeadOpen(
      key: Uint8Array,
      nonce: Uint8Array,
      ciphertext: Uint8Array,
      aad: Uint8Array,
    ): Uint8Array {
      return aeadOpen(key, nonce, ciphertext, aad);
    },

    base64urlEncode(data: Uint8Array): string {
      return base64urlEncode(data);
    },

    base64urlDecode(s: string): Uint8Array {
      return base64urlDecode(s);
    },

    canonicalizeForSigning(json: string): Uint8Array {
      return canonicalizeForSigning(json);
    },

    sha256(data: Uint8Array): Uint8Array {
      return sha256(data);
    },

    generateRandomBytes(n: number): Uint8Array {
      const bytes = new Uint8Array(n);
      crypto.getRandomValues(bytes);
      return bytes;
    },
  };
}
