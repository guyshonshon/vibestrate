// ── Reading the handbook's sources from the repo ────────────────────────────
//
// Build-time only. Nothing in the CLI's runtime graph imports this file: the
// retriever reads the compiled corpus module instead, so a published install
// never looks for docs on disk. Kept next to the compiler so the generator and
// the drift test read the sources exactly the same way.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HandbookSources } from "./handbook-compile.js";

/** docs/generated files mined for ids only (flow ids, provider ids, role ids,
 *  run statuses). Their prose already lives in docs/content. */
const ID_SOURCE_FILES = [
  "flows.json",
  "providers.json",
  "agents.json",
  "policies.json",
  "workflow.json",
  "state-machine.json",
];

export function defaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

async function readMarkdownTree(root: string, prefix = ""): Promise<Array<{ slug: string; markdown: string }>> {
  const out: Array<{ slug: string; markdown: string }> = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await readMarkdownTree(root, rel)));
    } else if (entry.name.endsWith(".md")) {
      out.push({ slug: rel.slice(0, -3), markdown: await readFile(path.join(root, rel), "utf8") });
    }
  }
  return out;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/** Read every source the corpus is derived from. Fails loudly: a missing doc
 *  tree or a malformed generated JSON must break the build, not silently
 *  compile a thinner corpus. */
export async function readHandbookSources(repoRoot = defaultRepoRoot()): Promise<HandbookSources> {
  const contentDir = path.join(repoRoot, "docs", "content");
  const generatedDir = path.join(repoRoot, "docs", "generated");
  const docs = (await readMarkdownTree(contentDir)).sort((a, b) => a.slug.localeCompare(b.slug));
  if (!docs.length) throw new Error(`No docs found under ${contentDir}`);
  return {
    docs,
    nav: await readJson(path.join(contentDir, "_nav.json")),
    cli: await readJson(path.join(generatedDir, "cli-commands.json")),
    config: await readJson(path.join(generatedDir, "config-schema.json")),
    idSources: await Promise.all(ID_SOURCE_FILES.map((f) => readJson(path.join(generatedDir, f)))),
  };
}

export function corpusModulePath(repoRoot = defaultRepoRoot()): string {
  return path.join(repoRoot, "src", "consult", "handbook", "handbook-corpus.generated.ts");
}
