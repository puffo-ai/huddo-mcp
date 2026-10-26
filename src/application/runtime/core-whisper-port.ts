export type CoreWhisperDevice = Readonly<{ slug: string; device_id: string; kem_public_key: Uint8Array }>;

export type CoreDeviceSealed = Readonly<{
  enc: Uint8Array;
  info: Uint8Array;
  keyAad: Uint8Array;
  sealedKey: Uint8Array;
  nonce: Uint8Array;
  aad: Uint8Array;
  ciphertext: Uint8Array;
}>;

export type CoreWhisperKeys = Readonly<{
  localDeviceId(): Promise<string | null>;
  devices(slugs: readonly string[]): Promise<CoreWhisperDevice[]>;
  openSealed(sealed: CoreDeviceSealed): Promise<Uint8Array>;
}>;

let installed: CoreWhisperKeys | null = null;

export function installCoreWhisperKeys(port: CoreWhisperKeys | null): void {
  installed = port;
}

export function coreWhisperKeys(): CoreWhisperKeys | null {
  return installed;
}
