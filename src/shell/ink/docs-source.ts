// Locate + read the bundled docs (docs/content) for the in-shell browser.
// The folder is shipped in the package `files`, resolved relative to this
// module so it works both from source (tsx) and the built dist.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DOCS_WEBSITE = "https://vibestrate.shonshon.com/docs";

export type DocTopic = { slug: string; label: string; section: string };

function contentDir(): string {
  // src/shell/ink/… and dist/shell/ink/… are both three levels below the
  // package root, where docs/content lives.
  return fileURLToPath(new URL("../../../docs/content/", import.meta.url));
}

type Nav = {
  sections?: Array<{ label: string; items?: Array<{ slug: string; label: string }> }>;
};

/** The ordered, labelled topic list from `_nav.json`. Throws if docs aren't
 *  bundled (the caller shows a "visit the website" fallback). */
export async function listDocs(): Promise<DocTopic[]> {
  const raw = await readFile(path.join(contentDir(), "_nav.json"), "utf8");
  const nav = JSON.parse(raw) as Nav;
  const topics: DocTopic[] = [];
  for (const sec of nav.sections ?? []) {
    for (const it of sec.items ?? []) {
      topics.push({ slug: it.slug, label: it.label, section: sec.label });
    }
  }
  return topics;
}

/** Read one doc's markdown by slug. The slug is validated to stay inside the
 *  docs dir (no traversal) before reading. */
export async function readDoc(slug: string): Promise<string> {
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(slug) || slug.includes("..")) {
    throw new Error(`Invalid doc slug: ${slug}`);
  }
  const dir = contentDir();
  const file = path.join(dir, `${slug}.md`);
  if (!path.resolve(file).startsWith(path.resolve(dir))) {
    throw new Error(`Doc path escapes the docs directory: ${slug}`);
  }
  return readFile(file, "utf8");
}
