import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The changelog has exactly one place that accumulates work, and the release
 * step versions it.
 *
 * A merge produced two `## Unreleased` sections, one from each side, and
 * nothing noticed. That is not cosmetic: the release step renames the
 * Unreleased heading, so with two of them the second section's entries end up
 * stranded UNDER a published version heading, claiming to have shipped in a
 * release that never contained them. The file is also an authoritative doc
 * that later sessions read for recent history, it ships inside the npm
 * tarball, and it is rendered at /changelog.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");

/** Top-level release headings, in file order. */
function releaseHeadings(): string[] {
  return changelog
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());
}

describe("changelog structure", () => {
  it("has at most one Unreleased section", () => {
    const unreleased = releaseHeadings().filter((h) => h === "Unreleased");
    expect(
      unreleased.length,
      "a merge can leave one per side; fold them into the first and delete the second heading",
    ).toBeLessThanOrEqual(1);
  });

  it("keeps Unreleased at the top, above every published version", () => {
    const headings = releaseHeadings();
    const at = headings.indexOf("Unreleased");
    // Absent is legitimate right after a release cut.
    if (at === -1) return;
    expect(
      at,
      `Unreleased must precede every version heading, found it after: ${headings.slice(0, at).join(", ")}`,
    ).toBe(0);
  });

  it("never lists the same version twice on the current numbering line", () => {
    // Scoped to the headings above `## Earlier releases` on purpose. The
    // project renumbered DOWN from 1.1.7 to 0.1.0, so the archive below that
    // divider legitimately reuses 0.1.0 through 0.3.0 from the original 0.x
    // line. Checking the whole file would flag that history as a defect.
    const headings = releaseHeadings();
    const divider = headings.indexOf("Earlier releases");
    const current = divider === -1 ? headings : headings.slice(0, divider);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const heading of current) {
      if (heading === "Unreleased") continue;
      if (seen.has(heading)) duplicates.push(heading);
      seen.add(heading);
    }
    expect(duplicates, "a duplicated version heading splits one release in two").toEqual([]);
  });
});
