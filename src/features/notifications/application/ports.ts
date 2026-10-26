import type {
  NotificationPreferences,
  PushStatus,
  PushSubscribeOutcome,
} from "../domain/notification";

export interface PushPort {
  readStatus(): Promise<PushStatus>;
  subscribeFromUserGesture(): Promise<PushSubscribeOutcome>;
  reconcileExistingPermission(): Promise<PushSubscribeOutcome>;
  unsubscribe(): Promise<void>;
  unsubscribeBrowserOnly(): Promise<void>;
  reconcileMode?(
    mode: "off" | "wake_only" | "on",
    intent: PushReconcileIntent,
    isCurrent: () => boolean,
  ): Promise<PushSubscribeOutcome | { kind: "cancelled" | "unsubscribed" | "already_unsubscribed" }>;
}

export type PushReconcileIntent = "user_gesture" | "background";

export interface NotificationPreferencesPort {
  read(): Promise<NotificationPreferences>;
  update(
    change: (current: NotificationPreferences) => NotificationPreferences,
    canCommit: () => boolean,
  ): Promise<NotificationPreferences | null>;
  subscribe(listener: () => void): () => void;
}

export interface NotificationOwner {
  slug: string;
  serverUrl: string;
  sessionGeneration: number;
}
