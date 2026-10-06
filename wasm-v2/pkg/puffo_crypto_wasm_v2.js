/* @ts-self-types="./puffo_crypto_wasm_v2.d.ts" */

/**
 * Owner-fenced agent registration ceremony. Rust owns all fresh agent key
 * generation and certificate signing, including the operator-root signature.
 * Network registration and durable storage remain explicit Web host effects.
 */
export class WasmAgentProvisionAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmAgentProvisionAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmAgentProvisionAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAgentProvisionAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmagentprovisionauthority_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get accountNamespace() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmagentprovisionauthority_accountNamespace(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} slug
     * @param {bigint} issued_at
     * @returns {any}
     */
    complete(runtime_id, generation, slug, issued_at) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentprovisionauthority_complete(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, issued_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     */
    dispose(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentprovisionauthority_dispose(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @returns {any}
     */
    phase1(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentprovisionauthority_phase1(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @param {Uint8Array} operator_root_seed
     * @param {bigint} issued_at
     * @returns {WasmAgentProvisionAuthority}
     */
    static start(runtime_id, generation, namespace, operator_root_seed, issued_at) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(operator_root_seed, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentprovisionauthority_start(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, issued_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmAgentProvisionAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmAgentProvisionAuthority.prototype[Symbol.dispose] = WasmAgentProvisionAuthority.prototype.free;

export class WasmAttachmentAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmAttachmentAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmAttachmentAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAttachmentAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmattachmentauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmattachmentauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} command
     * @returns {Promise<any>}
     */
    run(command) {
        const ret = wasm.wasmattachmentauthority_run(this.__wbg_ptr, command);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmAttachmentAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmattachmentauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmAttachmentAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmAttachmentAuthority.prototype[Symbol.dispose] = WasmAttachmentAuthority.prototype.free;

export class WasmClientRuntime {
    static __wrap(ptr) {
        const obj = Object.create(WasmClientRuntime.prototype);
        obj.__wbg_ptr = ptr;
        WasmClientRuntimeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmClientRuntimeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmclientruntime_free(ptr, 0);
    }
    /**
     * @param {string} name
     * @param {Uint8Array} payload
     * @returns {Promise<Uint8Array>}
     */
    command(name, payload) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclientruntime_command(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @returns {Promise<Array<any>>}
     */
    drainEvents() {
        const ret = wasm.wasmclientruntime_drainEvents(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} name
     * @param {Uint8Array} payload
     * @returns {Promise<Uint8Array>}
     */
    query(name, payload) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclientruntime_query(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} namespace
     * @param {string} server_origin
     * @param {string} identity_slug
     * @param {any} host
     * @returns {Promise<WasmClientRuntime>}
     */
    static start(runtime_id, namespace, server_origin, identity_slug, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(server_origin, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(identity_slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmclientruntime_start(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, host);
        return ret;
    }
    /**
     * @returns {Promise<void>}
     */
    stop() {
        const ret = wasm.wasmclientruntime_stop(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmClientRuntime.prototype[Symbol.dispose] = WasmClientRuntime.prototype.free;

/**
 * Owner-fenced authority for both sides of additional-device enrollment.
 * Network polling and durable persistence remain Web host effects.
 */
export class WasmDeviceEnrollmentAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmDeviceEnrollmentAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmDeviceEnrollmentAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDeviceEnrollmentAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdeviceenrollmentauthority_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get accountNamespace() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmdeviceenrollmentauthority_accountNamespace(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} slug
     * @param {string} token
     * @param {string} identity_cert_json
     * @param {string | null | undefined} identity_profile_json
     * @param {bigint} issued_at
     * @returns {any}
     */
    approve(runtime_id, generation, slug, token, identity_cert_json, identity_profile_json, issued_at) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(token, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(identity_cert_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        var ptr5 = isLikeNone(identity_profile_json) ? 0 : passStringToWasm0(identity_profile_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len5 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdeviceenrollmentauthority_approve(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, issued_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @returns {any}
     */
    begin(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdeviceenrollmentauthority_begin(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} response_json
     * @returns {any}
     */
    complete(runtime_id, generation, response_json) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(response_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdeviceenrollmentauthority_complete(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     */
    dispose(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdeviceenrollmentauthority_dispose(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @param {Uint8Array} root_seed
     * @returns {WasmDeviceEnrollmentAuthority}
     */
    static startApprover(runtime_id, generation, namespace, root_seed) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(root_seed, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdeviceenrollmentauthority_startApprover(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmDeviceEnrollmentAuthority.__wrap(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @returns {WasmDeviceEnrollmentAuthority}
     */
    static startNewDevice(runtime_id, generation, namespace) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdeviceenrollmentauthority_startNewDevice(ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmDeviceEnrollmentAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmDeviceEnrollmentAuthority.prototype[Symbol.dispose] = WasmDeviceEnrollmentAuthority.prototype.free;

export class WasmEd25519KeyPair {
    static __wrap(ptr) {
        const obj = Object.create(WasmEd25519KeyPair.prototype);
        obj.__wbg_ptr = ptr;
        WasmEd25519KeyPairFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmEd25519KeyPairFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmed25519keypair_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} secret
     * @returns {WasmEd25519KeyPair}
     */
    static fromBytes(secret) {
        const ptr0 = passArray8ToWasm0(secret, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmed25519keypair_fromBytes(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmEd25519KeyPair.__wrap(ret[0]);
    }
    /**
     * @returns {WasmEd25519KeyPair}
     */
    static generate() {
        const ret = wasm.wasmed25519keypair_generate();
        return WasmEd25519KeyPair.__wrap(ret);
    }
    /**
     * @returns {Uint8Array}
     */
    publicKeyBytes() {
        const ret = wasm.wasmed25519keypair_publicKeyBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    secretBytes() {
        const ret = wasm.wasmed25519keypair_secretBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} message
     * @returns {Uint8Array}
     */
    sign(message) {
        const ptr0 = passArray8ToWasm0(message, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmed25519keypair_sign(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}
if (Symbol.dispose) WasmEd25519KeyPair.prototype[Symbol.dispose] = WasmEd25519KeyPair.prototype.free;

export class WasmHpkeOutput {
    static __wrap(ptr) {
        const obj = Object.create(WasmHpkeOutput.prototype);
        obj.__wbg_ptr = ptr;
        WasmHpkeOutputFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmHpkeOutputFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmhpkeoutput_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get ciphertext() {
        const ret = wasm.wasmhpkeoutput_ciphertext(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get enc() {
        const ret = wasm.wasmhpkeoutput_enc(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) WasmHpkeOutput.prototype[Symbol.dispose] = WasmHpkeOutput.prototype.free;

export class WasmIdentitySessionAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmIdentitySessionAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmIdentitySessionAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmIdentitySessionAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmidentitysessionauthority_free(ptr, 0);
    }
    /**
     * @param {string} operation
     * @param {Uint8Array} request
     * @returns {Promise<any>}
     */
    authenticate(operation, request) {
        const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmidentitysessionauthority_authenticate(this.__wbg_ptr, ptr0, len0, request);
        return ret;
    }
    /**
     * @returns {Promise<void>}
     */
    logout() {
        const ret = wasm.wasmidentitysessionauthority_logout(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    restore() {
        const ret = wasm.wasmidentitysessionauthority_restore(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {any}
     */
    snapshot() {
        const ret = wasm.wasmidentitysessionauthority_snapshot(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Starts one browser identity authority.
     *
     * The caller must supply a fresh, per-runtime-instance identifier. It
     * must not reuse a constant across tabs, because the derived RuntimeId is
     * the durable owner identity. It must also change across restarts: this
     * binding derives deterministic operation/effect IDs from it and a local
     * counter. Web composition must meet both requirements before cutover.
     * @param {string} runtime_id
     * @param {any} protocol_host
     * @param {any} projection_host
     * @returns {WasmIdentitySessionAuthority}
     */
    static start(runtime_id, protocol_host, projection_host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmidentitysessionauthority_start(ptr0, len0, protocol_host, projection_host);
        return WasmIdentitySessionAuthority.__wrap(ret);
    }
    /**
     * @returns {Promise<any>}
     */
    validateActive() {
        const ret = wasm.wasmidentitysessionauthority_validateActive(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmIdentitySessionAuthority.prototype[Symbol.dispose] = WasmIdentitySessionAuthority.prototype.free;

export class WasmKemKeyPair {
    static __wrap(ptr) {
        const obj = Object.create(WasmKemKeyPair.prototype);
        obj.__wbg_ptr = ptr;
        WasmKemKeyPairFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmKemKeyPairFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmkemkeypair_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} secret
     * @returns {WasmKemKeyPair}
     */
    static fromSecretBytes(secret) {
        const ptr0 = passArray8ToWasm0(secret, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmkemkeypair_fromSecretBytes(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmKemKeyPair.__wrap(ret[0]);
    }
    /**
     * @returns {WasmKemKeyPair}
     */
    static generate() {
        const ret = wasm.wasmkemkeypair_generate();
        return WasmKemKeyPair.__wrap(ret);
    }
    /**
     * @returns {Uint8Array}
     */
    publicKeyBytes() {
        const ret = wasm.wasmkemkeypair_publicKeyBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    secretBytes() {
        const ret = wasm.wasmkemkeypair_secretBytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) WasmKemKeyPair.prototype[Symbol.dispose] = WasmKemKeyPair.prototype.free;

/**
 * A session-fenced message authority. Its secret material remains inside the
 * Rust object for the lifetime of the active owner generation.
 */
export class WasmMessageAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmMessageAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmMessageAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMessageAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmessageauthority_free(ptr, 0);
    }
    /**
     * @returns {string | undefined}
     */
    get accountNamespace() {
        const ret = wasm.wasmmessageauthority_accountNamespace(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {any} fence
     */
    disposeAccount(fence) {
        const ret = wasm.wasmmessageauthority_disposeAccount(this.__wbg_ptr, fence);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} fence
     * @param {string} supplementation_handle
     */
    finishMessageEnvelope(fence, supplementation_handle) {
        const ptr0 = passStringToWasm0(supplementation_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_finishMessageEnvelope(this.__wbg_ptr, fence, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} fence
     * @param {bigint} issued_at
     * @param {bigint} expires_at
     * @returns {any}
     */
    issueSubkeyCertificate(fence, issued_at, expires_at) {
        const ret = wasm.wasmmessageauthority_issueSubkeyCertificate(this.__wbg_ptr, fence, issued_at, expires_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {Uint8Array} root_signing_seed
     * @param {Uint8Array} device_signing_seed
     * @param {Uint8Array} subkey_signing_seed
     * @param {Uint8Array} device_kem_seed
     */
    constructor(runtime_id, generation, root_signing_seed, device_signing_seed, subkey_signing_seed, device_kem_seed) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(root_signing_seed, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(device_signing_seed, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(subkey_signing_seed, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray8ToWasm0(device_kem_seed, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmMessageAuthorityFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {any} fence
     * @param {Uint8Array} encapped_key
     * @param {Uint8Array} info
     * @param {Uint8Array} aad
     * @param {Uint8Array} ciphertext
     * @returns {Uint8Array}
     */
    openDeviceKem(fence, encapped_key, info, aad, ciphertext) {
        const ptr0 = passArray8ToWasm0(encapped_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(info, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(ciphertext, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_openDeviceKem(this.__wbg_ptr, fence, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v5;
    }
    /**
     * @param {any} host
     * @param {any} fence
     * @param {string} envelope_json
     * @param {string} self_device_id
     * @param {any} senders
     * @param {string} now_ms
     * @param {string} max_clock_skew_ms
     * @returns {Promise<string>}
     */
    openMessageEnvelopeOnce(host, fence, envelope_json, self_device_id, senders, now_ms, max_clock_skew_ms) {
        const ptr0 = passStringToWasm0(envelope_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(self_device_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(now_ms, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(max_clock_skew_ms, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_openMessageEnvelopeOnce(this.__wbg_ptr, host, fence, ptr0, len0, ptr1, len1, senders, ptr2, len2, ptr3, len3);
        return ret;
    }
    /**
     * @param {any} host
     * @param {any} fence
     * @param {string} envelope_json
     * @param {any} senders
     * @param {string} now_ms
     * @param {string} max_clock_skew_ms
     * @returns {Promise<string>}
     */
    openPlaintextMessageEnvelopeOnce(host, fence, envelope_json, senders, now_ms, max_clock_skew_ms) {
        const ptr0 = passStringToWasm0(envelope_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(now_ms, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(max_clock_skew_ms, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_openPlaintextMessageEnvelopeOnce(this.__wbg_ptr, host, fence, ptr0, len0, senders, ptr1, len1, ptr2, len2);
        return ret;
    }
    /**
     * @param {any} fence
     * @param {any} context
     * @param {string} payload_json
     * @param {any} recipients
     * @returns {string}
     */
    sealMessageEnvelope(fence, context, payload_json, recipients) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(payload_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmmessageauthority_sealMessageEnvelope(this.__wbg_ptr, fence, context, ptr0, len0, recipients);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {any} fence
     * @param {string} event_json
     * @returns {string}
     */
    signEvent(fence, event_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(event_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmmessageauthority_signEvent(this.__wbg_ptr, fence, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {any} fence
     * @param {string} method
     * @param {string} path
     * @param {Uint8Array} body
     * @returns {any}
     */
    signHttpAsDevice(fence, method, path, body) {
        const ptr0 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_signHttpAsDevice(this.__wbg_ptr, fence, ptr0, len0, ptr1, len1, body);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} fence
     * @param {string} method
     * @param {string} path
     * @param {Uint8Array} body
     * @returns {any}
     */
    signHttp(fence, method, path, body) {
        const ptr0 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_signHttp(this.__wbg_ptr, fence, ptr0, len0, ptr1, len1, body);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} fence
     * @param {any} context
     * @param {string} payload_json
     * @returns {string}
     */
    signPlaintextMessageEnvelope(fence, context, payload_json) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(payload_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmmessageauthority_signPlaintextMessageEnvelope(this.__wbg_ptr, fence, context, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {any} fence
     * @returns {any}
     */
    signWebSocket(fence) {
        const ret = wasm.wasmmessageauthority_signWebSocket(this.__wbg_ptr, fence);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @param {string} slug
     * @param {string} device_id
     * @param {string} subkey_id
     * @param {Uint8Array} root_signing_seed
     * @param {Uint8Array} device_signing_seed
     * @param {Uint8Array} subkey_signing_seed
     * @param {Uint8Array} device_kem_seed
     * @returns {WasmMessageAuthority}
     */
    static startAccount(runtime_id, generation, namespace, slug, device_id, subkey_id, root_signing_seed, device_signing_seed, subkey_signing_seed, device_kem_seed) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(device_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(subkey_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArray8ToWasm0(root_signing_seed, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArray8ToWasm0(device_signing_seed, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passArray8ToWasm0(subkey_signing_seed, wasm.__wbindgen_malloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passArray8ToWasm0(device_kem_seed, wasm.__wbindgen_malloc);
        const len9 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_startAccount(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMessageAuthority.__wrap(ret[0]);
    }
    /**
     * @param {any} fence
     * @param {string} supplementation_handle
     * @param {any} recipients
     * @returns {string}
     */
    supplementMessageRecipients(fence, supplementation_handle, recipients) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(supplementation_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmmessageauthority_supplementMessageRecipients(this.__wbg_ptr, fence, ptr0, len0, recipients);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {any} fence
     * @param {string} event_json
     * @param {string} chain_json
     */
    verifyEvent(fence, event_json, chain_json) {
        const ptr0 = passStringToWasm0(event_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(chain_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmessageauthority_verifyEvent(this.__wbg_ptr, fence, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmMessageAuthority.prototype[Symbol.dispose] = WasmMessageAuthority.prototype.free;

export class WasmNotificationAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmNotificationAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmNotificationAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmNotificationAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmnotificationauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnotificationauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} mode
     * @param {string} intent
     * @returns {Promise<string>}
     */
    reconcile(mode, intent) {
        const ptr0 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(intent, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnotificationauthority_reconcile(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmNotificationAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnotificationauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmNotificationAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmNotificationAuthority.prototype[Symbol.dispose] = WasmNotificationAuthority.prototype.free;

export class WasmNotificationProfileAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmNotificationProfileAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmNotificationProfileAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmNotificationProfileAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmnotificationprofileauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnotificationprofileauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} command
     * @returns {Promise<any>}
     */
    run(command) {
        const ret = wasm.wasmnotificationprofileauthority_run(this.__wbg_ptr, command);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmNotificationProfileAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmnotificationprofileauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmNotificationProfileAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmNotificationProfileAuthority.prototype[Symbol.dispose] = WasmNotificationProfileAuthority.prototype.free;

export class WasmPasswordAuthLoginState {
    static __wrap(ptr) {
        const obj = Object.create(WasmPasswordAuthLoginState.prototype);
        obj.__wbg_ptr = ptr;
        WasmPasswordAuthLoginStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPasswordAuthLoginStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpasswordauthloginstate_free(ptr, 0);
    }
    /**
     * JSON body ready to POST to /auth/password/login/start.
     * @returns {string}
     */
    get requestJson() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpasswordauthloginstate_requestJson(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WasmPasswordAuthLoginState.prototype[Symbol.dispose] = WasmPasswordAuthLoginState.prototype.free;

export class WasmPasswordAuthRegState {
    static __wrap(ptr) {
        const obj = Object.create(WasmPasswordAuthRegState.prototype);
        obj.__wbg_ptr = ptr;
        WasmPasswordAuthRegStateFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPasswordAuthRegStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpasswordauthregstate_free(ptr, 0);
    }
    /**
     * JSON body ready to POST to /auth/password/register/start.
     * @returns {string}
     */
    get requestJson() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmpasswordauthregstate_requestJson(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WasmPasswordAuthRegState.prototype[Symbol.dispose] = WasmPasswordAuthRegState.prototype.free;

export class WasmRecoveryAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmRecoveryAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmRecoveryAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmRecoveryAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmrecoveryauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrecoveryauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} command
     * @returns {Promise<any>}
     */
    run(command) {
        const ret = wasm.wasmrecoveryauthority_run(this.__wbg_ptr, command);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmRecoveryAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrecoveryauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmRecoveryAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmRecoveryAuthority.prototype[Symbol.dispose] = WasmRecoveryAuthority.prototype.free;

/**
 * Owner-fenced fresh-identity ceremony. Rust owns certificate construction
 * and signing; the final seeds leave only once so the Web host can persist
 * them until durable browser key storage itself moves behind Rust.
 */
export class WasmRootDeviceCertAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmRootDeviceCertAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmRootDeviceCertAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmRootDeviceCertAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmrootdevicecertauthority_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get accountNamespace() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmrootdevicecertauthority_accountNamespace(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} slug
     * @param {bigint} issued_at
     * @returns {any}
     */
    complete(runtime_id, generation, slug, issued_at) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrootdevicecertauthority_complete(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, issued_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     */
    dispose(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrootdevicecertauthority_dispose(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @returns {any}
     */
    phase1(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrootdevicecertauthority_phase1(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @param {string} identity_type
     * @param {string | null | undefined} declared_operator_public_key
     * @param {bigint} issued_at
     * @param {bigint | null} [expires_at]
     * @returns {WasmRootDeviceCertAuthority}
     */
    static start(runtime_id, generation, namespace, identity_type, declared_operator_public_key, issued_at, expires_at) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(identity_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        var ptr4 = isLikeNone(declared_operator_public_key) ? 0 : passStringToWasm0(declared_operator_public_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrootdevicecertauthority_start(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, issued_at, !isLikeNone(expires_at), isLikeNone(expires_at) ? BigInt(0) : expires_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmRootDeviceCertAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmRootDeviceCertAuthority.prototype[Symbol.dispose] = WasmRootDeviceCertAuthority.prototype.free;

export class WasmSendOutboxAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmSendOutboxAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmSendOutboxAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSendOutboxAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsendoutboxauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsendoutboxauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Promise<number>}
     */
    drain() {
        const ret = wasm.wasmsendoutboxauthority_drain(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} idempotency_key
     * @param {Uint8Array} payload
     * @returns {Promise<string>}
     */
    send(idempotency_key, payload) {
        const ptr0 = passStringToWasm0(idempotency_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsendoutboxauthority_send(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmSendOutboxAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsendoutboxauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSendOutboxAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmSendOutboxAuthority.prototype[Symbol.dispose] = WasmSendOutboxAuthority.prototype.free;

export class WasmSpacesMembershipAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmSpacesMembershipAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmSpacesMembershipAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSpacesMembershipAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmspacesmembershipauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmspacesmembershipauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} mutation
     * @returns {Promise<any>}
     */
    apply(mutation) {
        const ret = wasm.wasmspacesmembershipauthority_apply(this.__wbg_ptr, mutation);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmSpacesMembershipAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmspacesmembershipauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSpacesMembershipAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmSpacesMembershipAuthority.prototype[Symbol.dispose] = WasmSpacesMembershipAuthority.prototype.free;

/**
 * Owner-fenced device authority. The imported device seed never returns to
 * JavaScript; only the newly generated rotating subkey seed is returned for
 * the current session store.
 */
export class WasmSubkeyCertAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmSubkeyCertAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmSubkeyCertAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSubkeyCertAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsubkeycertauthority_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get accountNamespace() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmsubkeycertauthority_accountNamespace(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     */
    dispose(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsubkeycertauthority_dispose(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {bigint} issued_at
     * @param {bigint} expires_at
     * @returns {any}
     */
    issue(runtime_id, generation, issued_at, expires_at) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsubkeycertauthority_issue(this.__wbg_ptr, ptr0, len0, ptr1, len1, issued_at, expires_at);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @param {string} device_id
     * @param {Uint8Array} device_seed
     * @returns {WasmSubkeyCertAuthority}
     */
    static start(runtime_id, generation, namespace, device_id, device_seed) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(device_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsubkeycertauthority_start(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, device_seed);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSubkeyCertAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmSubkeyCertAuthority.prototype[Symbol.dispose] = WasmSubkeyCertAuthority.prototype.free;

export class WasmSyncReceiveAuthority {
    static __wrap(ptr) {
        const obj = Object.create(WasmSyncReceiveAuthority.prototype);
        obj.__wbg_ptr = ptr;
        WasmSyncReceiveAuthorityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSyncReceiveAuthorityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsyncreceiveauthority_free(ptr, 0);
    }
    /**
     * @param {string} next
     */
    advanceGeneration(next) {
        const ptr0 = passStringToWasm0(next, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsyncreceiveauthority_advanceGeneration(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} reason
     * @returns {Promise<string>}
     */
    catchUp(reason) {
        const ptr0 = passStringToWasm0(reason, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsyncreceiveauthority_catchUp(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} envelope_id
     * @param {string | null | undefined} sequence
     * @param {Uint8Array} payload
     * @returns {Promise<string>}
     */
    receiveLive(envelope_id, sequence, payload) {
        const ptr0 = passStringToWasm0(envelope_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(sequence) ? 0 : passStringToWasm0(sequence, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsyncreceiveauthority_receiveLive(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        return ret;
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {any} host
     * @returns {WasmSyncReceiveAuthority}
     */
    static start(runtime_id, generation, host) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsyncreceiveauthority_start(ptr0, len0, ptr1, len1, host);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSyncReceiveAuthority.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmSyncReceiveAuthority.prototype[Symbol.dispose] = WasmSyncReceiveAuthority.prototype.free;

/**
 * Opaque per-account signer. Every operation proves the runtime/generation
 * owner; disposing drops and zeroizes the imported seed.
 */
export class WasmTransportSigner {
    static __wrap(ptr) {
        const obj = Object.create(WasmTransportSigner.prototype);
        obj.__wbg_ptr = ptr;
        WasmTransportSignerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmTransportSignerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmtransportsigner_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get accountNamespace() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmtransportsigner_accountNamespace(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     */
    dispose(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransportsigner_dispose(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} event_json
     * @returns {string}
     */
    signEvent(runtime_id, generation, event_json) {
        let deferred5_0;
        let deferred5_1;
        try {
            const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(event_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            const ret = wasm.wasmtransportsigner_signEvent(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
            var ptr4 = ret[0];
            var len4 = ret[1];
            if (ret[3]) {
                ptr4 = 0; len4 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred5_0 = ptr4;
            deferred5_1 = len4;
            return getStringFromWasm0(ptr4, len4);
        } finally {
            wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
        }
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} method
     * @param {string} path
     * @param {Uint8Array} body
     * @returns {any}
     */
    signHttp(runtime_id, generation, method, path, body) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransportsigner_signHttp(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, body);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @returns {any}
     */
    signWebSocket(runtime_id, generation) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransportsigner_signWebSocket(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} namespace
     * @param {string} slug
     * @param {string} device_id
     * @param {string} key_id
     * @param {Uint8Array} subkey_seed
     * @returns {WasmTransportSigner}
     */
    static start(runtime_id, generation, namespace, slug, device_id, key_id, subkey_seed) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(device_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(key_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransportsigner_start(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, subkey_seed);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmTransportSigner.__wrap(ret[0]);
    }
    /**
     * @param {string} runtime_id
     * @param {string} generation
     * @param {string} event_json
     * @param {string} chain_json
     */
    verifyEvent(runtime_id, generation, event_json, chain_json) {
        const ptr0 = passStringToWasm0(runtime_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(generation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(event_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(chain_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmtransportsigner_verifyEvent(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmTransportSigner.prototype[Symbol.dispose] = WasmTransportSigner.prototype.free;

/**
 * @param {Uint8Array} key
 * @param {Uint8Array} nonce
 * @param {Uint8Array} ciphertext
 * @param {Uint8Array} aad
 * @returns {Uint8Array}
 */
export function aeadOpen(key, nonce, ciphertext, aad) {
    const ptr0 = passArray8ToWasm0(key, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(nonce, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(ciphertext, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.aeadOpen(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v5;
}

/**
 * @param {Uint8Array} key
 * @param {Uint8Array} nonce
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} aad
 * @returns {Uint8Array}
 */
export function aeadSeal(key, nonce, plaintext, aad) {
    const ptr0 = passArray8ToWasm0(key, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(nonce, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.aeadSeal(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v5 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v5;
}

/**
 * Derive ``output_len`` bytes from ``password`` + ``salt`` using Argon2id.
 * Returns the derived key bytes.
 * @param {Uint8Array} password
 * @param {Uint8Array} salt
 * @param {number} memory_kib
 * @param {number} time_cost
 * @param {number} parallelism
 * @param {number} output_len
 * @returns {Uint8Array}
 */
export function argon2Derive(password, salt, memory_kib, time_cost, parallelism, output_len) {
    const ptr0 = passArray8ToWasm0(password, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(salt, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.argon2Derive(ptr0, len0, ptr1, len1, memory_kib, time_cost, parallelism, output_len);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {string} s
 * @returns {Uint8Array}
 */
export function base64urlDecode(s) {
    const ptr0 = passStringToWasm0(s, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.base64urlDecode(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64urlEncode(bytes) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.base64urlEncode(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} json_str
 * @returns {Uint8Array}
 */
export function canonicalize(json_str) {
    const ptr0 = passStringToWasm0(json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.canonicalize(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {string} json_str
 * @returns {Uint8Array}
 */
export function canonicalizeForSigning(json_str) {
    const ptr0 = passStringToWasm0(json_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.canonicalizeForSigning(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} public_key
 * @param {Uint8Array} message
 * @param {Uint8Array} signature
 */
export function ed25519Verify(public_key, message, signature) {
    const ptr0 = passArray8ToWasm0(public_key, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(message, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(signature, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.ed25519Verify(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * @returns {Uint8Array}
 */
export function generateContentKey() {
    const ret = wasm.generateContentKey();
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @returns {Uint8Array}
 */
export function generateNonce() {
    const ret = wasm.generateNonce();
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {Uint8Array} recipient_secret
 * @param {Uint8Array} enc
 * @param {Uint8Array} info
 * @param {Uint8Array} aad
 * @param {Uint8Array} ciphertext
 * @returns {Uint8Array}
 */
export function hpkeOpen(recipient_secret, enc, info, aad, ciphertext) {
    const ptr0 = passArray8ToWasm0(recipient_secret, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(enc, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(info, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(ciphertext, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.hpkeOpen(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v6;
}

/**
 * @param {Uint8Array} recipient_pk
 * @param {Uint8Array} info
 * @param {Uint8Array} aad
 * @param {Uint8Array} plaintext
 * @returns {WasmHpkeOutput}
 */
export function hpkeSeal(recipient_pk, info, aad, plaintext) {
    const ptr0 = passArray8ToWasm0(recipient_pk, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(info, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.hpkeSeal(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmHpkeOutput.__wrap(ret[0]);
}

/**
 * @param {Uint8Array} operator_root_seed
 * @param {string} agent_root_public_key
 * @param {bigint} issued_at
 * @returns {any}
 */
export function issueAgentOperatorAttestation(operator_root_seed, agent_root_public_key, issued_at) {
    const ptr0 = passArray8ToWasm0(operator_root_seed, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(agent_root_public_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.issueAgentOperatorAttestation(ptr0, len0, ptr1, len1, issued_at);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Parse and re-serialize an upstream message-envelope wire DTO. The output
 * uses serde field order; it is not RFC 8785 canonical JSON and does not
 * claim semantic or cryptographic validity.
 * @param {string} json
 * @returns {string}
 */
export function normalizeMessageEnvelopeWire(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.normalizeMessageEnvelopeWire(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Parse and re-serialize an upstream signed-event wire DTO. The output is not
 * canonical JSON. Typed-payload and cryptographic verification are later
 * facade operations.
 * @param {string} json
 * @returns {string}
 */
export function normalizeSignedEventWire(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.normalizeSignedEventWire(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {number}
 */
export function notificationAuthorityVersion() {
    const ret = wasm.notificationAuthorityVersion();
    return ret;
}

/**
 * @returns {number}
 */
export function notificationProfileAuthorityVersion() {
    const ret = wasm.notificationProfileAuthorityVersion();
    return ret;
}

/**
 * Finish OPAQUE login.
 *
 * * ``state``         – value returned by ``passwordAuthStartLogin``
 * * ``response_json`` – raw JSON body of the server's /login/start response
 * * Returns JSON string of the body for POST /auth/password/login/finish.
 * @param {WasmPasswordAuthLoginState} state
 * @param {string} password
 * @param {string} response_json
 * @param {string} login_handle
 * @returns {string}
 */
export function passwordAuthFinishLogin(state, password, response_json, login_handle) {
    let deferred5_0;
    let deferred5_1;
    try {
        _assertClass(state, WasmPasswordAuthLoginState);
        const ptr0 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(response_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(login_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.passwordAuthFinishLogin(state.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * Finish OPAQUE registration.
 *
 * * ``state``         – value returned by ``passwordAuthStartRegistration``
 * * ``response_json`` – raw JSON body of the server's /register/start response
 * * Returns JSON string of the ``auth`` sub-object for the /register/commit body.
 * @param {WasmPasswordAuthRegState} state
 * @param {string} password
 * @param {string} response_json
 * @param {string} account_id
 * @param {string} identity_slug
 * @param {string} login_handle
 * @returns {string}
 */
export function passwordAuthFinishRegistration(state, password, response_json, account_id, identity_slug, login_handle) {
    let deferred7_0;
    let deferred7_1;
    try {
        _assertClass(state, WasmPasswordAuthRegState);
        const ptr0 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(response_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(account_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(identity_slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(login_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.passwordAuthFinishRegistration(state.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        var ptr6 = ret[0];
        var len6 = ret[1];
        if (ret[3]) {
            ptr6 = 0; len6 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred7_0 = ptr6;
        deferred7_1 = len6;
        return getStringFromWasm0(ptr6, len6);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

/**
 * Begin OPAQUE login.  Returns a state object whose ``requestJson``
 * field is the JSON body for POST /auth/password/login/start.
 * @param {string} login_handle
 * @param {string} password
 * @returns {WasmPasswordAuthLoginState}
 */
export function passwordAuthStartLogin(login_handle, password) {
    const ptr0 = passStringToWasm0(login_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.passwordAuthStartLogin(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmPasswordAuthLoginState.__wrap(ret[0]);
}

/**
 * Begin OPAQUE registration.  Returns a state object whose ``requestJson``
 * field is the JSON body for POST /auth/password/register/start.
 * @param {string} login_handle
 * @param {string} password
 * @returns {WasmPasswordAuthRegState}
 */
export function passwordAuthStartRegistration(login_handle, password) {
    const ptr0 = passStringToWasm0(login_handle, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.passwordAuthStartRegistration(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmPasswordAuthRegState.__wrap(ret[0]);
}

/**
 * Version of the coarse protocol facade. This is independent of individual
 * relay wire DTO versions and allows bindings to reject incompatible peers.
 * @returns {number}
 */
export function protocolFacadeVersion() {
    const ret = wasm.protocolFacadeVersion();
    return ret;
}

/**
 * Executing ABI probe for the browser storage bridge. The production E2E
 * provider probe exercises IndexedDB directly; this probe separately pins the
 * Rust marshalling path so transaction kinds, fences, and query rows cannot
 * drift without executing across the Wasm/JavaScript boundary.
 * @param {any} host
 * @returns {Promise<any>}
 */
export function runBrowserStorageBridgeProbe(host) {
    const ret = wasm.runBrowserStorageBridgeProbe(host);
    return ret;
}

/**
 * Executing error-contract probe for the bounded checkpoint lifecycle.
 * @param {any} host
 * @returns {Promise<boolean>}
 */
export function runBrowserStorageCheckpointLimitProbe(host) {
    const ret = wasm.runBrowserStorageCheckpointLimitProbe(host);
    return ret;
}

/**
 * SHA-256 over arbitrary bytes. Used by the TS layer to derive
 * DeviceId / SubkeyId values that match server-side
 * ``puffo_crypto::service::ids::derive_public_key_id`` —
 * ``<prefix>_<base64url(sha256(public_key_bytes))>``. A previously
 * random UUID-based id was rejected by ``DeviceId::new`` for not
 * matching the 43-char base64url-of-sha256 shape.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function sha256(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sha256(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Derive the upstream public-key fingerprint used by identity/enrollment
 * contracts. TypeScript no longer needs to duplicate this protocol rule.
 * @param {string} public_key_base64url
 * @returns {string}
 */
export function signingPublicKeyFingerprint(public_key_base64url) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(public_key_base64url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.signingPublicKeyFingerprint(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_14af1003b8dd5ead: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_92f62ee1427d9e49: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_b123553bed3bb382: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_e343b7d08827ba72: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_apply_a910804df6e1e433: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.apply(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_1875a20c43a36133: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_6137034ef55c9d0f: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_done_b41a1d26cdb37fb6: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_fb6397112b1de25f: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_from_296ca31f8d0f1c52: function(arg0) {
            const ret = Array.from(arg0);
            return ret;
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_658f6698067d9515: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_6c896e0571ddae51: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_b2611749102d7ba3: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_717808ad6a54bd9e: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_e3c31c892080e444: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_d4bdea10311bd9cf: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_1dbf7428bba60a42: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_28744009d011f847: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_from_slice_9a868026ffa4208a: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_b01cb72a8af741a3: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_next_33784799010f1bbe: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_f4aac29c42af995c: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_aa4ccb83129e9e55: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_2baf45db356cf468: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_resolve_0076e10020304ede: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_set_145a351398b48c65: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_6ae97e73113c4f0b: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_bea140a88be9b277: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_then_c949d5a25a4e78f8: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e71170d78fcf8954: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_value_f3c585ee8f5ba40c: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbg_wasmclientruntime_new: function(arg0) {
            const ret = WasmClientRuntime.__wrap(arg0);
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 723, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___wasm_bindgen_299239bb4417d9bb___JsValue__core_c5930c85a12de822___result__Result_____wasm_bindgen_299239bb4417d9bb___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000006: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_generic_0000000000000007: function(arg0, arg1) {
            var v0 = getArrayU8FromWasm0(arg0, arg1).slice();
            wasm.__wbindgen_free(arg0, arg1 * 1, 1);
            // Cast intrinsic for `Vector(U8) -> Externref`.
            const ret = v0;
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./puffo_crypto_wasm_v2_bg.js": import0,
    };
}

function wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___wasm_bindgen_299239bb4417d9bb___JsValue__core_c5930c85a12de822___result__Result_____wasm_bindgen_299239bb4417d9bb___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___wasm_bindgen_299239bb4417d9bb___JsValue__core_c5930c85a12de822___result__Result_____wasm_bindgen_299239bb4417d9bb___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_299239bb4417d9bb___convert__closures_____invoke___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined___js_sys_35954021aaa88265___Function_fn_wasm_bindgen_299239bb4417d9bb___JsValue_____wasm_bindgen_299239bb4417d9bb___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}

const WasmAgentProvisionAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmagentprovisionauthority_free(ptr, 1));
const WasmAttachmentAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmattachmentauthority_free(ptr, 1));
const WasmClientRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmclientruntime_free(ptr, 1));
const WasmDeviceEnrollmentAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdeviceenrollmentauthority_free(ptr, 1));
const WasmEd25519KeyPairFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmed25519keypair_free(ptr, 1));
const WasmHpkeOutputFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmhpkeoutput_free(ptr, 1));
const WasmIdentitySessionAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmidentitysessionauthority_free(ptr, 1));
const WasmKemKeyPairFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmkemkeypair_free(ptr, 1));
const WasmMessageAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmessageauthority_free(ptr, 1));
const WasmNotificationAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmnotificationauthority_free(ptr, 1));
const WasmNotificationProfileAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmnotificationprofileauthority_free(ptr, 1));
const WasmPasswordAuthLoginStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpasswordauthloginstate_free(ptr, 1));
const WasmPasswordAuthRegStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpasswordauthregstate_free(ptr, 1));
const WasmRecoveryAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmrecoveryauthority_free(ptr, 1));
const WasmRootDeviceCertAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmrootdevicecertauthority_free(ptr, 1));
const WasmSendOutboxAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsendoutboxauthority_free(ptr, 1));
const WasmSpacesMembershipAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmspacesmembershipauthority_free(ptr, 1));
const WasmSubkeyCertAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsubkeycertauthority_free(ptr, 1));
const WasmSyncReceiveAuthorityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsyncreceiveauthority_free(ptr, 1));
const WasmTransportSignerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmtransportsigner_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('puffo_crypto_wasm_v2_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
