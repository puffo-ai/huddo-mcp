import { useEffect, useState } from "react";
import {
  EMPTY_PREFS,
  readPrefs,
  subscribePrefsChanges,
  type NotificationPrefs,
} from "../adapters/indexeddb-notification-preferences";

export function usePrefs(): NotificationPrefs {
  const [prefs, setPrefs] = useState<NotificationPrefs>(EMPTY_PREFS);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void readPrefs().then((p) => {
        if (!cancelled) setPrefs(p);
      });
    };
    refresh();
    const unsub = subscribePrefsChanges(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return prefs;
}
