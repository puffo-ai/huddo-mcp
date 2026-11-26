export const WAKE_AFTER_HIDDEN_MS = 10_000;

type Target = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Calls `onWake` when the network comes back or the page is shown again after a while hidden. */
export function watchWake(
  onWake: () => void,
  doc: (Target & { visibilityState: DocumentVisibilityState }) | undefined = globalThis.document,
  win: Target | undefined = globalThis.window,
  now: () => number = Date.now,
): () => void {
  if (!doc || !win) return () => undefined;
  let hiddenAt = doc.visibilityState === "hidden" ? now() : null;
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") {
      hiddenAt = now();
      return;
    }
    if (hiddenAt !== null && now() - hiddenAt >= WAKE_AFTER_HIDDEN_MS) onWake();
    hiddenAt = null;
  };
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("online", onWake);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("online", onWake);
  };
}
