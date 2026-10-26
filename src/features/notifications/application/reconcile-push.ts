import type { NotificationMode, PushSubscribeOutcome } from "../domain/notification";
import type { PushPort, PushReconcileIntent } from "./ports";

export type PushReconcileOutcome =
  | PushSubscribeOutcome
  | { kind: "cancelled" }
  | { kind: "unsubscribed" }
  | { kind: "already_unsubscribed" };

export async function reconcilePushMode(
  port: PushPort,
  mode: NotificationMode,
  intent: PushReconcileIntent,
  isCurrent: () => boolean = () => true,
): Promise<PushReconcileOutcome> {
  if (port.reconcileMode) return port.reconcileMode(mode, intent, isCurrent);
  const status = await port.readStatus();
  if (!isCurrent()) return { kind: "cancelled" };

  if (mode === "off") {
    if (!status.subscribed) return { kind: "already_unsubscribed" };
    await port.unsubscribe();
    return { kind: "unsubscribed" };
  }

  if (!status.supported || status.permission === "unsupported") {
    return { kind: "unsupported" };
  }
  if (status.permission === "denied") return { kind: "permission_denied" };
  if (status.subscribed && status.permission === "granted") return { kind: "subscribed" };
  if (intent === "background" && status.permission !== "granted") {
    return { kind: "permission_required" };
  }

  return intent === "user_gesture"
    ? port.subscribeFromUserGesture()
    : port.reconcileExistingPermission();
}
