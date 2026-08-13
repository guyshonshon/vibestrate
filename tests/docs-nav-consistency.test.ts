import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `docs/content/_nav.json` is the single source of truth for how the docs are
 * grouped, ordered and labelled - the in-shell reader
 * (src/shell/ink/docs-source.ts) builds its topic list from it and reads
 * nothing else. These checks keep any second copy of that grouping from
 * appearing: a page must be in the nav exactly once, a nav entry must point at
 * a real page (or declare itself generated), and a page must not carry its own
 * `section`, which used to sit in frontmatter and drift unnoticed because
 * nothing read it.
 */
const contentDir = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/content");

type NavItem = { slug: string; label: string; generated?: boolean; source?: string };
type Nav = { sections: Array<{ id: string; label: string; items: NavItem[] }> };

const nav = JSON.parse(readFileSync(join(contentDir, "_nav.json"), "utf8")) as Nav;

/** Every `.md` under docs/content, as nav slugs (path without the extension). */
function pageSlugs(dir = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(contentDir, dir))) {
    const rel = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(contentDir, rel)).isDirectory()) out.push(...pageSlugs(rel));
    else if (entry.endsWith(".md")) out.push(rel.slice(0, -".md".length));
  }
  return out.sort();
}

/** The raw `key: value` lines of a page's leading YAML frontmatter block. */
function frontmatter(slug: string): Record<string, string> {
  const text = readFileSync(join(contentDir, `${slug}.md`), "utf8");
  // \r? on both anchors: git checks these out with CRLF under the Windows
  // default core.autocrlf, so an LF-only pattern reads every page as having no
  // frontmatter at all. Tolerating it here rather than pinning the files to LF
  // is deliberate - people author docs on Windows too, and a parser that only
  // accepts one line ending would reject their contributions for invisible
  // reasons.
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) throw new Error(`${slug}.md has no frontmatter block`);
  const [, block = ""] = match;
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0 && !line.startsWith(" ")) {
      fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return fields;
}

const slugs = pageSlugs();
const navItems = nav.sections.flatMap((s) => s.items);

describe("docs nav is the single source of truth", () => {
  it("lists every page exactly once", () => {
    const listed = navItems.map((i) => i.slug);
    expect(new Set(listed).size).toBe(listed.length);
    const orphans = slugs.filter((s) => !listed.includes(s));
    expect(orphans, "pages missing from docs/content/_nav.json").toEqual([]);
  });

  it("points every non-generated entry at a real page", () => {
    const dangling = navItems
      .filter((i) => !i.generated && !slugs.includes(i.slug))
      .map((i) => i.slug);
    expect(dangling, "nav entries with no markdown file").toEqual([]);
  });

  it("names a source for every generated entry", () => {
    for (const item of navItems.filter((i) => i.generated)) {
      expect(item.source, `${item.slug} is generated but names no source`).toBeTruthy();
      expect(slugs).not.toContain(item.slug);
    }
  });

  it("keeps section ids and labels unique", () => {
    const ids = nav.sections.map((s) => s.id);
    const labels = nav.sections.map((s) => s.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps grouping out of page frontmatter", () => {
    const withSection = slugs.filter((s) => "section" in frontmatter(s));
    expect(
      withSection,
      "pages carrying a `section:` - grouping belongs to _nav.json alone",
    ).toEqual([]);
  });

  it("keeps the frontmatter slug equal to the file path", () => {
    const wrong = slugs
      .map((s) => [s, frontmatter(s).slug] as const)
      .filter(([s, declared]) => declared !== s);
    expect(wrong, "pages whose frontmatter slug does not match their path").toEqual([]);
  });
});
