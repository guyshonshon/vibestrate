#!/usr/bin/env node
/**
 * Strip sourcemaps from dist/ before publishing.
 *
 * The dev build emits `.map` files (useful locally), but they're dead
 * weight in the published npm tarball — users never step into Amaco's
 * compiled output. Removing them takes the package from ~4 MB to ~1.5 MB.
 *
 * Runtime assets (the Mission Control UI bundle, fonts, logos) are left
 * untouched. Runs from `prepublishOnly` after `pnpm build`.
 */
import { readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

let removed = 0;
let bytes = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".map") || entry.name === "logo.original.png") {
      // .map: dead weight (see above). logo.original.png: an unreferenced
      // source original kept in src/ui/public; the UI only uses logo.png.
      bytes += statSync(full).size;
      rmSync(full);
      removed++;
    }
  }
}

try {
  walk(distDir);
  console.log(
    `prepublish-trim: removed ${removed} sourcemap(s), ${(bytes / 1e6).toFixed(1)} MB`,
  );
} catch (err) {
  // dist not built yet → nothing to trim; let the build step handle errors.
  console.warn("prepublish-trim: skipped —", err.message);
}
