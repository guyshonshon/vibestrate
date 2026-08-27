import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A control the docs tell you to press has to exist.
 *
 * Invented screens are the recurring defect in this corpus and the hardest to
 * catch by reading: the prose is plausible, the page renders, and only someone
 * with the component open knows the button is not there. Three have shipped -
 * a seat-resolution rule the resolver does not follow, captions describing
 * controls their screenshots do not contain, and a tab count off by three.
 *
 * The rule is deliberately narrow: only a bold span in an EXPLICIT control
 * claim - "**New run** button", "press **Pause**", "**Start run** opens" -
 * has to resolve. A bold span used as a card heading or for emphasis is prose
 * and is not checked, because widening this to every bold span buries the real
 * finding under a few hundred headings.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(repoRoot, "docs", "content");

/** Every string the product could render, as one haystack. */
function productSource(): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(readFileSync(full, "utf8"));
    }
  };
  for (const d of ["src/ui", "src/shell", "src/cli"]) walk(join(repoRoot, d));
  return out.join("\n");
}

function pages(dir = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(contentDir, dir))) {
    const rel = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(contentDir, rel)).isDirectory()) out.push(...pages(rel));
    else if (entry.endsWith(".md")) out.push(rel);
  }
  return out;
}

const NOUN = "(?:button|tab|toggle|switch|picker|dropdown|field|box|menu|row|panel|banner|chip|pill|tile)";
const CLAIMS = [
  new RegExp(`\\*\\*([^*]{2,34})\\*\\*\\s+${NOUN}\\b`, "g"),
  new RegExp(`\\b${NOUN}\\s+\\*\\*([^*]{2,34})\\*\\*`, "g"),
  /(?:press|presses|pressing|click|clicks|clicking)\s+\*\*([^*]{2,34})\*\*/g,
  /\*\*([^*]{2,34})\*\*\s+opens\b/g,
];

/**
 * Labels the product builds from a template, so no literal exists to match.
 * Each needs the source that renders it, so a rename still fails the test at
 * the line below rather than silently passing.
 */
const TEMPLATED: Record<string, string> = {
  // CrewEditorPage: `Save ${pendingWrites} change${...}`
  "Save N changes": "Save ${pendingWrites} change",
};

describe("docs name controls the product actually has", () => {
  const slugs = pages();
  const src = productSource();

  it("finds pages and product source at all", () => {
    // Either half resolving to nothing would turn this file green by checking
    // nothing, which is the failure mode a floor guards against.
    expect(slugs.length).toBeGreaterThan(50);
    expect(src.length).toBeGreaterThan(100_000);
  });

  it("resolves every control the docs tell you to press", () => {
    const claims: string[] = [];
    const bad: string[] = [];
    for (const slug of slugs) {
      const text = readFileSync(join(contentDir, slug), "utf8").replace(/```[\s\S]*?```/g, "");
      for (const pattern of CLAIMS) {
        for (const m of text.matchAll(pattern)) {
          // A label wrapped across a source line is still one label.
          const raw = (m[1] ?? "").replace(/\s+/g, " ").trim();
          claims.push(raw);
          // "More > Config" is a nav path; each hop is its own label.
          for (const label of raw.split(">").map((s) => s.trim())) {
            if (!label) continue;
            const templated = TEMPLATED[label];
            if (templated) {
              if (!src.includes(templated)) {
                bad.push(`${slug}: **${label}** is templated as \`${templated}\`, which no longer exists`);
              }
              continue;
            }
            if (!src.includes(label)) bad.push(`${slug}: **${label}** is not a control the product renders`);
          }
        }
      }
    }
    // A regex that stopped matching would report zero problems by finding
    // nothing to check.
    expect(claims.length).toBeGreaterThan(100);
    expect(bad.join("\n"), "controls the docs name that the product does not have").toBe("");
  });
});
