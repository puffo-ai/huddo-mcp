import type { BrowserKeyStore } from "../../identity/primitives/keystore";

export const loadLegacyIdentity = (store: BrowserKeyStore, slug: string) =>
  store.loadIdentity(slug);

export const loadLegacySession = (store: BrowserKeyStore, slug: string) =>
  store.loadSession(slug);
