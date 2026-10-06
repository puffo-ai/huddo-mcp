/* tslint:disable */
/* eslint-disable */

/**
 * Owner-fenced agent registration ceremony. Rust owns all fresh agent key
 * generation and certificate signing, including the operator-root signature.
 * Network registration and durable storage remain explicit Web host effects.
 */
export class WasmAgentProvisionAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    complete(runtime_id: string, generation: string, slug: string, issued_at: bigint): any;
    dispose(runtime_id: string, generation: string): void;
    phase1(runtime_id: string, generation: string): any;
    static start(runtime_id: string, generation: string, namespace: string, operator_root_seed: Uint8Array, issued_at: bigint): WasmAgentProvisionAuthority;
    readonly accountNamespace: string;
}

export class WasmAttachmentAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    run(command: any): Promise<any>;
    static start(runtime_id: string, generation: string, host: any): WasmAttachmentAuthority;
}

export class WasmClientRuntime {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    command(name: string, payload: Uint8Array): Promise<Uint8Array>;
    drainEvents(): Promise<Array<any>>;
    query(name: string, payload: Uint8Array): Promise<Uint8Array>;
    static start(runtime_id: string, namespace: string, server_origin: string, identity_slug: string, host: any): Promise<WasmClientRuntime>;
    stop(): Promise<void>;
}

/**
 * Owner-fenced authority for both sides of additional-device enrollment.
 * Network polling and durable persistence remain Web host effects.
 */
export class WasmDeviceEnrollmentAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    approve(runtime_id: string, generation: string, slug: string, token: string, identity_cert_json: string, identity_profile_json: string | null | undefined, issued_at: bigint): any;
    begin(runtime_id: string, generation: string): any;
    complete(runtime_id: string, generation: string, response_json: string): any;
    dispose(runtime_id: string, generation: string): void;
    static startApprover(runtime_id: string, generation: string, namespace: string, root_seed: Uint8Array): WasmDeviceEnrollmentAuthority;
    static startNewDevice(runtime_id: string, generation: string, namespace: string): WasmDeviceEnrollmentAuthority;
    readonly accountNamespace: string;
}

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

export class WasmIdentitySessionAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    authenticate(operation: string, request: Uint8Array): Promise<any>;
    logout(): Promise<void>;
    restore(): Promise<any>;
    snapshot(): any;
    /**
     * Starts one browser identity authority.
     *
     * The caller must supply a fresh, per-runtime-instance identifier. It
     * must not reuse a constant across tabs, because the derived RuntimeId is
     * the durable owner identity. It must also change across restarts: this
     * binding derives deterministic operation/effect IDs from it and a local
     * counter. Web composition must meet both requirements before cutover.
     */
    static start(runtime_id: string, protocol_host: any, projection_host: any): WasmIdentitySessionAuthority;
    validateActive(): Promise<any>;
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

/**
 * A session-fenced message authority. Its secret material remains inside the
 * Rust object for the lifetime of the active owner generation.
 */
export class WasmMessageAuthority {
    free(): void;
    [Symbol.dispose](): void;
    disposeAccount(fence: any): void;
    finishMessageEnvelope(fence: any, supplementation_handle: string): void;
    issueSubkeyCertificate(fence: any, issued_at: bigint, expires_at: bigint): any;
    constructor(runtime_id: string, generation: string, root_signing_seed: Uint8Array, device_signing_seed: Uint8Array, subkey_signing_seed: Uint8Array, device_kem_seed: Uint8Array);
    openDeviceKem(fence: any, encapped_key: Uint8Array, info: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
    openMessageEnvelopeOnce(host: any, fence: any, envelope_json: string, self_device_id: string, senders: any, now_ms: string, max_clock_skew_ms: string): Promise<string>;
    openPlaintextMessageEnvelopeOnce(host: any, fence: any, envelope_json: string, senders: any, now_ms: string, max_clock_skew_ms: string): Promise<string>;
    sealMessageEnvelope(fence: any, context: any, payload_json: string, recipients: any): string;
    signEvent(fence: any, event_json: string): string;
    signHttpAsDevice(fence: any, method: string, path: string, body: Uint8Array): any;
    signHttp(fence: any, method: string, path: string, body: Uint8Array): any;
    signPlaintextMessageEnvelope(fence: any, context: any, payload_json: string): string;
    signWebSocket(fence: any): any;
    static startAccount(runtime_id: string, generation: string, namespace: string, slug: string, device_id: string, subkey_id: string, root_signing_seed: Uint8Array, device_signing_seed: Uint8Array, subkey_signing_seed: Uint8Array, device_kem_seed: Uint8Array): WasmMessageAuthority;
    supplementMessageRecipients(fence: any, supplementation_handle: string, recipients: any): string;
    verifyEvent(fence: any, event_json: string, chain_json: string): void;
    readonly accountNamespace: string | undefined;
}

export class WasmNotificationAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    reconcile(mode: string, intent: string): Promise<string>;
    static start(runtime_id: string, generation: string, host: any): WasmNotificationAuthority;
}

export class WasmNotificationProfileAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    run(command: any): Promise<any>;
    static start(runtime_id: string, generation: string, host: any): WasmNotificationProfileAuthority;
}

export class WasmPasswordAuthLoginState {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * JSON body ready to POST to /auth/password/login/start.
     */
    readonly requestJson: string;
}

export class WasmPasswordAuthRegState {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * JSON body ready to POST to /auth/password/register/start.
     */
    readonly requestJson: string;
}

export class WasmRecoveryAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    run(command: any): Promise<any>;
    static start(runtime_id: string, generation: string, host: any): WasmRecoveryAuthority;
}

/**
 * Owner-fenced fresh-identity ceremony. Rust owns certificate construction
 * and signing; the final seeds leave only once so the Web host can persist
 * them until durable browser key storage itself moves behind Rust.
 */
export class WasmRootDeviceCertAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    complete(runtime_id: string, generation: string, slug: string, issued_at: bigint): any;
    dispose(runtime_id: string, generation: string): void;
    phase1(runtime_id: string, generation: string): any;
    static start(runtime_id: string, generation: string, namespace: string, identity_type: string, declared_operator_public_key: string | null | undefined, issued_at: bigint, expires_at?: bigint | null): WasmRootDeviceCertAuthority;
    readonly accountNamespace: string;
}

export class WasmSendOutboxAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    drain(): Promise<number>;
    send(idempotency_key: string, payload: Uint8Array): Promise<string>;
    static start(runtime_id: string, generation: string, host: any): WasmSendOutboxAuthority;
}

export class WasmSpacesMembershipAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    apply(mutation: any): Promise<any>;
    static start(runtime_id: string, generation: string, host: any): WasmSpacesMembershipAuthority;
}

/**
 * Owner-fenced device authority. The imported device seed never returns to
 * JavaScript; only the newly generated rotating subkey seed is returned for
 * the current session store.
 */
export class WasmSubkeyCertAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    dispose(runtime_id: string, generation: string): void;
    issue(runtime_id: string, generation: string, issued_at: bigint, expires_at: bigint): any;
    static start(runtime_id: string, generation: string, namespace: string, device_id: string, device_seed: Uint8Array): WasmSubkeyCertAuthority;
    readonly accountNamespace: string;
}

export class WasmSyncReceiveAuthority {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    advanceGeneration(next: string): void;
    catchUp(reason: string): Promise<string>;
    receiveLive(envelope_id: string, sequence: string | null | undefined, payload: Uint8Array): Promise<string>;
    static start(runtime_id: string, generation: string, host: any): WasmSyncReceiveAuthority;
}

/**
 * Opaque per-account signer. Every operation proves the runtime/generation
 * owner; disposing drops and zeroizes the imported seed.
 */
export class WasmTransportSigner {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    dispose(runtime_id: string, generation: string): void;
    signEvent(runtime_id: string, generation: string, event_json: string): string;
    signHttp(runtime_id: string, generation: string, method: string, path: string, body: Uint8Array): any;
    signWebSocket(runtime_id: string, generation: string): any;
    static start(runtime_id: string, generation: string, namespace: string, slug: string, device_id: string, key_id: string, subkey_seed: Uint8Array): WasmTransportSigner;
    verifyEvent(runtime_id: string, generation: string, event_json: string, chain_json: string): void;
    readonly accountNamespace: string;
}

export function aeadOpen(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array;

export function aeadSeal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array;

/**
 * Derive ``output_len`` bytes from ``password`` + ``salt`` using Argon2id.
 * Returns the derived key bytes.
 */
export function argon2Derive(password: Uint8Array, salt: Uint8Array, memory_kib: number, time_cost: number, parallelism: number, output_len: number): Uint8Array;

export function base64urlDecode(s: string): Uint8Array;

export function base64urlEncode(bytes: Uint8Array): string;

export function canonicalize(json_str: string): Uint8Array;

export function canonicalizeForSigning(json_str: string): Uint8Array;

export function ed25519Verify(public_key: Uint8Array, message: Uint8Array, signature: Uint8Array): void;

export function generateContentKey(): Uint8Array;

export function generateNonce(): Uint8Array;

export function hpkeOpen(recipient_secret: Uint8Array, enc: Uint8Array, info: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;

export function hpkeSeal(recipient_pk: Uint8Array, info: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): WasmHpkeOutput;

export function issueAgentOperatorAttestation(operator_root_seed: Uint8Array, agent_root_public_key: string, issued_at: bigint): any;

/**
 * Parse and re-serialize an upstream message-envelope wire DTO. The output
 * uses serde field order; it is not RFC 8785 canonical JSON and does not
 * claim semantic or cryptographic validity.
 */
export function normalizeMessageEnvelopeWire(json: string): string;

/**
 * Parse and re-serialize an upstream signed-event wire DTO. The output is not
 * canonical JSON. Typed-payload and cryptographic verification are later
 * facade operations.
 */
export function normalizeSignedEventWire(json: string): string;

export function notificationAuthorityVersion(): number;

export function notificationProfileAuthorityVersion(): number;

/**
 * Finish OPAQUE login.
 *
 * * ``state``         – value returned by ``passwordAuthStartLogin``
 * * ``response_json`` – raw JSON body of the server's /login/start response
 * * Returns JSON string of the body for POST /auth/password/login/finish.
 */
export function passwordAuthFinishLogin(state: WasmPasswordAuthLoginState, password: string, response_json: string, login_handle: string): string;

/**
 * Finish OPAQUE registration.
 *
 * * ``state``         – value returned by ``passwordAuthStartRegistration``
 * * ``response_json`` – raw JSON body of the server's /register/start response
 * * Returns JSON string of the ``auth`` sub-object for the /register/commit body.
 */
export function passwordAuthFinishRegistration(state: WasmPasswordAuthRegState, password: string, response_json: string, account_id: string, identity_slug: string, login_handle: string): string;

/**
 * Begin OPAQUE login.  Returns a state object whose ``requestJson``
 * field is the JSON body for POST /auth/password/login/start.
 */
export function passwordAuthStartLogin(login_handle: string, password: string): WasmPasswordAuthLoginState;

/**
 * Begin OPAQUE registration.  Returns a state object whose ``requestJson``
 * field is the JSON body for POST /auth/password/register/start.
 */
export function passwordAuthStartRegistration(login_handle: string, password: string): WasmPasswordAuthRegState;

/**
 * Version of the coarse protocol facade. This is independent of individual
 * relay wire DTO versions and allows bindings to reject incompatible peers.
 */
export function protocolFacadeVersion(): number;

/**
 * Executing ABI probe for the browser storage bridge. The production E2E
 * provider probe exercises IndexedDB directly; this probe separately pins the
 * Rust marshalling path so transaction kinds, fences, and query rows cannot
 * drift without executing across the Wasm/JavaScript boundary.
 */
export function runBrowserStorageBridgeProbe(host: any): Promise<any>;

/**
 * Executing error-contract probe for the bounded checkpoint lifecycle.
 */
export function runBrowserStorageCheckpointLimitProbe(host: any): Promise<boolean>;

/**
 * SHA-256 over arbitrary bytes. Used by the TS layer to derive
 * DeviceId / SubkeyId values that match server-side
 * ``puffo_crypto::service::ids::derive_public_key_id`` —
 * ``<prefix>_<base64url(sha256(public_key_bytes))>``. A previously
 * random UUID-based id was rejected by ``DeviceId::new`` for not
 * matching the 43-char base64url-of-sha256 shape.
 */
export function sha256(bytes: Uint8Array): Uint8Array;

/**
 * Derive the upstream public-key fingerprint used by identity/enrollment
 * contracts. TypeScript no longer needs to duplicate this protocol rule.
 */
export function signingPublicKeyFingerprint(public_key_base64url: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmagentprovisionauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmattachmentauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmclientruntime_free: (a: number, b: number) => void;
    readonly __wbg_wasmdeviceenrollmentauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmed25519keypair_free: (a: number, b: number) => void;
    readonly __wbg_wasmhpkeoutput_free: (a: number, b: number) => void;
    readonly __wbg_wasmidentitysessionauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmkemkeypair_free: (a: number, b: number) => void;
    readonly __wbg_wasmmessageauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmnotificationauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmnotificationprofileauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmpasswordauthloginstate_free: (a: number, b: number) => void;
    readonly __wbg_wasmpasswordauthregstate_free: (a: number, b: number) => void;
    readonly __wbg_wasmrecoveryauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmrootdevicecertauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmsendoutboxauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmspacesmembershipauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmsubkeycertauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmsyncreceiveauthority_free: (a: number, b: number) => void;
    readonly __wbg_wasmtransportsigner_free: (a: number, b: number) => void;
    readonly aeadOpen: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly aeadSeal: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly argon2Derive: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly base64urlDecode: (a: number, b: number) => [number, number, number, number];
    readonly base64urlEncode: (a: number, b: number) => [number, number];
    readonly canonicalize: (a: number, b: number) => [number, number, number, number];
    readonly canonicalizeForSigning: (a: number, b: number) => [number, number, number, number];
    readonly ed25519Verify: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly generateContentKey: () => [number, number];
    readonly generateNonce: () => [number, number];
    readonly hpkeOpen: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly hpkeSeal: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly issueAgentOperatorAttestation: (a: number, b: number, c: number, d: number, e: bigint) => [number, number, number];
    readonly normalizeMessageEnvelopeWire: (a: number, b: number) => [number, number, number, number];
    readonly normalizeSignedEventWire: (a: number, b: number) => [number, number, number, number];
    readonly notificationAuthorityVersion: () => number;
    readonly notificationProfileAuthorityVersion: () => number;
    readonly passwordAuthFinishLogin: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly passwordAuthFinishRegistration: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number, number];
    readonly passwordAuthStartLogin: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly passwordAuthStartRegistration: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly protocolFacadeVersion: () => number;
    readonly runBrowserStorageBridgeProbe: (a: any) => any;
    readonly runBrowserStorageCheckpointLimitProbe: (a: any) => any;
    readonly sha256: (a: number, b: number) => [number, number];
    readonly signingPublicKeyFingerprint: (a: number, b: number) => [number, number, number, number];
    readonly wasmagentprovisionauthority_accountNamespace: (a: number) => [number, number];
    readonly wasmagentprovisionauthority_complete: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => [number, number, number];
    readonly wasmagentprovisionauthority_dispose: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmagentprovisionauthority_phase1: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmagentprovisionauthority_start: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: bigint) => [number, number, number];
    readonly wasmattachmentauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmattachmentauthority_run: (a: number, b: any) => any;
    readonly wasmattachmentauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmclientruntime_command: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly wasmclientruntime_drainEvents: (a: number) => any;
    readonly wasmclientruntime_query: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly wasmclientruntime_start: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: any) => any;
    readonly wasmclientruntime_stop: (a: number) => any;
    readonly wasmdeviceenrollmentauthority_accountNamespace: (a: number) => [number, number];
    readonly wasmdeviceenrollmentauthority_approve: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: bigint) => [number, number, number];
    readonly wasmdeviceenrollmentauthority_begin: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmdeviceenrollmentauthority_complete: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly wasmdeviceenrollmentauthority_dispose: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmdeviceenrollmentauthority_startApprover: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wasmdeviceenrollmentauthority_startNewDevice: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmed25519keypair_fromBytes: (a: number, b: number) => [number, number, number];
    readonly wasmed25519keypair_generate: () => number;
    readonly wasmed25519keypair_publicKeyBytes: (a: number) => [number, number];
    readonly wasmed25519keypair_secretBytes: (a: number) => [number, number];
    readonly wasmed25519keypair_sign: (a: number, b: number, c: number) => [number, number];
    readonly wasmhpkeoutput_ciphertext: (a: number) => [number, number];
    readonly wasmhpkeoutput_enc: (a: number) => [number, number];
    readonly wasmidentitysessionauthority_authenticate: (a: number, b: number, c: number, d: any) => any;
    readonly wasmidentitysessionauthority_logout: (a: number) => any;
    readonly wasmidentitysessionauthority_restore: (a: number) => any;
    readonly wasmidentitysessionauthority_snapshot: (a: number) => [number, number, number];
    readonly wasmidentitysessionauthority_start: (a: number, b: number, c: any, d: any) => number;
    readonly wasmidentitysessionauthority_validateActive: (a: number) => any;
    readonly wasmkemkeypair_fromSecretBytes: (a: number, b: number) => [number, number, number];
    readonly wasmkemkeypair_generate: () => number;
    readonly wasmkemkeypair_publicKeyBytes: (a: number) => [number, number];
    readonly wasmkemkeypair_secretBytes: (a: number) => [number, number];
    readonly wasmmessageauthority_accountNamespace: (a: number) => [number, number];
    readonly wasmmessageauthority_disposeAccount: (a: number, b: any) => [number, number];
    readonly wasmmessageauthority_finishMessageEnvelope: (a: number, b: any, c: number, d: number) => [number, number];
    readonly wasmmessageauthority_issueSubkeyCertificate: (a: number, b: any, c: bigint, d: bigint) => [number, number, number];
    readonly wasmmessageauthority_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly wasmmessageauthority_openDeviceKem: (a: number, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly wasmmessageauthority_openMessageEnvelopeOnce: (a: number, b: any, c: any, d: number, e: number, f: number, g: number, h: any, i: number, j: number, k: number, l: number) => any;
    readonly wasmmessageauthority_openPlaintextMessageEnvelopeOnce: (a: number, b: any, c: any, d: number, e: number, f: any, g: number, h: number, i: number, j: number) => any;
    readonly wasmmessageauthority_sealMessageEnvelope: (a: number, b: any, c: any, d: number, e: number, f: any) => [number, number, number, number];
    readonly wasmmessageauthority_signEvent: (a: number, b: any, c: number, d: number) => [number, number, number, number];
    readonly wasmmessageauthority_signHttp: (a: number, b: any, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly wasmmessageauthority_signHttpAsDevice: (a: number, b: any, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly wasmmessageauthority_signPlaintextMessageEnvelope: (a: number, b: any, c: any, d: number, e: number) => [number, number, number, number];
    readonly wasmmessageauthority_signWebSocket: (a: number, b: any) => [number, number, number];
    readonly wasmmessageauthority_startAccount: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number) => [number, number, number];
    readonly wasmmessageauthority_supplementMessageRecipients: (a: number, b: any, c: number, d: number, e: any) => [number, number, number, number];
    readonly wasmmessageauthority_verifyEvent: (a: number, b: any, c: number, d: number, e: number, f: number) => [number, number];
    readonly wasmnotificationauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmnotificationauthority_reconcile: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly wasmnotificationauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmnotificationprofileauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmnotificationprofileauthority_run: (a: number, b: any) => any;
    readonly wasmnotificationprofileauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmpasswordauthloginstate_requestJson: (a: number) => [number, number];
    readonly wasmpasswordauthregstate_requestJson: (a: number) => [number, number];
    readonly wasmrecoveryauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmrecoveryauthority_run: (a: number, b: any) => any;
    readonly wasmrecoveryauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmrootdevicecertauthority_accountNamespace: (a: number) => [number, number];
    readonly wasmrootdevicecertauthority_complete: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => [number, number, number];
    readonly wasmrootdevicecertauthority_dispose: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmrootdevicecertauthority_phase1: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmrootdevicecertauthority_start: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: bigint, l: number, m: bigint) => [number, number, number];
    readonly wasmsendoutboxauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmsendoutboxauthority_drain: (a: number) => any;
    readonly wasmsendoutboxauthority_send: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly wasmsendoutboxauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmspacesmembershipauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmspacesmembershipauthority_apply: (a: number, b: any) => any;
    readonly wasmspacesmembershipauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmsubkeycertauthority_accountNamespace: (a: number) => [number, number];
    readonly wasmsubkeycertauthority_dispose: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmsubkeycertauthority_issue: (a: number, b: number, c: number, d: number, e: number, f: bigint, g: bigint) => [number, number, number];
    readonly wasmsubkeycertauthority_start: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: any) => [number, number, number];
    readonly wasmsyncreceiveauthority_advanceGeneration: (a: number, b: number, c: number) => [number, number];
    readonly wasmsyncreceiveauthority_catchUp: (a: number, b: number, c: number) => any;
    readonly wasmsyncreceiveauthority_receiveLive: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly wasmsyncreceiveauthority_start: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasmtransportsigner_accountNamespace: (a: number) => [number, number];
    readonly wasmtransportsigner_dispose: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmtransportsigner_signEvent: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly wasmtransportsigner_signHttp: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: any) => [number, number, number];
    readonly wasmtransportsigner_signWebSocket: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmtransportsigner_start: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: any) => [number, number, number];
    readonly wasmtransportsigner_verifyEvent: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___wasm_bindgen_299239bb4417d9bb___JsValue__core_c5930c85a12de822___result__Result_____wasm_bindgen_299239bb4417d9bb___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
