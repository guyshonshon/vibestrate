import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The em dash is banned in this repo, in source and in anything a reader sees.
 *
 * It kept coming back because nothing checked: a form placeholder in the
 * policies panel shipped one as its example regex, and a stylesheet comment
 * carried another. Prose rules do not hold; a gate does.
 *
 * ONE deliberate exception, and it is the opposite of a violation: the code
 * that STRIPS em dashes has to name the character to match it.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["src", "docs/content", "README.md", "CHANGELOG.md"];
const EXT = new Set([".ts", ".tsx", ".css", ".md", ".json"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "generated"]);

/** Files allowed to contain the character, each with the reason it must. */
const ALLOWED = new Map<string, string>([
  [
    "src/ui/lib/guides/generated.ts",
    "the replace() that strips em dashes has to match the character",
  ],
]);

/**
 * A line where the character is the SUBJECT rather than prose. A documented
 * policy example has to contain the thing its pattern matches, exactly like
 * the strip function above. Kept as narrow as that one literal example form
 * so it cannot widen into a general escape hatch.
 */
function characterIsTheSubject(line: string): boolean {
  // A documented policy example must contain the pattern it matches.
  if (line.includes('--pattern "—"')) return true;
  // A character class enumerating dash variants, so a parser can strip
  // whichever one someone typed: `TODO — do the thing`. The en dash sitting
  // immediately before the em dash is what identifies it - that pairing does
  // not occur in prose.
  return line.includes("–—");
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.has(extname(entry))) out.push(full);
  }
  return out;
}

describe("no em dashes anywhere a reader can reach", () => {
  it("source and docs are clean", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      const abs = join(repoRoot, root);
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      // ROOTS names directories and a couple of single files.
      const files = stat.isDirectory() ? walk(abs, []) : [abs];
      for (const file of files) {
        const rel = relative(repoRoot, file);
        if (ALLOWED.has(rel)) continue;
        const text = readFileSync(file, "utf8");
        // The literal character, and the HTML entity that renders as one.
        text.split("\n").forEach((line, i) => {
          if (characterIsTheSubject(line)) return;
          if (line.includes("—") || line.includes("&mdash;")) {
            offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
          }
        });
      }
    }
    expect(offenders, `use "-" instead:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the allowlist stays honest", () => {
    // An entry that no longer contains the character is stale and must go,
    // otherwise the allowlist quietly grows into a bypass.
    for (const [rel, why] of ALLOWED) {
      const text = readFileSync(join(repoRoot, rel), "utf8");
      expect(text.includes("—"), `${rel} no longer needs its exemption (${why})`).toBe(true);
    }
  });
});
