/* tslint:disable */
/* eslint-disable */

export class WasmEd25519KeyPair {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static fromBytes(secret: Uint8Array): WasmEd25519KeyPair;
    static generate(): WasmEd25519KeyPair;
    publicKeyBytes(): Uint8Array;
    secretBytes(): Uint8Array;
    sign(message: Uint8Array): Uint8Array;
}

export class WasmHpkeOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly ciphertext: Uint8Array;
    readonly enc: Uint8Array;
}

export class WasmKemKeyPair {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static fromSecretBytes(secret: Uint8Array): WasmKemKeyPair;
    static generate(): WasmKemKeyPair;
    publicKeyBytes(): Uint8Array;
    secretBytes(): Uint8Array;
}

export class WasmNotificationAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    reconcile(mode: string, intent: string): Promise<string>;
    static start(runtime_id: string, generation: string, host: any): WasmNotificationAuthority;
}

export function aeadOpen(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array;

export function aeadSeal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array;

export function base64urlDecode(s: string): Uint8Array;

export function base64urlEncode(bytes: Uint8Array): string;

export function blobStreamOpenChunk(reference: string, index: number, ciphertext: Uint8Array): Uint8Array;

/**
 * A fresh version 2 file reference as JSON: a new key and base nonce for
 * `size_bytes` of plaintext sealed in `chunk_size` chunks.
 */
export function blobStreamReference(blob_id: string, size_bytes: number, chunk_size: number, content_type: string, filename: string): string;

export function blobStreamSealChunk(reference: string, index: number, plaintext: Uint8Array): Uint8Array;

export function canonicalize(json_str: string): Uint8Array;

export function canonicalizeForSigning(json_str: string): Uint8Array;

export function ed25519Verify(public_key: Uint8Array, message: Uint8Array, signature: Uint8Array): void;

export function generateContentKey(): Uint8Array;

export function generateNonce(): Uint8Array;

export function hpkeOpen(recipient_secret: Uint8Array, enc: Uint8Array, info: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;

export function hpkeSeal(recipient_pk: Uint8Array, info: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): WasmHpkeOutput;

export function notificationAuthorityVersion(): number;

/**
 * SHA-256 over arbitrary bytes. Used by the TS layer to derive
 * DeviceId / SubkeyId values that match server-side
 * ``puffo_crypto::service::ids::derive_public_key_id`` —
 * ``<prefix>_<base64url(sha256(public_key_bytes))>``. A previously
 * random UUID-based id was rejected by ``DeviceId::new`` for not
 * matching the 43-char base64url-of-sha256 shape.
 */
export function sha256(bytes: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmed25519keypair_free: (a: number, b: number) => void;
    readonly __wbg_wasmhpkeoutput_free: (a: number, b: number) => void;
    readonly __wbg_wasmkemkeypair_free: (a: number, b: number) => void;
    readonly aeadOpen: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly aeadSeal: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly base64urlDecode: (a: number, b: number) => [number, number, number, number];
    readonly base64urlEncode: (a: number, b: number) => [number, number];
    readonly blobStreamOpenChunk: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly blobStreamReference: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly blobStreamSealChunk: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly canonicalize: (a: number, b: number) => [number, number, number, number];
    readonly canonicalizeForSigning: (a: number, b: number) => [number, number, number, number];
    readonly ed25519Verify: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly generateContentKey: () => [number, number];
    readonly generateNonce: () => [number, number];
    readonly hpkeOpen: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly hpkeSeal: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly sha256: (a: number, b: number) => [number, number];
    readonly wasmed25519keypair_fromBytes: (a: number, b: number) => [number, number, number];
    readonly wasmed25519keypair_generate: () => number;
    readonly wasmed25519keypair_publicKeyBytes: (a: number) => [number, number];
    readonly wasmed25519keypair_secretBytes: (a: number) => [number, number];
    readonly wasmed25519keypair_sign: (a: number, b: number, c: number) => [number, number];
    readonly wasmhpkeoutput_ciphertext: (a: number) => [number, number];
    readonly wasmhpkeoutput_enc: (a: number) => [number, number];
    readonly wasmkemkeypair_fromSecretBytes: (a: number, b: number) => [number, number, number];
    readonly wasmkemkeypair_generate: () => number;
    readonly wasmkemkeypair_publicKeyBytes: (a: number) => [number, number];
    readonly wasmkemkeypair_secretBytes: (a: number) => [number, number];
    readonly __wbg_wasmnotificationauthority_free: (a: number, b: number) => void;
    readonly notificationAuthorityVersion: () => number;
    readonly wasmnotificationauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmnotificationauthority_reconcile: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly wasmnotificationauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h9ee405b9b0bb61a0: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h7f13c9829db128fd: (a: number, b: number, c: any, d: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
