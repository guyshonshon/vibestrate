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
  // No `.d.ts`. This is a CLI: `main` points at the bundle, there is no `types`
  // or `exports` field, and nothing imports from it - the declarations shipped
  // to every install and were unreachable.
  dts: false,
  // Don't clean the whole `dist/` because the UI build also writes there.
  // The CLI bundle only writes index.js and a few siblings - overwriting them
  // is enough.
  clean: false,
  shims: false,
  splitting: false,
  sourcemap: true,
  // Runtime assets belong under `dist/`, not under a `src/` path inside a
  // package that ships no source. `resolvePromptsDir` already looks here
  // (REL_CANDIDATES in src/agents/default-roles.ts).
  async onSuccess() {
    const { cp } = await import("node:fs/promises");
    await cp("src/agents/default-prompts", "dist/default-prompts", {
      recursive: true,
    });
  },
});
