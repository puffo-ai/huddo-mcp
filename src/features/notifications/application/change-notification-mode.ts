import type { NotificationMode } from "../domain/notification";
import type { PushPort } from "./ports";
import { reconcilePushMode, type PushReconcileOutcome } from "./reconcile-push";

export function changeNotificationMode(
  push: PushPort,
  mode: NotificationMode,
  isCurrent: () => boolean = () => true,
): Promise<PushReconcileOutcome> {
  return reconcilePushMode(push, mode, "user_gesture", isCurrent);
}
