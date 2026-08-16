#!/usr/bin/env node
/**
 * Write LICENSES/third-party-browser.txt: the attribution notice for the
 * third-party code that is INLINED into the dashboard bundle.
 *
 * Why this file has to exist
 * --------------------------
 * The published tarball ships `dist/ui/assets/*.js` - a couple of megabytes of
 * minified React, CodeMirror, xterm, highlight.js, visx and their transitive
 * deps - and ships no `node_modules`. That is binary redistribution: the usual
 * "the licence travels with the dependency" defence does not apply, because the
 * dependency does not travel, only its compiled code does. Minification strips
 * every `Copyright (c)` and `@license` comment on the way, so before this file
 * the tarball reproduced ~50 packages' code with zero attribution. highlight.js
 * is BSD-3-Clause, whose clause 2 asks for the notice in binary form by name;
 * MIT and ISC ask for the same thing in softer words.
 *
 * The CLI bundle is not affected: tsup marks `dependencies` external, so execa,
 * ink and fastify arrive from npm with their own licences intact.
 *
 * Where the list comes from
 * -------------------------
 * From the build's own sourcemaps, not from package.json. Three reasons:
 *
 *   1. `dependencies` is the wrong set. Every browser dep here is a
 *      devDependency (react-dom, @codemirror/*, @xterm/*, highlight.js, visx,
 *      lucide-react, react-grid-layout); `dependencies` holds the CLI's runtime
 *      deps, which are externalised and need no attribution. Walking the
 *      production tree would attribute the packages that do not need it and
 *      miss all the ones that do.
 *   2. Walking dependencies + devDependencies over-collects instead: vitest,
 *      typescript, tsup and vite drag in hundreds of packages that never reach
 *      a browser. A notice that claims to describe the bundle and lists code
 *      that is not in it is inaccurate in the other direction.
 *   3. Rollup's `sources` array is the exact post-tree-shaking module list for
 *      each emitted chunk. It is the shipped file describing itself, and it
 *      costs no build dependency - which is why this is ~150 lines of node
 *      rather than `rollup-plugin-license`.
 *
 * Sourcemap paths also solve pnpm: this repo's node_modules is not hoisted, so
 * a transitive package lives at `node_modules/.pnpm/<pkg>@<ver>/node_modules/
 * <pkg>`. The sourcemap records that real path, so the package root is a string
 * slice rather than a resolution algorithm that has to know about pnpm.
 *
 * CSS is derived separately (bare-specifier `@import`/`import` in src/ui),
 * because Vite emits no sourcemap for the stylesheet and Tailwind's preflight
 * and the xterm/react-grid-layout stylesheets are redistributed the same way.
 *
 * This module is also imported by tests/bundled-licences.test.ts, which is the
 * gate: a bundled package with no attribution entry fails there.
 *
 * Run: node scripts/generate-third-party-licenses.mjs  (chained after `vite build`)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "dist/ui/assets");
export const OUTPUT = join(ROOT, "LICENSES/third-party-browser.txt");

/**
 * The bundle has been in the 40-60 package range since the dashboard grew its
 * editor and charts. The floor is not a target, it is a scanner check: a path
 * shape that stops matching, or `build.sourcemap` being turned off, would
 * otherwise produce an empty notice and a green build. Failing closed here is
 * the whole point of the file.
 */
const MIN_EXPECTED_PACKAGES = 30;

/** Package roots reached from the emitted JS chunks, via their sourcemaps. */
function packagesFromSourcemaps() {
  if (!existsSync(ASSETS)) {
    throw new Error(`no ${ASSETS} - run \`pnpm build\` before generating the notice`);
  }
  const maps = readdirSync(ASSETS).filter((f) => f.endsWith(".js.map"));
  if (maps.length === 0) {
    throw new Error(
      `${ASSETS} has no .js.map files. Either build.sourcemap is off in ` +
        `vite.config.ts, or scripts/prepublish-trim.mjs has already stripped ` +
        `them - re-run \`pnpm build\`.`,
    );
  }

  const roots = new Map();
  for (const file of maps) {
    const map = JSON.parse(readFileSync(join(ASSETS, file), "utf8"));
    for (const source of map.sources ?? []) {
      // Sourcemap sources are relative to the map file, so resolve from there.
      // Then force forward slashes: rollup writes them, but `resolve` hands
      // back backslashes on Windows and the marker search below would find
      // nothing, produce an empty notice, and fail the Windows build only.
      const abs = resolve(ASSETS, source).replaceAll("\\", "/");
      const marker = abs.lastIndexOf("/node_modules/");
      if (marker < 0) continue;
      const segments = abs.slice(marker + "/node_modules/".length).split("/");
      const name = segments[0].startsWith("@")
        ? `${segments[0]}/${segments[1]}`
        : segments[0];
      roots.set(name, abs.slice(0, marker + "/node_modules/".length) + name);
    }
  }
  return roots;
}

/**
 * Packages whose CSS lands in the stylesheet. Vite emits no `.css.map`, so this
 * reads the imports instead: `@import "pkg"` in a stylesheet and
 * `import "pkg/thing.css"` in a component. Only bare specifiers count; a
 * relative path is our own code.
 */
function packagesFromStyleImports() {
  const names = new Set();
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") scan(full);
        continue;
      }
      if (!/\.(css|tsx?|jsx?)$/.test(entry.name)) continue;
      const text = readFileSync(full, "utf8");
      const specs = [
        ...text.matchAll(/@import\s+["']([^"']+)["']/g),
        ...text.matchAll(/^\s*import\s+["']([^"']+\.css)["']/gm),
      ].map((m) => m[1]);
      for (const spec of specs) {
        if (spec.startsWith(".") || spec.startsWith("/")) continue;
        const parts = spec.split("/");
        names.add(parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]);
      }
    }
  };
  scan(join(ROOT, "src/ui"));

  const roots = new Map();
  for (const name of names) {
    // A bare specifier only resolves for a direct dependency under pnpm's
    // strict layout, so the top-level link is the right and only place to look.
    const dir = join(ROOT, "node_modules", name);
    if (!existsSync(join(dir, "package.json"))) {
      throw new Error(
        `stylesheet imports "${name}" but node_modules/${name} is not installed`,
      );
    }
    roots.set(name, dir);
  }
  return roots;
}

/**
 * Codepoint order, never `localeCompare`. The generated file is compared byte
 * for byte by CI (`git diff --exit-code -- LICENSES`), and locale-aware
 * collation can order the same list differently under a different ICU build or
 * LANG. That would fail the gate on a runner rather than on anything real.
 */
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const ATTRIBUTION_FILE = /^(licen[cs]e|copying|notice)(\.|-|_|$)/i;
/** `license.js` and `notice.js` are both real npm filenames, and the name
 *  pattern alone would splice one into the notice as if it were licence text. */
const NOT_PROSE = /\.(js|mjs|cjs|ts|mts|cts|jsx|tsx|json|map|node|wasm|css|html)$/i;

/**
 * Every attribution file the package publishes, not a best guess at one.
 * A dual-licensed package ships LICENSE-MIT beside LICENSE-APACHE and picking
 * either would misstate the terms; an Apache-2.0 dependency ships a NOTICE
 * whose contents §4(d) says have to travel with the redistribution. Reproducing
 * all of them is both correct and shorter than the tie-break it replaces.
 */
function readAttribution(dir) {
  return readdirSync(dir)
    .filter(
      (f) =>
        ATTRIBUTION_FILE.test(f) && !NOT_PROSE.test(f) && statSync(join(dir, f)).isFile(),
    )
    .sort(byCodepoint)
    .map((file) => ({
      file,
      text: readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim(),
    }))
    .filter((f) => f.text.length > 0);
}

function homepageOf(pkg) {
  if (typeof pkg.homepage === "string") return pkg.homepage;
  const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (!repo) return null;
  return repo
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://");
}

function authorOf(pkg) {
  const a = pkg.author;
  if (typeof a === "string") return a.replace(/\s*<[^>]*>/g, "").trim() || null;
  if (a && typeof a.name === "string") return a.name;
  return null;
}

/**
 * Every third-party package whose code is inlined into the dashboard, with the
 * attribution material found on disk. Shared with the test so the notice and
 * the gate can never disagree about what "bundled" means.
 */
export function bundledBrowserPackages() {
  const roots = new Map([...packagesFromSourcemaps(), ...packagesFromStyleImports()]);
  if (roots.size < MIN_EXPECTED_PACKAGES) {
    throw new Error(
      `only ${roots.size} bundled packages found, expected at least ` +
        `${MIN_EXPECTED_PACKAGES}. The scan is broken, not the bundle.`,
    );
  }

  return [...roots]
    .sort(([a], [b]) => byCodepoint(a, b))
    .map(([name, dir]) => {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return {
        name,
        version: pkg.version ?? "unknown",
        // A non-string `license` is the deprecated `licenses: [...]` form or
        // nothing at all. Either way we do not know, and the gate says so.
        spdx: typeof pkg.license === "string" ? pkg.license : "UNKNOWN",
        homepage: homepageOf(pkg),
        author: authorOf(pkg),
        attribution: readAttribution(dir),
      };
    });
}

const RULE = "-".repeat(78);

export function renderNotice(packages) {
  // Width from the longest entry rather than a constant: a long scoped name
  // (@fontsource-variable/bricolage-grotesque) would otherwise butt straight
  // up against its licence id with no space between them.
  const labels = packages.map((p) => `${p.name}@${p.version}`);
  const width = Math.max(...labels.map((l) => l.length)) + 2;
  const index = packages
    .map((p, i) => `  ${labels[i].padEnd(width)}${p.spdx}`)
    .join("\n");

  const bodies = packages.map((p) => {
    const head = [
      RULE,
      `${p.name}@${p.version}`,
      p.homepage ? p.homepage : null,
      `SPDX-License-Identifier: ${p.spdx}`,
      "",
    ].filter((l) => l !== null);

    const body = p.attribution.length
      ? p.attribution
          // The filename is only worth printing when there is more than one:
          // it is what tells a reader that LICENSE-MIT and LICENSE-APACHE are
          // alternatives, or that a NOTICE sits beside the licence.
          .map((f) => (p.attribution.length > 1 ? `[${f.file}]\n\n${f.text}` : f.text))
          .join("\n\n")
      : [
          `This package publishes no licence file in its npm tarball. It declares`,
          `${p.spdx} in its package.json${p.author ? `, and names ${p.author} as its author` : ""}.`,
          `That declaration is the attribution available for it; the full text of`,
          `${p.spdx} is reproduced above under the other packages that use it.`,
        ].join("\n");

    return [...head, body].join("\n");
  });

  return `${[
    "Third-party software in the Vibestrate dashboard",
    "================================================",
    "",
    "The dashboard ships as a pre-built browser bundle (dist/ui/assets/*.js and",
    "the stylesheet beside them). Those files inline the third-party packages",
    "listed below, and the package carries no node_modules, so the licences do",
    "not arrive with the dependencies the way they do for the CLI. Minification",
    "also removes the copyright comments the sources carry. This file is where",
    "those notices are reproduced instead.",
    "",
    "It is generated from the build's own sourcemaps by",
    "scripts/generate-third-party-licenses.mjs, so it describes the code that is",
    "actually in the bundle after tree-shaking rather than what the manifest",
    "implies. tests/bundled-licences.test.ts fails the build if a bundled",
    "package is missing from it.",
    "",
    `Bundled packages (${packages.length})`,
    "",
    index,
    "",
    "",
  ].join("\n")}${bodies.join("\n\n")}\n${RULE}\n`;
}

function main() {
  const packages = bundledBrowserPackages();
  writeFileSync(OUTPUT, renderNotice(packages), "utf8");
  const unknown = packages.filter((p) => p.spdx === "UNKNOWN").length;
  console.log(
    `third-party-licenses: ${packages.length} bundled packages` +
      `${unknown ? `, ${unknown} with no declared licence` : ""} -> LICENSES/third-party-browser.txt`,
  );
}

// Only write when invoked directly; the test imports the derivation instead.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
