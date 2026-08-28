import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The docs diagrams are drawn to one idiom, and the drawing set repeats them.
 *
 * `architecture/schematics` collects every figure that also lives on the page
 * explaining it, so the same SVG exists in two files. Two copies of a drawing
 * is exactly the shape that drifts: someone fixes an arrow on the concept page
 * and the contact sheet keeps the old one. So a repeated figure has to be
 * byte-identical to its original, and every figure has to obey the house style
 * the other forty-odd diagrams already follow.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(repoRoot, "docs", "content");

function pages(dir = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(contentDir, dir))) {
    const rel = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(contentDir, rel)).isDirectory()) out.push(...pages(rel));
    else if (entry.endsWith(".md")) out.push(rel);
  }
  return out;
}

/** Every `<svg …>…</svg>` block in a page, verbatim. */
function figures(markdown: string): string[] {
  return [...markdown.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]);
}

/** An svg is identified by its aria-label, which states what it depicts. */
function ariaOf(svg: string): string | null {
  return /aria-label="([^"]+)"/.exec(svg)?.[1] ?? null;
}

const slugs = pages();
const all = slugs.flatMap((slug) =>
  figures(readFileSync(join(contentDir, slug), "utf8")).map((svg) => ({ slug, svg })),
);

describe("docs diagrams", () => {
  it("finds the diagrams at all", () => {
    // A regex that stopped matching would make every assertion below vacuous.
    expect(all.length).toBeGreaterThan(40);
  });

  it("gives every diagram an aria-label", () => {
    const bad = all.filter((f) => !ariaOf(f.svg)).map((f) => f.slug);
    expect(bad.join(", "), "diagrams with no aria-label").toBe("");
  });

  it("keeps every diagram inside the article column", () => {
    // The docs article is 760px. A figure wider than that pushes the page
    // sideways, which is the one thing a diagram must never do.
    const bad: string[] = [];
    for (const { slug, svg } of all) {
      const max = /max-width:\s*(\d+)px/.exec(svg)?.[1];
      if (!max) bad.push(`${slug}: no max-width`);
      else if (Number(max) > 760) bad.push(`${slug}: max-width ${max}px is wider than the column`);
    }
    expect(bad.join("\n")).toBe("");
  });

  it("paints every diagram from the design tokens", () => {
    // A figure takes its colour from the site's own tokens (--violet-deep,
    // --fg-100, --bg-200) or inherits it with currentColor. A literal hex is a
    // colour that stops tracking the design the moment a token moves, and is
    // how a drawing ends up looking foreign on the page it sits in.
    //
    // One exception: text sitting ON a violet badge fill stays #ffffff. It is
    // white because the fill behind it is dark violet, not because a token
    // happens to be white today.
    const bad: string[] = [];
    for (const { slug, svg } of all) {
      for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8}|rgb[^"]*)"/g)) {
        if (m[1]!.toLowerCase() === "#ffffff") continue;
        bad.push(`${slug}: literal colour ${m[1]}`);
      }
    }
    expect(bad.join("\n"), "diagrams that hard-code a colour").toBe("");
  });

  it("keeps a repeated diagram identical to its original", () => {
    const byAria = new Map<string, { slug: string; svg: string }[]>();
    for (const f of all) {
      const aria = ariaOf(f.svg);
      if (!aria) continue;
      byAria.set(aria, [...(byAria.get(aria) ?? []), f]);
    }
    const drifted: string[] = [];
    for (const [aria, copies] of byAria) {
      if (copies.length < 2) continue;
      const first = copies[0]!;
      for (const other of copies.slice(1)) {
        if (other.svg !== first.svg) {
          drifted.push(
            `"${aria.slice(0, 60)}..." differs between ${first.slug} and ${other.slug}`,
          );
        }
      }
    }
    expect(drifted.join("\n"), "a repeated diagram drifted from its original").toBe("");
  });
});
