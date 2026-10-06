import type { WasmAccountKeyAuthorityFacade } from "../../protocol/wasm-protocol-facade";

export type RegisteredAccountKeyAuthority = Readonly<{
  namespace: string;
  generation: string;
  deviceId: string;
  subkeyId: string;
  subkeyExpiresAt?: number;
  authority: WasmAccountKeyAuthorityFacade;
}>;

const entries = new Map<string, RegisteredAccountKeyAuthority>();

export const accountKeyAuthorityNamespace = (serverUrl: string, slug: string): string =>
  `${serverUrl.trim().replace(/\/+$/, "")}\u0000${slug}`;

export function registerAccountKeyAuthority(
  entry: RegisteredAccountKeyAuthority,
): () => void {
  const current = entries.get(entry.namespace);
  if (current && current.authority !== entry.authority) {
    throw new Error("account key authority already registered");
  }
  entries.set(entry.namespace, entry);
  return () => {
    if (entries.get(entry.namespace)?.authority === entry.authority) entries.delete(entry.namespace);
  };
}

export function requireAccountKeyAuthority(
  serverUrl: string,
  slug: string,
): RegisteredAccountKeyAuthority {
  const namespace = accountKeyAuthorityNamespace(serverUrl, slug);
  const entry = entries.get(namespace);
  if (!entry) throw new Error("account key authority is not ready");
  return entry;
}

export function findAccountKeyAuthority(
  serverUrl: string,
  slug: string,
): RegisteredAccountKeyAuthority | null {
  return entries.get(accountKeyAuthorityNamespace(serverUrl, slug)) ?? null;
}

export function clearAccountKeyAuthorityRegistryForTests(): void {
  entries.clear();
}
