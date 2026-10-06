import { createHash, createPublicKey, verify } from "node:crypto";
import { realpathSync, renameSync, writeFileSync } from "node:fs";
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

export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(candidate), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

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
  const manifest = (await res.json()) as Partial<ReleaseManifest>;
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
      text: `update available: ${VERSION} -> ${manifest.version}. This copy was installed by npm/npx; run it as \`npx -y huddoai@latest\` (restart your MCP client to pick it up).`,
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
    text: `updated huddo ${VERSION} -> ${manifest.version} (${script}). Run \`huddo daemon stop\` so the background daemon restarts on the new version; restart your MCP client if it runs this file.`,
  };
}
