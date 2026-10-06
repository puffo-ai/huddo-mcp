import { rootDeviceCertAuthorityPort } from "../../application/runtime/root-device-cert-authority-port";
import type { CryptoOps } from "../../http/types";

export function beginFreshIdentityCertificateCeremony(input: Readonly<{
  serverUrl: string;
  identityType: "human" | "agent";
  declaredOperatorPublicKey?: string;
  crypto: CryptoOps;
  issuedAt?: number;
  expiresAt?: number;
}>) {
  return rootDeviceCertAuthorityPort().begin({
    namespace: `${input.serverUrl.replace(/\/+$/, "")}\u0000fresh-identity`,
    identityType: input.identityType,
    declaredOperatorPublicKey: input.declaredOperatorPublicKey,
    issuedAt: input.issuedAt ?? Date.now(),
    expiresAt: input.expiresAt,
    crypto: input.crypto,
  });
}

export function createFreshIdentityCertificateMaterial(input: Readonly<{
  serverUrl: string;
  slug: string;
  identityType: "human" | "agent";
  declaredOperatorPublicKey?: string;
  crypto: CryptoOps;
  issuedAt?: number;
  expiresAt?: number;
}>) {
  const issuedAt = input.issuedAt ?? Date.now();
  const ceremony = beginFreshIdentityCertificateCeremony({ ...input, issuedAt });
  try {
    return ceremony.complete(input.slug, issuedAt);
  } finally {
    ceremony.dispose();
  }
}
