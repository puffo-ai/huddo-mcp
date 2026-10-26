import init, {
  notificationAuthorityVersion,
  WasmNotificationAuthority,
} from "puffo-crypto-wasm-v2";
import wasmUrl from "puffo-crypto-wasm-v2/puffo_crypto_wasm_v2_bg.wasm?url";

export type WasmNotificationOutcome =
  | "subscribed" | "unsubscribed" | "already_unsubscribed" | "unsupported"
  | "permission_denied" | "permission_required" | "service_worker_unavailable" | "failed";

export interface WasmNotificationAuthorityFacade {
  reconcile(mode: "off" | "wake_only" | "on", intent: "user_gesture" | "background"): Promise<WasmNotificationOutcome>;
  advanceGeneration(next: string): void;
  free(): void;
}

export async function startWasmNotificationAuthority(
  runtimeId: string,
  generation: string,
  host: unknown,
): Promise<WasmNotificationAuthorityFacade> {
  await initializeWasm();
  if (notificationAuthorityVersion() !== 1) {
    throw new Error("Unsupported Rust notification authority version");
  }
  const authority = WasmNotificationAuthority.start(runtimeId, generation, host);
  return {
    async reconcile(mode, intent) {
      const result = await authority.reconcile(mode, intent) as string;
      if (!["subscribed", "unsubscribed", "already_unsubscribed", "unsupported", "permission_denied", "permission_required", "service_worker_unavailable", "failed"].includes(result)) {
        throw new Error("Rust notification authority returned an invalid result");
      }
      return result as WasmNotificationOutcome;
    },
    advanceGeneration: (next) => authority.advanceGeneration(next),
    free: () => authority.free(),
  };
}

let wasmInitialized: Promise<void> | null = null;

function initializeWasm(): Promise<void> {
  if (!wasmInitialized) {
    wasmInitialized = init({ module_or_path: wasmUrl }).then(() => undefined).catch((error: unknown) => {
      wasmInitialized = null;
      throw error;
    });
  }
  return wasmInitialized;
}
