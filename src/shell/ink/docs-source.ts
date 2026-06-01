// Locate + read the bundled docs (docs/content) for the in-shell browser.
// The folder is shipped in the package `files`, resolved relative to this
// module so it works both from source (tsx) and the built dist.
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DOCS_WEBSITE = "https://vibestrate.com/docs";

export type DocTopic = { slug: string; label: string; section: string };

/**
 * Find the bundled `docs/content` by walking up from this module. The CLI ships
 * as a single bundled `dist/index.js` (docs at ../docs/content) but runs from
 * `src/shell/ink/…` under tsx (docs at ../../../docs/content), so a fixed
 * relative path can't cover both — we search ancestors instead.
 */
let cachedDir: string | null = null;
async function contentDir(): Promise<string> {
  if (cachedDir) return cachedDir;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, "docs", "content");
    try {
      if ((await stat(candidate)).isDirectory()) {
        cachedDir = candidate;
        return candidate;
      }
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("docs/content not found near the CLI bundle");
}

type Nav = {
  sections?: Array<{ label: string; items?: Array<{ slug: string; label: string }> }>;
};

/** The ordered, labelled topic list from `_nav.json`. Throws if docs aren't
 *  bundled (the caller shows a "visit the website" fallback). */
export async function listDocs(): Promise<DocTopic[]> {
  const raw = await readFile(path.join(await contentDir(), "_nav.json"), "utf8");
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
  const dir = await contentDir();
  const file = path.join(dir, `${slug}.md`);
  if (!path.resolve(file).startsWith(path.resolve(dir))) {
    throw new Error(`Doc path escapes the docs directory: ${slug}`);
  }
  return readFile(file, "utf8");
}
