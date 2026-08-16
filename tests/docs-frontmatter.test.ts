import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/**
 * Every docs page must have frontmatter that a YAML parser accepts.
 *
 * The docs site is Astro, and Astro parses this block with a real YAML parser
 * before it will build. Nothing in this repo did, so a page could pass the whole
 * suite and then fail the deploy. That happened: a description written as
 *
 *   description: "Show me how" turns an answer into a guided tour.
 *
 * starts with a double quote, so YAML reads a quoted scalar and then finds text
 * after the closing quote. The build died with "bad indentation of a mapping
 * entry" and the docs did not ship.
 *
 * A colon followed by a space does the same thing, and both are easy to write by
 * accident in a sentence. This is the cheapest possible guard against a class of
 * failure whose only other detector is a failed deploy.
 */

const DOCS = fileURLToPath(new URL("../docs/content", import.meta.url));

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pages(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const ALL = pages(DOCS);

describe("docs frontmatter", () => {
  it("finds the pages at all", () => {
    // Guards the walker: an empty list would make every assertion below pass
    // without testing anything, which is the failure mode this file exists for.
    expect(ALL.length).toBeGreaterThan(40);
  });

  it("parses as YAML on every page", () => {
    const broken: string[] = [];
    for (const file of ALL) {
      const src = readFileSync(file, "utf8");
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
      if (!block) {
        broken.push(`${file}: no frontmatter block`);
        continue;
      }
      try {
        parseYaml(block[1] ?? "");
      } catch (err) {
        broken.push(`${file}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    expect({ broken }).toEqual({ broken: [] });
  });

  it("carries title, description and slug on every page", () => {
    const missing: string[] = [];
    for (const file of ALL) {
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"));
      if (!block) continue;
      let data: Record<string, unknown> = {};
      try {
        data = (parseYaml(block[1] ?? "") ?? {}) as Record<string, unknown>;
      } catch {
        continue; // already reported above
      }
      for (const key of ["title", "description", "slug"]) {
        if (typeof data[key] !== "string" || !(data[key] as string).trim()) {
          missing.push(`${file}: ${key}`);
        }
      }
    }
    expect({ missing }).toEqual({ missing: [] });
  });
});
