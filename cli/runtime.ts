import { createWasmCrypto } from "../src/identity/primitives/wasm-crypto";
import { PuffoHttpClient } from "../src/http/client";
import type { CryptoOps } from "../src/http/types";
import type { StoredIdentity } from "../src/identity/primitives/keystore";
import type { SpaceEventSigner } from "../src/event/signed-space-event";
import { installSubkeyCertAuthorityPort } from "../src/application/runtime/subkey-cert-authority-port";
import { createTypeScriptSubkeyCertAuthorityPort } from "../src/application/runtime/subkey-cert-authority-typescript-adapter";
import { installRootDeviceCertAuthorityPort } from "../src/application/runtime/root-device-cert-authority-port";
import { createTypeScriptRootDeviceCertAuthorityPort } from "../src/application/runtime/root-device-cert-authority-typescript-adapter";
import {
  createTypeScriptSpacesMembershipCommandPort,
  installSpacesMembershipCommandPort,
} from "../src/application/runtime/spaces-membership-command-port";
import { FileKeyStore } from "./keystore";
import { setWhisperOpener } from "./rows";
import { openWhisper } from "../src/huddo/whisper";
import { SERVER_URL, listIdentitySlugs, loadConfig } from "./home";

export interface Runtime {
  crypto: CryptoOps;
  keyStore: FileKeyStore;
  http(slug?: string, serverUrl?: string): PuffoHttpClient;
}

export interface Account {
  identity: StoredIdentity;
  http: PuffoHttpClient;
}

let runtime: Promise<Runtime> | null = null;

export function getRuntime(): Promise<Runtime> {
  runtime ??= createRuntime().catch((e: unknown) => {
    runtime = null;
    throw e;
  });
  return runtime;
}

async function createRuntime(): Promise<Runtime> {
  const crypto = await createWasmCrypto();
  installSubkeyCertAuthorityPort(createTypeScriptSubkeyCertAuthorityPort());
  installRootDeviceCertAuthorityPort(createTypeScriptRootDeviceCertAuthorityPort());
  installSpacesMembershipCommandPort(createTypeScriptSpacesMembershipCommandPort());
  const keyStore = new FileKeyStore();
  return {
    crypto,
    keyStore,
    http: (slug = "", serverUrl = SERVER_URL) =>
      new PuffoHttpClient(serverUrl, keyStore.asBrowserKeyStore(), crypto, slug),
  };
}

export function activeSlug(as?: string): string | null {
  if (as) {
    if (!listIdentitySlugs().includes(as)) throw new Error(`no identity ${as} in this HUDDO_HOME (see huddo identity list)`);
    return as;
  }
  const active = loadConfig().active;
  if (active && listIdentitySlugs().includes(active)) return active;
  return null;
}

export function accountFor(rt: Runtime, slug: string): Account {
  const identity = rt.keyStore.identity(slug);
  if (!identity) throw new Error(`no identity ${slug} in this HUDDO_HOME`);
  setWhisperOpener((sealed, ctx) =>
    sealed.to === identity.slug || ctx.sender === identity.slug
      ? openWhisper(rt.crypto, sealed, ctx, identity.device_id, (enc, info, aad, ct) =>
          rt.crypto.hpkeOpen(identity.kem_secret_key, enc, info, aad, ct))
      : null);
  const serverUrl = process.env.HUDDO_SERVER_URL ? SERVER_URL : identity.server_url;
  return { identity: { ...identity, server_url: serverUrl }, http: rt.http(identity.slug, serverUrl) };
}

export function requireAccount(rt: Runtime, as?: string): Account {
  const slug = activeSlug(as);
  if (!slug) throw new Error("no identity yet: run `huddo join <invite>` or `huddo identity new` first");
  return accountFor(rt, slug);
}

export async function eventSigner(rt: Runtime, account: Account): Promise<SpaceEventSigner> {
  await account.http.ensureAccountSubkey();
  const session = await rt.keyStore.loadSession(account.identity.slug);
  if (!session) throw new Error("no active device session");
  return {
    slug: account.identity.slug,
    deviceId: session.device_id,
    subkeyId: session.subkey_id,
    subkeySecretKey: session.subkey_secret_key,
  };
}
