import { useEffect, useRef } from "react";
import type { PuffoHttpClient } from "../../../http/client";
import { createBrowserPushPort } from "../adapters/browser-push";
import { readPrefs } from "../adapters/indexeddb-notification-preferences";
import { reconcilePushMode } from "../application/reconcile-push";

export function usePushSubscriptionReconcile(
  http: PuffoHttpClient | null,
  slug: string | null,
  serverUrl: string | null,
  sessionGeneration: number,
): void {
  const lastReconciledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!http || !slug || !serverUrl) return;
    const ownerKey = `${serverUrl}|${slug}|${sessionGeneration}`;
    if (lastReconciledKeyRef.current === ownerKey) return;
    lastReconciledKeyRef.current = ownerKey;

    let cancelled = false;
    void (async () => {
      const prefs = await readPrefs();
      if (cancelled) return;
      try {
        const outcome = await reconcilePushMode(
          createBrowserPushPort(http, { key: `${serverUrl}|${slug}`, generation: sessionGeneration }),
          prefs.mode,
          "background",
          () => !cancelled,
        );
        if (outcome.kind === "failed" || outcome.kind === "service_worker_unavailable") {
          throw outcome.kind === "failed" ? outcome.cause : new Error(outcome.kind);
        }
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("[push] boot reconcile failed:", err);
        lastReconciledKeyRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [http, serverUrl, sessionGeneration, slug]);
}
