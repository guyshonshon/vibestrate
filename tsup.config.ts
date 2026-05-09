import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  dts: true,
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: true,
});
