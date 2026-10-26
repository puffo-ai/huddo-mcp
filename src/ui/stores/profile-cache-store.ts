import { create } from "zustand";
import * as nameCache from "../../features/notifications";
import { readCache, writeCache } from "../utils/local-cache";

export interface CachedProfile {
  slug: string;
  username?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  role_short: string;
  owner_slug?: string;
  fetchedAt: number;
}

export const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;

export type CachedProfileInput = Omit<CachedProfile, "fetchedAt"> &
  Partial<Pick<CachedProfile, "fetchedAt">>;

interface ProfileCacheState {
  profiles: Record<string, CachedProfile>;
  upsert(profile: CachedProfileInput): void;
  upsertMany(profiles: CachedProfileInput[]): void;
  get(slug: string): CachedProfile | undefined;
  evict(slug: string): void;
  reset(): void;
  staleSlugs(now: number, slugs: string[]): string[];
}

function stampNow(p: CachedProfileInput): CachedProfile {
  return { ...p, fetchedAt: p.fetchedAt ?? Date.now() };
}

function mirrorDisplayNames(profiles: CachedProfile[]): void {
  const entries = profiles.map((p) => ({ id: p.slug, name: p.display_name || null }));
  if (entries.length > 0) void nameCache.setNames(entries);
}

const PROFILES_KEY = "profiles";
const PROFILES_KEPT = 2000;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function savedProfiles(): Record<string, CachedProfile> {
  const saved = readCache<CachedProfile[]>(PROFILES_KEY);
  return Object.fromEntries((Array.isArray(saved) ? saved : []).map((p) => [p.slug, { ...p, fetchedAt: 0 }]));
}

function saveProfiles(profiles: Record<string, CachedProfile>): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const kept = Object.values(profiles)
      .sort((a, b) => b.fetchedAt - a.fetchedAt)
      .slice(0, PROFILES_KEPT);
    writeCache(PROFILES_KEY, kept);
  }, 500);
}

export const useProfileCacheStore = create<ProfileCacheState>((set, get) => ({
  profiles: savedProfiles(),
  upsert: (p) => {
    const stamped = stampNow(p);
    mirrorDisplayNames([stamped]);
    set((s) => ({ profiles: { ...s.profiles, [stamped.slug]: stamped } }));
    saveProfiles(get().profiles);
  },
  upsertMany: (ps) => {
    const stamped = ps.map(stampNow);
    mirrorDisplayNames(stamped);
    set((s) => {
      const next = { ...s.profiles };
      for (const p of stamped) next[p.slug] = p;
      return { profiles: next };
    });
    saveProfiles(get().profiles);
  },
  get: (slug) => get().profiles[slug],
  evict: (slug) =>
    set((s) => {
      if (!(slug in s.profiles)) return s;
      const next = { ...s.profiles };
      delete next[slug];
      return { profiles: next };
    }),
  reset: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    set({ profiles: {} });
  },
  staleSlugs: (now, slugs) => {
    const { profiles } = get();
    const cutoff = now - PROFILE_CACHE_TTL_MS;
    return slugs.filter((s) => {
      const p = profiles[s];
      return p !== undefined && p.fetchedAt < cutoff;
    });
  },
}));
