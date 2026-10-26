export type NotificationMode = "off" | "wake_only" | "on";
export type NotificationScope = "all" | "space" | "channel" | "dm";
export type NotificationRule = "on" | "off_hour" | "off_day" | "off_forever";
export type NotificationPermissionState = NotificationPermission | "unsupported";

export interface NotificationPreferences {
  mode: NotificationMode;
  enabledSpaces: string[];
  enabledDms: string[];
  hidePreview?: boolean;
  muteSound?: boolean;
}

export interface NotificationSetting {
  scope: NotificationScope;
  target_id: string | null;
  notify_on: boolean;
  off_until: number | null;
  updated_at: number;
}

export interface NotificationProfile {
  has_token: boolean;
  settings: NotificationSetting[];
}

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermissionState;
  subscribed: boolean;
}

export interface ScopeMutes {
  spaces: string[];
  dms: string[];
}

export const EMPTY_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mode: "off",
  enabledSpaces: [],
  enabledDms: [],
};

export const EMPTY_MUTES: ScopeMutes = { spaces: [], dms: [] };

export function modeRequiresSubscription(mode: NotificationMode): boolean {
  return mode !== "off";
}

function toggle(values: string[], value: string, on: boolean): string[] {
  const next = new Set(values);
  if (on) next.add(value);
  else next.delete(value);
  return Array.from(next);
}

function bulkToggle(values: string[], targets: string[], on: boolean): string[] {
  const next = new Set(values);
  for (const target of targets) {
    if (on) next.add(target);
    else next.delete(target);
  }
  return Array.from(next);
}

export function withMode(preferences: NotificationPreferences, mode: NotificationMode): NotificationPreferences {
  return { ...preferences, mode };
}

export function withSpaceToggled(preferences: NotificationPreferences, id: string, on: boolean): NotificationPreferences {
  return { ...preferences, enabledSpaces: toggle(preferences.enabledSpaces, id, on) };
}

export function withDmToggled(preferences: NotificationPreferences, slug: string, on: boolean): NotificationPreferences {
  return { ...preferences, enabledDms: toggle(preferences.enabledDms, slug, on) };
}

export function withSpacesBulkSet(preferences: NotificationPreferences, ids: string[], on: boolean): NotificationPreferences {
  return { ...preferences, enabledSpaces: bulkToggle(preferences.enabledSpaces, ids, on) };
}

export function withDmsBulkSet(preferences: NotificationPreferences, slugs: string[], on: boolean): NotificationPreferences {
  return { ...preferences, enabledDms: bulkToggle(preferences.enabledDms, slugs, on) };
}

export function mutedTargets(profile: NotificationProfile | null, now: number): ScopeMutes {
  const mutes: ScopeMutes = { spaces: [], dms: [] };
  for (const setting of profile?.settings ?? []) {
    if (!setting.target_id || setting.notify_on || (setting.off_until != null && setting.off_until <= now)) continue;
    if (setting.scope === "space") mutes.spaces.push(setting.target_id);
    if (setting.scope === "dm") mutes.dms.push(setting.target_id);
  }
  return mutes;
}

export function withServerMutes(
  preferences: NotificationPreferences,
  spaceIds: string[],
  dmSlugs: string[],
  mutes: ScopeMutes,
): NotificationPreferences {
  const mutedSpaces = new Set(mutes.spaces);
  const mutedDms = new Set(mutes.dms);
  return {
    ...preferences,
    enabledSpaces: bulkToggle(bulkToggle(preferences.enabledSpaces, spaceIds, false), spaceIds.filter((id) => !mutedSpaces.has(id)), true),
    enabledDms: bulkToggle(bulkToggle(preferences.enabledDms, dmSlugs, false), dmSlugs.filter((slug) => !mutedDms.has(slug)), true),
  };
}

export function findSetting(profile: NotificationProfile | null, scope: NotificationScope, targetId: string | null): NotificationSetting | undefined {
  return profile?.settings.find((setting) => setting.scope === scope && setting.target_id === targetId);
}

export function ruleForSetting(setting: NotificationSetting | undefined, now: number): NotificationRule {
  if (!setting || setting.notify_on || (setting.off_until != null && setting.off_until <= now)) return "on";
  if (setting.off_until == null) return "off_forever";
  return setting.off_until - setting.updated_at <= 60 * 60 * 1000 ? "off_hour" : "off_day";
}

export type PushSubscribeOutcome =
  | { kind: "subscribed" }
  | { kind: "unsupported" }
  | { kind: "permission_required" }
  | { kind: "permission_denied" }
  | { kind: "service_worker_unavailable" }
  | { kind: "failed"; cause: unknown };
