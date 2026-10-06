export type IssuedSubkey = Readonly<{
  cert: Record<string, unknown>;
  secretKey: Uint8Array;
}>;

export type SubkeyCertIssueInput = Readonly<{
  serverUrl: string;
  slug: string;
  deviceId: string;
  deviceSecretKey: Uint8Array;
  issuedAt: number;
  expiresAt: number;
  crypto?: CryptoOps;
}>;

export interface SubkeyCertAuthorityPort {
  readonly authority: "typescript" | "rust";
  issue(input: SubkeyCertIssueInput): IssuedSubkey;
  dispose(): void;
}

let installed: SubkeyCertAuthorityPort | null = null;

export function installSubkeyCertAuthorityPort(port: SubkeyCertAuthorityPort): void {
  installed?.dispose();
  installed = port;
}

export function subkeyCertAuthorityPort(): SubkeyCertAuthorityPort {
  if (!installed) throw new Error("Rust subkey certificate authority is unavailable");
  return installed;
}

export function clearSubkeyCertAuthorityHandles(): void {
  installed?.dispose();
}

export function resetSubkeyCertAuthorityPortForTests(): void {
  installed?.dispose();
  installed = null;
}
import type { CryptoOps } from "../../http/types";
