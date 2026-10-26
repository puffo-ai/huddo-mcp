import type { PuffoHttpClient } from "../../../http/client";
import type { PushPort } from "../application/ports";
import type { PushStatus, PushSubscribeOutcome } from "../domain/notification";
import { startWasmNotificationAuthority } from "../../../protocol/wasm-protocol-facade";
export type { PushStatus } from "../domain/notification";
import { base64UrlToBytes, bytesToBase64Url } from "./web-push-key";

type AssertCurrent = () => void;
const noopAssertCurrent: AssertCurrent = () => {};
const subscriptionClaims = new WeakMap<PushSubscription, string>();

interface SubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface VapidPublicKeyResponse {
  public_key: string;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && typeof Notification !== "undefined"
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
}

export function isIosSafari(): boolean {
  if (!isIosBrowser()) return false;
  const ua = navigator.userAgent || "";
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export interface UnsupportedHelp {
  body: string;
  hint: string;
}

export function unsupportedPushHelp(): UnsupportedHelp {
  if (isIosSafari()) {
    return {
      body:
        "On iPhone and iPad, install Huddo as a Home Screen app to "
        + "receive notifications.",
      hint:
        "Tap the Share button, then choose Add to Home Screen, then "
        + "open the installed Huddo app.",
    };
  }
  if (isIosBrowser()) {
    return {
      body:
        "On iPhone and iPad, only Safari can install Huddo as a Home "
        + "Screen app that receives notifications.",
      hint:
        "Open this page in Safari, tap the Share button, then choose "
        + "Add to Home Screen.",
    };
  }
  return {
    body:
      "Web Push is not supported in this browser. Open Huddo in a "
      + "modern Chrome, Edge, Safari, or Firefox to receive "
      + "background notifications.",
    hint: "",
  };
}

export async function readPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }
  const permission = Notification.permission;
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      subscribed = !!sub;
    }
  } catch {
    subscribed = false;
  }
  return { supported: true, permission, subscribed };
}

export async function subscribeToPush(
  http: PuffoHttpClient,
  assertCurrent: AssertCurrent = noopAssertCurrent,
  ownerToken?: string,
): Promise<PushSubscription> {
  assertCurrent();
  if (!isPushSupported()) {
    throw new Error("push_not_supported");
  }
  if (Notification.permission === "denied") {
    throw new Error("permission_denied");
  }
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    assertCurrent();
    if (result !== "granted") {
      throw new Error("permission_denied");
    }
  }

  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("service_worker_unavailable")), 10_000),
    ),
  ]);
  assertCurrent();

  const vapid = await http.getUnsigned<VapidPublicKeyResponse>("/push/vapid-public-key");
  assertCurrent();
  if (!vapid.public_key) throw new Error("vapid_not_configured");

  const existing = await reg.pushManager.getSubscription();
  assertCurrent();
  if (existing) {
    const existingKey = existing.options?.applicationServerKey;
    if (existingKey && byteEquals(new Uint8Array(existingKey), base64UrlToBytes(vapid.public_key))) {
      if (ownerToken) subscriptionClaims.set(existing, ownerToken);
      await mirrorToServer(http, existing, assertCurrent);
      assertCurrent();
      return existing;
    }
    assertCurrent();
    await existing.unsubscribe().catch(() => {});
    assertCurrent();
  }

  const keyBytes = base64UrlToBytes(vapid.public_key);
  const keyBuf = new ArrayBuffer(keyBytes.length);
  new Uint8Array(keyBuf).set(keyBytes);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBuf,
  });
  try {
    assertCurrent();
    if (ownerToken) subscriptionClaims.set(sub, ownerToken);
  } catch (error) {
    const active = await reg.pushManager.getSubscription().catch(() => null);
    const claimedBy = subscriptionClaims.get(sub);
    if (active === sub && (!claimedBy || claimedBy === ownerToken)) {
      await sub.unsubscribe().catch(() => {});
    }
    throw error;
  }
  await mirrorToServer(http, sub, assertCurrent);
  assertCurrent();
  return sub;
}

async function mirrorToServer(
  http: PuffoHttpClient,
  sub: PushSubscription,
  assertCurrent: AssertCurrent = noopAssertCurrent,
): Promise<void> {
  assertCurrent();
  const body = encodeSubscription(sub);
  assertCurrent();
  await http.post("/push/subscribe", body as unknown as Record<string, unknown>);
  assertCurrent();
}

export function encodeSubscription(sub: PushSubscription): SubscribeBody {
  const p256dhRaw = sub.getKey("p256dh");
  const authRaw = sub.getKey("auth");
  if (!p256dhRaw || !authRaw) {
    throw new Error("subscription_keys_missing");
  }
  return {
    endpoint: sub.endpoint,
    p256dh: bytesToBase64Url(new Uint8Array(p256dhRaw)),
    auth: bytesToBase64Url(new Uint8Array(authRaw)),
  };
}

export async function unsubscribeFromPushBrowserOnly(
  assertCurrent: AssertCurrent = noopAssertCurrent,
): Promise<void> {
  assertCurrent();
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  assertCurrent();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  assertCurrent();
  if (sub) {
    await sub.unsubscribe().catch(() => {});
    assertCurrent();
  }
}

export async function unsubscribeFromPush(
  http: PuffoHttpClient,
  assertCurrent: AssertCurrent = noopAssertCurrent,
): Promise<void> {
  assertCurrent();
  if (!isPushSupported()) return;
  await unsubscribeFromPushBrowserOnly(assertCurrent);
  assertCurrent();
  try {
    assertCurrent();
    await http.delete("/push/subscribe");
    assertCurrent();
  } catch {
  }
}

function byteEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function subscribeOutcome(error: unknown): PushSubscribeOutcome {
  const message = error instanceof Error ? error.message : "";
  if (message === "push_not_supported") return { kind: "unsupported" };
  if (message === "permission_denied") return { kind: "permission_denied" };
  if (message === "service_worker_unavailable") return { kind: "service_worker_unavailable" };
  return { kind: "failed", cause: error };
}

async function subscribeWithOutcome(
  http: PuffoHttpClient,
  assertCurrent: AssertCurrent = noopAssertCurrent,
  ownerToken?: string,
): Promise<PushSubscribeOutcome> {
  try {
    await subscribeToPush(http, assertCurrent, ownerToken);
    return { kind: "subscribed" };
  } catch (error) {
    return subscribeOutcome(error);
  }
}

export function createBrowserPushPort(
  http: PuffoHttpClient,
  owner: Readonly<{ key: string; generation: number }> = { key: "unscoped-test-owner", generation: 1 },
): PushPort {
  return createBrowserPushPortWithUnsubscribe(http, owner, (assertCurrent) =>
    unsubscribeFromPush(http, assertCurrent));
}

function createBrowserPushPortWithUnsubscribe(
  http: PuffoHttpClient | null,
  owner: Readonly<{ key: string; generation: number }>,
  unsubscribe: (assertCurrent: AssertCurrent) => Promise<void>,
): PushPort {
  const primitive: Omit<PushPort, "reconcileMode"> = {
    readStatus: readPushStatus,
    subscribeFromUserGesture: () => http
      ? subscribeWithOutcome(http)
      : Promise.resolve({ kind: "failed", cause: new Error("push_http_unavailable") }),
    reconcileExistingPermission: async () => {
      if (!isPushSupported()) return { kind: "unsupported" };
      if (Notification.permission === "denied") return { kind: "permission_denied" };
      if (Notification.permission !== "granted") return { kind: "permission_required" };
      return http
        ? subscribeWithOutcome(http)
        : { kind: "failed", cause: new Error("push_http_unavailable") };
    },
    unsubscribe: () => unsubscribe(noopAssertCurrent),
    unsubscribeBrowserOnly: unsubscribeFromPushBrowserOnly,
  };
  if (import.meta.env.VITE_RUST_NOTIFICATION_AUTHORITY_ENABLED === "false") {
    return primitive;
  }
  return {
    ...primitive,
    async reconcileMode(mode, intent, isCurrent) {
      if (!isCurrent()) return { kind: "cancelled" };
      const assertCurrent = () => {
        if (!isCurrent()) throw new Error("stale_notification_owner");
      };
      const ownerToken = `${owner.key}:${owner.generation}`;
      let failureCause: unknown;
      const authority = await startWasmNotificationAuthority(
        `web-notification-authority:${owner.key}`,
        String(owner.generation),
        {
        async readStatus() { assertCurrent(); const status = await primitive.readStatus(); assertCurrent(); return status; },
        async subscribeFromUserGesture() {
          const outcome = http
            ? await subscribeWithOutcome(http, assertCurrent, ownerToken)
            : { kind: "failed" as const, cause: new Error("push_http_unavailable") };
          if (outcome.kind === "failed") failureCause = outcome.cause;
          return outcome.kind;
        },
        async reconcileExistingPermission() {
          assertCurrent();
          if (!isPushSupported()) return "unsupported";
          if (Notification.permission === "denied") return "permission_denied";
          if (Notification.permission !== "granted") return "permission_required";
          const outcome = http
            ? await subscribeWithOutcome(http, assertCurrent, ownerToken)
            : { kind: "failed" as const, cause: new Error("push_http_unavailable") };
          if (outcome.kind === "failed") failureCause = outcome.cause;
          return outcome.kind;
        },
        async unsubscribe() { await unsubscribe(assertCurrent); },
        async project() { assertCurrent(); },
        },
      );
      let result;
      try {
        result = await authority.reconcile(mode, intent);
      } catch (error) {
        if (!isCurrent()) return { kind: "cancelled" };
        throw error;
      } finally {
        authority.free();
      }
      if (!isCurrent()) return { kind: "cancelled" };
      return result === "permission_denied" ? { kind: "permission_denied" }
        : result === "permission_required" ? { kind: "permission_required" }
        : result === "service_worker_unavailable" ? { kind: "service_worker_unavailable" }
        : result === "unsubscribed" ? { kind: "unsubscribed" }
        : result === "already_unsubscribed" ? { kind: "already_unsubscribed" }
        : result === "unsupported" ? { kind: "unsupported" }
        : result === "subscribed" ? { kind: "subscribed" }
        : { kind: "failed", cause: failureCause ?? new Error("notification_authority_failed") };
    },
  };
}

export async function deactivatePushForSignOut(
  http: PuffoHttpClient,
  owner: Readonly<{ key: string; generation?: number }>,
): Promise<void> {
  const port = createBrowserPushPort(http, { key: owner.key, generation: owner.generation ?? 1 });
  await deactivatePushPort(port);
}

export async function deactivateBrowserPushForSignOut(
  owner: Readonly<{ key: string; generation?: number }>,
): Promise<void> {
  const port = createBrowserPushPortWithUnsubscribe(
    null,
    { key: owner.key, generation: owner.generation ?? 1 },
    unsubscribeFromPushBrowserOnly,
  );
  await deactivatePushPort(port);
}

async function deactivatePushPort(port: PushPort): Promise<void> {
  if (port.reconcileMode) {
    await port.reconcileMode("off", "background", () => true);
    return;
  }
  const status = await port.readStatus();
  if (status.subscribed) await port.unsubscribe();
}
