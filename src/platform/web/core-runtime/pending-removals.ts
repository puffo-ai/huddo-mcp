export const PENDING_CORE_REMOVALS_KEY = "huddo.core-pending-removals.v1";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function pendingCoreRemovals(storage: Store = localStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_CORE_REMOVALS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((slug): slug is string => typeof slug === "string") : [];
  } catch {
    return [];
  }
}

function save(slugs: readonly string[], storage: Store): void {
  try {
    if (slugs.length === 0) storage.removeItem(PENDING_CORE_REMOVALS_KEY);
    else storage.setItem(PENDING_CORE_REMOVALS_KEY, JSON.stringify(slugs));
  } catch {
  }
}

export function recordPendingCoreRemoval(slug: string, storage: Store = localStorage): void {
  const slugs = pendingCoreRemovals(storage);
  if (!slugs.includes(slug)) save([...slugs, slug], storage);
}

export function clearPendingCoreRemoval(slug: string, storage: Store = localStorage): void {
  save(
    pendingCoreRemovals(storage).filter((pending) => pending !== slug),
    storage,
  );
}
