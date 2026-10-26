import { create } from "zustand";

const STORAGE_PREFIX = "puffo:last-active-space:";

export function loadLastActiveSpace(mySlug: string): string | null {
  return loadFromDisk(mySlug);
}

function loadFromDisk(mySlug: string): string | null {
  if (!mySlug) return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${mySlug}`);
  } catch {
    return null;
  }
}

function saveToDisk(mySlug: string, spaceId: string | null): void {
  if (!mySlug) return;
  try {
    if (spaceId) localStorage.setItem(`${STORAGE_PREFIX}${mySlug}`, spaceId);
    else localStorage.removeItem(`${STORAGE_PREFIX}${mySlug}`);
  } catch {
  }
}

interface LastActiveSpaceState {
  lastActiveSpaceId: string | null;
  ownerSlug: string | null;
  hydrateFromCache(mySlug: string): void;
  record(mySlug: string, spaceId: string | null): void;
  _resetForTests(): void;
}

export const useLastActiveSpaceStore = create<LastActiveSpaceState>((set, get) => ({
  lastActiveSpaceId: null,
  ownerSlug: null,
  hydrateFromCache(mySlug) {
    if (!mySlug) {
      set({ lastActiveSpaceId: null, ownerSlug: null });
      return;
    }
    if (get().ownerSlug === mySlug) return;
    set({ lastActiveSpaceId: loadFromDisk(mySlug), ownerSlug: mySlug });
  },
  record(mySlug, spaceId) {
    if (!mySlug) return;
    if (get().ownerSlug !== mySlug) get().hydrateFromCache(mySlug);
    saveToDisk(mySlug, spaceId);
    set({ lastActiveSpaceId: spaceId, ownerSlug: mySlug });
  },
  _resetForTests() {
    set({ lastActiveSpaceId: null, ownerSlug: null });
  },
}));
