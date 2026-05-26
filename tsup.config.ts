import { defineConfig } from "tsup";

export default defineConfig({
  // The CLI binary and the dashboard's headless run entry. The server spawns
  // `dist/run-entry.js` (core) rather than the CLI, keeping UI ⇄ CLI decoupled.
  // Object form pins output names so the bin stays `dist/index.js` (not
  // `dist/cli/index.js`, which multi-entry would otherwise produce).
  entry: { index: "src/cli/index.ts", "run-entry": "src/core/run-entry.ts" },
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  dts: true,
  // Don't clean the whole `dist/` because the UI build also writes there.
  // The CLI bundle only writes index.js and a few siblings — overwriting them
  // is enough.
  clean: false,
  shims: false,
  splitting: false,
  sourcemap: true,
});
