import type { CryptoOps } from "../../http/types";
import type { DeviceCert } from "../../identity/certs/device";
import type { IdentityCert, SlugBinding } from "../../identity/certs/root";

export type RootDeviceCertBeginInput = Readonly<{
  namespace: string;
  identityType: "human" | "agent";
  declaredOperatorPublicKey?: string;
  issuedAt: number;
  expiresAt?: number;
  crypto?: CryptoOps;
}>;

export type RootDeviceCertPhase1 = Readonly<{
  identityCert: IdentityCert;
  deviceCert: DeviceCert;
  deviceId: string;
}>;

export type RootDeviceCertMaterial = RootDeviceCertPhase1 & Readonly<{
  slugBinding: SlugBinding;
  rootSecretKey: Uint8Array;
  deviceSigningSecretKey: Uint8Array;
  kemSecretKey: Uint8Array;
  rootPublicKey: Uint8Array;
  deviceSigningPublicKey: Uint8Array;
  kemPublicKey: Uint8Array;
}>;

export interface RootDeviceCertCeremony {
  readonly phase1: RootDeviceCertPhase1;
  complete(slug: string, issuedAt: number): RootDeviceCertMaterial;
  dispose(): void;
}

export interface RootDeviceCertAuthorityPort {
  readonly authority: "typescript" | "rust";
  begin(input: RootDeviceCertBeginInput): RootDeviceCertCeremony;
  dispose(): void;
}

let installed: RootDeviceCertAuthorityPort | null = null;

export function installRootDeviceCertAuthorityPort(port: RootDeviceCertAuthorityPort): void {
  installed?.dispose();
  installed = port;
}

export function rootDeviceCertAuthorityPort(): RootDeviceCertAuthorityPort {
  if (!installed) throw new Error("Root/device certificate authority is unavailable");
  return installed;
}

export function clearRootDeviceCertAuthorityHandles(): void {
  installed?.dispose();
}

export function resetRootDeviceCertAuthorityPortForTests(): void {
  installed?.dispose();
  installed = null;
}
