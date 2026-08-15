import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Vibestrate runs on your machine, so the dashboard must open with no network.
 *
 * This is not only a speed rule, though it was a speed bug first: index.html
 * used to carry a render-blocking <link> to fonts.googleapis.com that fetched
 * nothing it used - every family is self-hosted - and told Google each time
 * anyone opened a local tool. Offline it blocked the first paint until the
 * request gave up.
 *
 * The fonts are OFL-1.1, which allows the bundling and requires the notice to
 * travel with them, so shipping a family without its licence is a compliance
 * bug and is asserted here too.
 */

const root = (p: string) => fileURLToPath(new URL("../" + p, import.meta.url));
const HTML = readFileSync(root("src/ui/index.html"), "utf8");
const CSS = readFileSync(root("src/ui/index.css"), "utf8");
const NOTICE = readFileSync(root("NOTICE"), "utf8");
const PKG = JSON.parse(readFileSync(root("package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Families the dashboard bundles, from the manifest rather than a hand-list -
 *  a family added tomorrow is covered without editing this file. */
function bundledFontPackages(): string[] {
  const all = { ...PKG.dependencies, ...PKG.devDependencies };
  return Object.keys(all)
    .filter((n) => n.startsWith("@fontsource"))
    .map((n) => n.split("/")[1] ?? n)
    .sort();
}

describe("the dashboard opens with no network", () => {
  it("loads no stylesheet, font or script from another origin", () => {
    // Tag with an absolute src/href. A protocol-relative //host is the same
    // request wearing a different spelling, so it is matched too.
    const external = [...HTML.matchAll(/<(?:link|script)\b[^>]*?(?:href|src)\s*=\s*"([^"]+)"/gi)]
      .map((m) => m[1] ?? "")
      .filter((u) => /^(?:https?:)?\/\//i.test(u));
    expect({ external }).toEqual({ external: [] });
  });

  it("pulls no CSS or font file over the network from the stylesheet", () => {
    const remote = [...CSS.matchAll(/(?:@import\s+|src\s*:\s*)[^;]*url\(\s*["']?((?:https?:)?\/\/[^"')]+)/gi)]
      .map((m) => m[1] ?? "");
    expect({ remote }).toEqual({ remote: [] });
  });
});

describe("bundled fonts carry their licence", () => {
  const families = bundledFontPackages();

  it("ships at least the families the UI is built on", () => {
    // Guards the scanner: a manifest read that silently found nothing would
    // make every assertion below vacuous.
    expect(families.length).toBeGreaterThanOrEqual(4);
  });

  it("has an OFL licence file for every bundled family", () => {
    const licences = readdirSync(root("LICENSES"));
    const missing = families.filter(
      (f) => !licences.some((l) => l.includes(f) && /OFL/i.test(l)),
    );
    expect({ missing }).toEqual({ missing: [] });
  });

  it("names every bundled family in NOTICE, with a copyright line", () => {
    // The licence text alone is not attribution: OFL asks for the copyright
    // notice, and a reader looks in NOTICE, not in a directory of legal text.
    // Matched case-insensitively on purpose - a package slug cannot tell you
    // that the brand is "JetBrains Mono" and not "Jetbrains Mono", and failing
    // over a capital B would be the test being wrong, not the notice.
    const flat = NOTICE.toLowerCase().replace(/\s+/g, " ");
    const missing = families.filter((f) => !flat.includes(f.replace(/-/g, " ")));
    expect({ missing }).toEqual({ missing: [] });
    expect(NOTICE).toMatch(/SIL Open Font License/i);
  });
});
