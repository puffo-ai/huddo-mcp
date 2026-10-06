import { createDeviceCert } from "../../identity/certs/device";
import { derivePublicKeyId } from "../../identity/certs/ids";
import { createIdentityCert, createSlugBinding } from "../../identity/certs/root";
import type {
  RootDeviceCertAuthorityPort,
  RootDeviceCertBeginInput,
  RootDeviceCertMaterial,
} from "./root-device-cert-authority-port";

export function createTypeScriptRootDeviceCertAuthorityPort(): RootDeviceCertAuthorityPort {
  const ceremonies = new Set<{ dispose(): void }>();
  return {
    authority: "typescript",
    begin(input: RootDeviceCertBeginInput) {
      if (!input.crypto) throw new Error("TypeScript root/device certificate authority requires CryptoOps");
      const root = input.crypto.generateEd25519KeyPair();
      const deviceSigning = input.crypto.generateEd25519KeyPair();
      const kem = input.crypto.generateKemKeyPair();
      const identityCert = createIdentityCert(
        input.crypto,
        root.secretKey,
        input.identityType,
        input.declaredOperatorPublicKey,
      );
      const deviceCert = createDeviceCert(
        input.crypto,
        root.secretKey,
        deviceSigning.publicKey,
        kem.publicKey,
        input.issuedAt,
        input.expiresAt,
      );
      const deviceId = derivePublicKeyId(input.crypto, "dev", deviceSigning.publicKey);
      let disposed = false;
      let completed: { slug: string; issuedAt: number; value: RootDeviceCertMaterial } | null = null;
      const ceremony = {
        phase1: { identityCert, deviceCert, deviceId },
        complete(slug: string, issuedAt: number): RootDeviceCertMaterial {
          if (disposed) throw new Error("Root/device certificate ceremony is disposed");
          if (completed) {
            if (completed.slug === slug && completed.issuedAt === issuedAt) return completed.value;
            throw new Error("Root/device certificate ceremony is already completed");
          }
          const value: RootDeviceCertMaterial = {
            identityCert,
            slugBinding: createSlugBinding(input.crypto!, root.secretKey, slug, issuedAt),
            deviceCert,
            deviceId,
            rootSecretKey: root.secretKey,
            deviceSigningSecretKey: deviceSigning.secretKey,
            kemSecretKey: kem.secretKey,
            rootPublicKey: root.publicKey,
            deviceSigningPublicKey: deviceSigning.publicKey,
            kemPublicKey: kem.publicKey,
          };
          completed = { slug, issuedAt, value };
          return value;
        },
        dispose() {
          disposed = true;
          ceremonies.delete(ceremony);
        },
      };
      ceremonies.add(ceremony);
      return ceremony;
    },
    dispose() {
      for (const ceremony of [...ceremonies]) ceremony.dispose();
    },
  };
}
