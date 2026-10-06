import type { BrowserKeyStore } from "../../identity/primitives/keystore";

// Compatibility boundary for TypeScript authority / ceremonies that have not
// crossed the durable-secret cutover. Migrated Rust runtime paths must first
// resolve the registered opaque account authority and never call these reads.
export const loadLegacyIdentity = (store: BrowserKeyStore, slug: string) =>
  store.loadIdentity(slug);

export const loadLegacySession = (store: BrowserKeyStore, slug: string) =>
  store.loadSession(slug);
