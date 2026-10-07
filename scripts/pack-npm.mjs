import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = "dist/npm";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const version = (await readFile("cli/version.ts", "utf8")).match(/"([\d.]+)"/)[1];
const huddoai = join(out, "huddoai");
await cp("npm/huddoai", huddoai, { recursive: true });
await copyFile("dist/huddo.mjs", join(huddoai, "huddo.mjs"));
const pkg = JSON.parse(await readFile(join(huddoai, "package.json"), "utf8"));
pkg.version = version;
await writeFile(join(huddoai, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

for (const dir of [huddoai, "integrations/opencode", "integrations/pi"]) {
  execFileSync("npm", ["pack", `./${dir}`, "--pack-destination", out], { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });
}
console.log((await readdir(out)).filter((f) => f.endsWith(".tgz")).join("\n"));
