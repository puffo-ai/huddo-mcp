import { create } from "zustand";

export type IdentityType = "human" | "agent";

interface IdentityTypeState {
  types: Record<string, IdentityType>;
  upsertMany(entries: { slug: string; identity_type?: string | null }[]): void;
  get(slug: string): IdentityType | undefined;
  reset(): void;
}
export const useIdentityTypeStore = create<IdentityTypeState>((set, get) => ({
  types: {},
  upsertMany: (entries) =>
    set((state) => {
      const next = { ...state.types };
      for (const entry of entries) {
        if (!entry.slug) continue;
        if (entry.identity_type === "human" || entry.identity_type === "agent") {
          next[entry.slug] = entry.identity_type;
        }
      }
      return { types: next };
    }),
  get: (slug) => get().types[slug],
  reset: () => set({ types: {} }),
}));
