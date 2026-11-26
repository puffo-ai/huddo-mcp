import { createHash, createPublicKey, verify } from "node:crypto";
import { realpathSync, renameSync, writeFileSync } from "node:fs";
import { isNewer } from "../src/huddo/changelog";
import { ORIGIN } from "./home";
import { RELEASE_PUBLIC_KEY } from "./release-key";
import { VERSION } from "./version";

export interface ReleaseManifest {
  version: string;
  sha256: string;
  signature: string;
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export class UpdateError extends Error {}

export { isNewer };

export function verifyRelease(bytes: Uint8Array, manifest: ReleaseManifest, publicKey = RELEASE_PUBLIC_KEY): boolean {
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) return false;
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, "base64")]),
    format: "der",
    type: "spki",
  });
  try {
    return verify(null, bytes, key, Buffer.from(manifest.signature, "base64"));
  } catch {
    return false;
  }
}

export function installedViaPackageManager(scriptPath: string): boolean {
  return /[\\/](_npx|node_modules)[\\/]/.test(scriptPath);
}

async function fetchManifest(): Promise<ReleaseManifest> {
  const res = await fetch(`${ORIGIN}/cli/version.json`);
  if (!res.ok) throw new UpdateError(`could not read ${ORIGIN}/cli/version.json (HTTP ${res.status})`);
  let manifest: Partial<ReleaseManifest>;
  try {
    manifest = (await res.json()) as Partial<ReleaseManifest>;
  } catch {
    throw new UpdateError(`${ORIGIN} has no signed CLI release (${ORIGIN}/cli/version.json is not a release manifest)`);
  }
  if (!manifest.version || !manifest.sha256 || !manifest.signature) {
    throw new UpdateError("the published release is not signed; refusing to update");
  }
  return manifest as ReleaseManifest;
}

export async function update(opts: { check?: boolean; scriptPath?: string } = {}) {
  const manifest = await fetchManifest();
  if (!isNewer(manifest.version, VERSION)) {
    return { json: { current: VERSION, latest: manifest.version, updated: false }, text: `huddo ${VERSION} is up to date` };
  }
  if (opts.check) {
    return {
      json: { current: VERSION, latest: manifest.version, updated: false },
      text: `update available: ${VERSION} -> ${manifest.version} (run: huddo update)`,
    };
  }
  const script = realpathSync(opts.scriptPath ?? process.argv[1]);
  if (installedViaPackageManager(script)) {
    return {
      json: { current: VERSION, latest: manifest.version, updated: false },
      text: `update available: ${VERSION} -> ${manifest.version}. This copy was installed by npm/npx; run it as \`npx -y huddoai@latest\`.`,
    };
  }
  const res = await fetch(`${ORIGIN}/cli/huddo.mjs`);
  if (!res.ok) throw new UpdateError(`download failed (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!verifyRelease(bytes, manifest)) {
    throw new UpdateError("the downloaded file does not match the signed release; not installing it");
  }
  const staged = `${script}.new`;
  writeFileSync(staged, bytes);
  renameSync(staged, script);
  return {
    json: { previous: VERSION, current: manifest.version, updated: true, path: script },
    text: `updated huddo ${VERSION} -> ${manifest.version} (${script}). The background daemon picks it up on the next command.`,
  };
}
