import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A docs page is its sections. No section may swallow the page.
 *
 * Every page used to file its real content under one catch-all `## Going
 * deeper`, which rendered as a short intro plus a single closed box holding
 * everything else - and the site then folded that box's own sub-headings a
 * second time, putting the content two clicks down. Flattening fixed it, but
 * nothing stopped it coming back: the next page written to the old template
 * would re-create both levels on its own.
 *
 * Two rules, because the shape has two halves.
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

/** Headings outside fenced code, which contains `#` comments and shell prompts. */
function headings(markdown: string): { depth: number; text: string }[] {
  const out: { depth: number; text: string }[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = /^(#{2,4}) (.+)$/.exec(line);
    if (m) out.push({ depth: m[1]!.length, text: m[2]!.trim() });
  }
  return out;
}

const slugs = pages();

describe("docs pages are their sections", () => {
  it("finds the pages at all", () => {
    // A path that stops resolving would turn this file green by checking
    // nothing, which is the failure mode a count guards against.
    expect(slugs.length).toBeGreaterThan(50);
  });

  it("has no catch-all section", () => {
    // "Going deeper" was the label on the box that held the page. A section
    // deserves the name of what is in it; if the only name that fits is
    // "the rest of the page", it is not a section.
    const bad: string[] = [];
    for (const slug of slugs) {
      for (const h of headings(readFileSync(join(contentDir, slug), "utf8"))) {
        if (/^going deeper$/i.test(h.text)) {
          bad.push(`${slug}: '${"#".repeat(h.depth)} ${h.text}'`);
        }
      }
    }
    expect(bad.join("\n"), "catch-all sections - name the section for its content").toBe("");
  });

  it("lets no single section hold more than a third of a page", () => {
    // The collapsed page is a list of its `##` chapters, so that list has to
    // describe the page. One chapter holding most of the headings means the
    // real chapters are hiding a level down and want promoting to `##`.
    // The step-by-step guides legitimately nest - a numbered step with
    // sub-steps - and sit near 15%, so this leaves them room to grow.
    const bad: string[] = [];
    for (const slug of slugs) {
      const heads = headings(readFileSync(join(contentDir, slug), "utf8"));
      if (heads.length < 6) continue; // too short for any section to dominate
      const limit = heads.length / 3;
      let current: string | null = null;
      let held = 0;
      const flush = (): void => {
        if (current && held > limit) {
          bad.push(
            `${slug}: '## ${current}' holds ${held} of ${heads.length} headings - promote them to '##'`,
          );
        }
      };
      for (const h of heads) {
        if (h.depth === 2) {
          flush();
          current = h.text;
          held = 0;
        } else held += 1;
      }
      flush();
    }
    expect(bad.join("\n"), "sections that swallow their page").toBe("");
  });
});
