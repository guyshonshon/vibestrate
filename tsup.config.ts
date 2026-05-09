import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts"],
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
