import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const wasmBytes = {
  name: "wasm-bytes",
  setup(b) {
    b.onResolve({ filter: /\.wasm\?url$/ }, (args) => ({
      path: require.resolve(args.path.replace(/\?url$/, ""), { paths: [args.resolveDir] }),
      namespace: "wasm-bytes",
    }));
    b.onLoad({ filter: /.*/, namespace: "wasm-bytes" }, async (args) => ({
      contents: await readFile(args.path),
      loader: "binary",
    }));
  },
};

await build({
  entryPoints: ["cli/huddo.ts"],
  outfile: "dist/huddo.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "none",
  logLevel: "warning",
  banner: { js: "#!/usr/bin/env node" },
  define: {
    "import.meta.env": JSON.stringify({ MODE: "production", PROD: true, DEV: false }),
  },
  plugins: [wasmBytes],
});
console.log("built dist/huddo.mjs");
