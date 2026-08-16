import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The published package ships the dashboard as a pre-built browser bundle and
 * ships no node_modules. That inlines ~60 third-party packages into
 * dist/ui/assets/*.js with their copyright comments minified away, which is
 * binary redistribution without attribution: highlight.js is BSD-3-Clause and
 * its clause 2 asks for the notice by name, and MIT and ISC ask for the same
 * thing in softer words.
 *
 * scripts/generate-third-party-licenses.mjs writes that attribution to
 * LICENSES/third-party-browser.txt as part of `pnpm build:ui`. This file is the
 * gate on it, and it is the same shape as the font gate in offline-first.test.ts:
 * the list of things needing attribution is DERIVED, never hand-written, so a
 * dependency added tomorrow is covered without anyone remembering to edit a
 * test. The difference is only where the list comes from - the fonts come from
 * the manifest, the browser packages come from the build's own sourcemaps,
 * because every browser dep here is a devDependency and most are transitive.
 */

const root = (p: string) => fileURLToPath(new URL("../" + p, import.meta.url));

type BundledPackage = {
  name: string;
  version: string;
  spdx: string;
  /** Every LICENSE / COPYING / NOTICE file the package publishes, verbatim. */
  attribution: { file: string; text: string }[];
};

/** The generator is plain node so `pnpm build` can run it with no toolchain.
 *  Typed once here, at the boundary, rather than at each call site. */
const { bundledBrowserPackages, renderNotice, OUTPUT } = (await import(
  root("scripts/generate-third-party-licenses.mjs")
)) as {
  bundledBrowserPackages: () => BundledPackage[];
  renderNotice: (packages: BundledPackage[]) => string;
  OUTPUT: string;
};

/**
 * Licences that permit redistribution of a binary as long as the notice travels
 * with it, which is what this file ships. Anything outside the list is not
 * necessarily unusable, but it is a decision someone has to make deliberately
 * rather than discover after publishing: a copyleft licence reaching the bundle
 * would put source-availability terms on a shipped artifact.
 */
const NOTICE_ONLY_LICENCES = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "OFL-1.1",
  "Unlicense",
  "Zlib",
]);

/** "(MIT OR Apache-2.0)" -> ["MIT", "Apache-2.0"]. Every token must pass: an
 *  AND expression really does impose both, and being strict about OR costs a
 *  one-line allowlist edit while being loose about AND costs a licence breach. */
function spdxTokens(expression: string): string[] {
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND|WITH)\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

describe("bundled browser code carries its attribution", () => {
  let packages: BundledPackage[];
  let notice: string;

  beforeAll(() => {
    // Hard failure, not a skip - the same call tests/cli-bin-entrypoint.test.ts
    // makes about dist/index.js. A compliance gate that quietly reports
    // "skipped" on an unbuilt tree is a gate you find out about after
    // publishing. CI builds before it tests for exactly this reason.
    if (!existsSync(root("dist/ui/assets"))) {
      throw new Error(
        "dist/ui/assets not found - run `pnpm build` before this test. The " +
          "attribution notice is derived from the built bundle's sourcemaps.",
      );
    }
    packages = bundledBrowserPackages();
    notice = readFileSync(OUTPUT, "utf8");
  });

  it("finds the packages that are actually in the bundle", () => {
    // Guards the scanner the way the font test guards its manifest read: a
    // derivation that silently found nothing would make everything below
    // vacuous, and "no third-party code" is never the true answer here.
    expect(packages.length).toBeGreaterThanOrEqual(30);
    // Named because each is a different way into the bundle and a different
    // licence family: an entry chunk, a lazily-imported one, a transitive dep
    // nobody declared, and a stylesheet with no sourcemap to find it by.
    const names = packages.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["react-dom", "highlight.js", "d3-shape", "tailwindcss"]),
    );
  });

  it("names every bundled package in the notice, with its version and licence", () => {
    const missing = packages
      .filter((p) => !notice.includes(`${p.name}@${p.version}`))
      .map((p) => `${p.name}@${p.version}`);
    expect({ missing }).toEqual({ missing: [] });
  });

  it("reproduces every attribution file each package publishes, in full", () => {
    // Naming a package is not attribution. BSD-3-Clause clause 2 asks for the
    // copyright notice and the conditions reproduced in binary form, so the
    // text has to be there whole - a truncated or summarised body would pass a
    // name check and fail the licence. Every file counts, not just the first:
    // a dual-licensed package states its terms across two of them, and an
    // Apache-2.0 dependency's NOTICE has to travel under its own §4(d).
    const truncated = packages.flatMap((p) =>
      p.attribution.filter((f) => !notice.includes(f.text)).map((f) => `${p.name}/${f.file}`),
    );
    expect({ truncated }).toEqual({ truncated: [] });
  });

  it("knows the licence of every bundled package", () => {
    // A package with no licence file AND no declared licence cannot be
    // attributed at all, and is a redistribution we have no permission for.
    const undeclared = packages
      .filter((p) => p.spdx === "UNKNOWN" && p.attribution.length === 0)
      .map((p) => p.name);
    expect({ undeclared }).toEqual({ undeclared: [] });
  });

  it("bundles only licences a notice file can satisfy", () => {
    const unexpected = packages
      .filter((p) => !spdxTokens(p.spdx).every((t) => NOTICE_ONLY_LICENCES.has(t)))
      .map((p) => `${p.name}: ${p.spdx}`);
    expect({ unexpected }).toEqual({ unexpected: [] });
  });

  it("has a notice matching the current bundle, not a stale committed copy", () => {
    // The teeth for "the generator is still wired into the build". If the step
    // is dropped from build:ui, the file on disk keeps describing whatever the
    // bundle looked like when someone last ran it, and only a byte comparison
    // against a fresh render notices.
    expect(notice).toEqual(renderNotice(packages));
  });
});

describe("the attribution notice is publishable", () => {
  it("is shipped by the files whitelist", () => {
    const pkg = JSON.parse(readFileSync(root("package.json"), "utf8")) as {
      files: string[];
    };
    // `files` lists the LICENSES directory, so a file inside it ships without
    // its own entry. Asserted because the reverse - someone narrowing the entry
    // to specific licence files - would drop this one with nothing else failing.
    expect(pkg.files).toContain("LICENSES");
  });

  it("is pointed at from NOTICE", () => {
    // NOTICE is where a reader looks first, and Apache-2.0 §4(d) makes it the
    // file that has to travel. The fonts are named there in full; the browser
    // packages are too many for that, so NOTICE points at the generated file.
    const NOTICE = readFileSync(root("NOTICE"), "utf8");
    expect(NOTICE).toContain("LICENSES/third-party-browser.txt");
  });
});
