// ── Handbook compiler: Vibestrate's own docs -> a retrievable corpus ────────
//
// WHY DETERMINISTIC, AND WHY NO EMBEDDINGS.
// Consult knows the user's project but not the product, so asked "how do I make
// a crew" it improvises. This module compiles Vibestrate's own documentation
// into a small keyword-indexed corpus that consult retrieves from. It is
// deliberately deterministic - no embedding model, no vector store, no hosted
// call - because:
//   1. The corpus is closed and small (~50 pages + the command tree). Lexical
//      retrieval over a closed vocabulary is competitive here and needs no
//      index server.
//   2. Same question + same corpus => same sections, in the same order. That is
//      testable, reviewable, and reproducible in a bug report; a nearest-
//      neighbour score is none of those.
//   3. "No model APIs unless explicitly requested" is a standing security rule
//      of this repo. An embedding endpoint would break it for a feature whose
//      whole job is answering questions offline.
//
// WHY IT IS COMPILED RATHER THAN READ AT RUNTIME.
// The output of this compiler is a checked-in TypeScript module
// (handbook-corpus.generated.ts) that the retriever imports statically, so the
// corpus is bundled into `dist/index.js`. There is no directory to look in,
// therefore no project-local file can shadow or extend it - unlike builtin
// Flows, where a project file with the same id wins. The handbook is the
// product's own knowledge and users do not fork it.
//
// The corpus is DERIVED, never hand-authored: everything here comes from
// docs/content/**.md, docs/content/_nav.json and docs/generated/*.json. If a
// fact is wrong, fix the doc and regenerate - do not edit the generated module.
// tests/consult-handbook.test.ts fails when the checked-in corpus and the docs
// disagree, so the two cannot drift silently.

/** Bumped when the corpus shape changes, so a stale generated module fails loudly. */
export const HANDBOOK_SCHEMA_VERSION = 1;

/**
 * Per-entry body budget. Big enough for a concept page's lead plus its command
 * examples, small enough that the whole corpus stays a bundled constant, and
 * sized against the retrieval budget: HANDBOOK_MAX_ENTRIES (4) x 1800 = 7200,
 * under the 8 KB section cap even before the per-entry accounting in
 * retrieveHandbook kicks in.
 *
 * One budget for all three kinds, deliberately. The CLI and config trees used to
 * get 1400 and 900, and every byte under the doc budget bought nothing: the
 * generated `vibe flows` tree is 1447 bytes, so its entry compiled to NOTHING
 * (see fitFencedTree) and consult answered "how do I make a flow" by saying the
 * docs do not contain a command for it.
 */
export const HANDBOOK_BODY_MAX_BYTES = 1800;

/**
 * Floor below which an entry is a defect, not a short page.
 *
 * An entry retrieves as a heading plus its body, so a body that is empty or
 * pure scaffolding renders as a heading with nothing under it - strictly worse
 * than not retrieving at all, because it displaces a page that had something to
 * say and reads to the model as "the docs cover this and it is blank".
 *
 * 24 is measured, not guessed: the smallest legitimate entry in the corpus is
 * `config/ponytail` at 39 bytes (one boolean key inside its yaml fence), and an
 * empty fence alone is 12. The floor sits between the two, so it trips on
 * scaffolding and clears every genuine one-line config leaf with room to spare.
 */
export const HANDBOOK_BODY_MIN_BYTES = 24;

export type HandbookEntryKind = "doc" | "cli" | "config";

export type HandbookEntry = {
  /** Stable, sortable identity - also the deterministic tie-break key. */
  id: string;
  kind: HandbookEntryKind;
  title: string;
  /** Where this came from, shown to the model so it can cite it. */
  source: string;
  summary: string;
  /** Space-joined tokens from the title. Highest-weight match. */
  titleTerms: string;
  /** Space-joined tokens from the slug, description, headings, and the
   *  identifiers in inline code and fenced examples. Ordinary prose is
   *  deliberately NOT indexed: it is where the generic words live, and indexing
   *  it is what makes a retriever answer "React build failed" with a Vibestrate
   *  page. Term lists are strings, not arrays, to keep the compiled module small. */
  terms: string;
  /** The distilled text handed to the model. */
  body: string;
};

export type HandbookCorpus = {
  schemaVersion: number;
  /** Vibestrate's own vocabulary, space-joined. A question that hits none of
   *  these retrieves nothing - the relevance gate the whole feature turns on. */
  lexicon: string;
  entries: HandbookEntry[];
};

// ── Tokenizing ──────────────────────────────────────────────────────────────

/**
 * Light stemmer, applied identically to the corpus and to the question. The
 * stems are not words ("status" -> "statu", "gate" -> "gat") and that is fine:
 * the only property that matters is that both sides agree. The derivational
 * rules earn their place on real questions - without them "how do I approve a
 * gate" misses `vibe approvals` and "stop agents pushing to main" misses the
 * `push` vocabulary entirely.
 */
export function normalizeTerm(token: string): string {
  let t = token.toLowerCase();
  const undouble = (s: string): string =>
    s.length > 3 && /([bdfgklmnprt])\1$/.test(s) ? s.slice(0, -1) : s;
  if (t.length > 4 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 4 && t.endsWith("ses")) t = t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith("ing")) t = undouble(t.slice(0, -3));
  else if (t.length > 4 && t.endsWith("ed")) t = undouble(t.slice(0, -2));
  if (t.length > 5 && t.endsWith("ion")) t = t.slice(0, -3);
  if (t.length > 4 && t.endsWith("al")) t = t.slice(0, -2);
  if (t.length > 3 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

/** Split text into normalized terms. Hyphenated/underscored identifiers are kept
 *  whole AND split, so "spec-up" matches both "spec-up" and "spec". camelCase is
 *  split before lowercasing, or config keys collapse into one unsearchable blob
 *  ("forbidAutoPush" would never answer a question about pushing). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const split = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  for (const raw of split.match(/[a-z0-9][a-z0-9_-]*/g) ?? []) {
    const trimmed = raw.replace(/[-_]+$/g, "");
    if (!trimmed) continue;
    out.push(normalizeTerm(trimmed));
    if (/[-_]/.test(trimmed)) {
      for (const part of trimmed.split(/[-_]+/)) {
        if (part) out.push(normalizeTerm(part));
      }
    }
  }
  return out;
}

function termString(tokens: Iterable<string>): string {
  return [...new Set(tokens)].sort().join(" ");
}

/**
 * Words that never open the relevance gate, even when they appear in a doc
 * title or a command name.
 *
 * This is a stop list, not a second copy of the docs. Two kinds of word are in
 * it: English function words, and software words that EVERY tool uses ("build",
 * "error", "install"). Without the second kind, "why did my React build fail"
 * would drag in Vibestrate pages - `vibe spec-up build` is a real command and
 * "Debug a failed run" is a real page title, so "build" and "failed" would
 * otherwise be product vocabulary. Keeping them out is what makes the retriever
 * stay quiet on questions that are not about Vibestrate.
 *
 * Words that are generic English but are ALSO load-bearing Vibestrate nouns
 * (run, task, flow, status, log, config, plan, review, approval, skill) are
 * deliberately absent: those questions really are about the product.
 */
const GENERIC_TERM_SOURCE = [
  // English function words and question shapes.
  "a", "about", "after", "all", "also", "am", "an", "and", "any", "are", "as", "at",
  "be", "been", "before", "being", "best", "both", "but", "by", "can", "could", "did",
  "do", "does", "doing", "done", "each", "even", "every", "for", "from", "get", "give",
  "had", "has", "have", "he", "her", "here", "him", "his", "how", "i", "if", "in",
  "into", "is", "it", "its", "just", "keep", "let", "like", "make", "many", "may", "me",
  "might", "more", "most", "much", "must", "my", "need", "no", "not", "now", "of", "off",
  "on", "one", "only", "or", "other", "our", "out", "over", "own", "put", "same", "see",
  "she", "should", "so", "some", "still", "such", "take", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "thing", "this", "those", "through", "to",
  "too", "under", "up", "us", "use", "used", "very", "want", "was", "way", "we", "well",
  "were", "what", "when", "where", "which", "while", "who", "why", "will", "with",
  "would", "you", "your",
  // Software words any project would use. These must not mark a question as
  // being about Vibestrate.
  "add", "app", "application", "broken", "bug", "build", "change", "check", "class",
  "code", "column", "compile", "component", "crash", "create", "data", "debug",
  "default", "delete", "dir", "directory", "edit", "empty", "error", "exception",
  "fail", "failed", "failing", "failure", "fix", "folder", "function", "help", "hook",
  "import", "install", "issue", "line", "list", "load", "manage", "method", "missing",
  "module", "name", "new", "null", "number", "open", "option", "output", "package",
  "page", "problem", "process", "read", "remove", "render", "reset", "result", "return", "write",
  "row", "save", "screen", "server", "set", "setting", "show", "size", "slow", "start",
  "stop", "string", "support", "system", "text", "thread", "time", "tool", "type",
  "update", "user", "value", "version", "view", "wrong",
  // Other people's tools that leak into Vibestrate's own vocabulary (the
  // installation page names them), plus a few colourless nouns picked out of
  // the compiled lexicon by hand. Read the generated lexicon after a docs
  // change: anything in it that a question about ANOTHER tool would contain
  // belongs here. Provider names (claude, codex, gemini, ollama, ...) do NOT -
  // those are Vibestrate configuration.
  "back", "best", "between", "body", "character", "count", "date", "day",
  "difference", "header", "js", "node", "npm", "pnpm", "raw", "second", "space",
  "structure", "today", "variable", "word", "work",
];

/** Normalized so membership checks line up with tokenized input. */
export const GENERIC_TERMS: ReadonlySet<string> = new Set(
  GENERIC_TERM_SOURCE.map(normalizeTerm),
);

/** Terms eligible to become product vocabulary. */
function lexicalTerms(text: string): string[] {
  return tokenize(text).filter((t) => t.length > 1 && !GENERIC_TERMS.has(t));
}

// ── Markdown distillation ───────────────────────────────────────────────────

type DocFrontmatter = { title: string; description: string; slug: string };

function parseFrontmatter(markdown: string): {
  meta: Partial<DocFrontmatter>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { meta: {}, body: markdown };
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const kv = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (kv?.[1]) meta[kv[1]] = (kv[2] ?? "").replace(/^["']|["']$/g, "").trim();
  }
  return { meta, body: markdown.slice(match[0].length) };
}

/** Strip the docs-site HTML wrappers and link syntax, keeping the words. */
function cleanProse(line: string): string {
  return line
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type Block = { text: string; keep: 1 | 2 | 3 };

/**
 * Split a page into blocks and rank them, so trimming to the byte cap drops
 * mid-section prose before it drops headings or command examples. Keeping the
 * fenced blocks matters more than keeping the paragraphs around them: they are
 * the runnable answer to "how do I do X".
 */
function blocksOf(body: string): Block[] {
  const lines = body.split(/\r?\n/);
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let fence: string[] | null = null;
  let seenSection = false;

  const flushProse = (): void => {
    const text = buffer.map(cleanProse).filter(Boolean).join(" ").trim();
    buffer = [];
    if (text) blocks.push({ text, keep: seenSection ? 3 : 1 });
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (fence) {
        fence.push("```");
        blocks.push({ text: fence.join("\n"), keep: 2 });
        fence = null;
      } else {
        flushProse();
        fence = ["```"];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flushProse();
      seenSection = true;
      blocks.push({ text: cleanProse(line), keep: 1 });
      continue;
    }
    if (!line.trim()) {
      flushProse();
      continue;
    }
    buffer.push(line);
  }
  if (fence) blocks.push({ text: fence.join("\n"), keep: 2 });
  flushProse();
  return blocks;
}

function joinBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

/** Cut to a byte budget without splitting a UTF-8 character. Slicing by string
 *  index overshoots the cap on any multi-byte page, which is how a "1800 byte"
 *  entry measured 1804. */
export function truncateBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const marker = "\n…";
  const room = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
  const cut = Buffer.from(text, "utf8").subarray(0, room).toString("utf8");
  // A partial trailing character decodes to U+FFFD; drop it rather than ship it.
  return `${cut.endsWith("�") ? cut.slice(0, -1) : cut}${marker}`;
}

/**
 * Distill a page to at most `maxBytes`, dropping the least load-bearing blocks
 * from the end first. Deterministic for a given input.
 *
 * Trimming never empties a page that had content. Dropping the LAST surviving
 * block is not a trim, it is a deletion: the entry still retrieves, and renders
 * as a heading over nothing. When one block is all that is left it is kept and
 * truncateBytes cuts it to the budget instead.
 */
export function distillMarkdown(body: string, maxBytes: number): string {
  const blocks = blocksOf(body);
  const fits = (bs: Block[]): boolean => Buffer.byteLength(joinBlocks(bs), "utf8") <= maxBytes;
  const kept = [...blocks];
  for (const level of [3, 2] as const) {
    for (let i = kept.length - 1; i >= 0 && !fits(kept); i -= 1) {
      if (kept[i]?.keep === level) kept.splice(i, 1);
    }
  }
  // Trimming a section's prose can strand its heading. A heading with nothing
  // under it is noise in the prompt, so drop it - unless it is the only block
  // left, where dropping it would empty the entry.
  const isHeading = (b: Block | undefined): boolean => !!b && b.keep === 1 && b.text.startsWith("#");
  for (let i = kept.length - 1; i >= 0; i -= 1) {
    if (isHeading(kept[i]) && (i === kept.length - 1 || isHeading(kept[i + 1]))) kept.splice(i, 1);
  }
  return truncateBytes(joinBlocks(kept), maxBytes);
}

// ── Generated trees (CLI commands, config keys) ─────────────────────────────

/** Says the list is partial, so the model does not read a trimmed tree as the
 *  complete set and tell the user a real command does not exist. */
const TREE_TRIM_MARKER = "… (deeper entries trimmed to fit)";

/**
 * Render an indented tree of rows as one fenced block within `maxBytes`.
 *
 * The generated CLI and config bodies are a single fence, and distillMarkdown
 * scores a fence as one droppable block - so any tree over the budget lost
 * EVERY row rather than its least useful ones. That is what emptied `cli/flows`,
 * `cli/tasks`, `config/resilience` and five others: the compiler was handing a
 * markdown-page distiller something that is not a markdown page.
 *
 * Rows are the answer here, so trimming works on rows: deepest first, last
 * first within a depth, because a third-level sub-verb is the least load-bearing
 * line on the page and the root command the most. Byte-truncating the blob
 * instead would cut mid-row and drop the closing fence. The root row always
 * survives, so the result is never empty.
 */
export function fitFencedTree(
  rows: Array<{ depth: number; text: string }>,
  language: string,
  maxBytes: number,
): string {
  const kept = [...rows];
  const render = (): string => {
    const lines = kept.map((r) => r.text);
    if (kept.length < rows.length) lines.push(TREE_TRIM_MARKER);
    return [`\`\`\`${language}`, ...lines, "```"].join("\n");
  };
  const fits = (): boolean => Buffer.byteLength(render(), "utf8") <= maxBytes;

  const deepest = kept.reduce((max, r) => Math.max(max, r.depth), 0);
  for (let depth = deepest; depth > 0 && !fits(); depth -= 1) {
    for (let i = kept.length - 1; i >= 1 && !fits(); i -= 1) {
      if (kept[i]?.depth === depth) kept.splice(i, 1);
    }
  }
  // Backstop for a root row that alone blows the budget. Not reachable on the
  // current tree, and here so the function cannot return an over-budget body.
  return truncateBytes(render(), maxBytes);
}

// ── Sources ─────────────────────────────────────────────────────────────────

export type HandbookSources = {
  /** docs/content/**.md, keyed by slug (path minus the .md), sorted by the caller. */
  docs: Array<{ slug: string; markdown: string }>;
  /** docs/content/_nav.json, parsed. */
  nav: unknown;
  /** docs/generated/cli-commands.json, parsed. */
  cli: unknown;
  /** docs/generated/config-schema.json, parsed. */
  config: unknown;
  /** Remaining docs/generated/*.json - mined for ids only, to widen the lexicon. */
  idSources: unknown[];
};

type NavItem = { slug?: unknown; label?: unknown };
type NavSection = { label?: unknown; items?: unknown };

function navLabels(nav: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const sections = (nav as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return out;
  for (const raw of sections) {
    const section = raw as NavSection;
    const items = Array.isArray(section.items) ? section.items : [];
    for (const item of items as NavItem[]) {
      if (typeof item?.slug === "string") {
        out.set(item.slug, typeof section.label === "string" ? section.label : "");
      }
    }
  }
  return out;
}

/** Every `id` string anywhere in a generated JSON document. Flow ids, provider
 *  ids, role ids, run statuses - product nouns a question may name directly. */
function collectIds(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectIds(child, into);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "id" && typeof value === "string") into.add(value);
      else collectIds(value, into);
    }
  }
}

// ── CLI + config entries ────────────────────────────────────────────────────

type CliCommand = {
  name?: unknown;
  path?: unknown;
  description?: unknown;
  usage?: unknown;
  options?: unknown;
  subcommands?: unknown;
};

function commandLine(cmd: CliCommand, depth: number): string {
  const path = Array.isArray(cmd.path) ? (cmd.path as unknown[]).filter((p) => typeof p === "string") : [];
  const name = path.length ? path.join(" ") : String(cmd.name ?? "");
  const flags = (Array.isArray(cmd.options) ? cmd.options : [])
    .map((o) => (o as { flags?: unknown }).flags)
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.split(/[\s,]+/)[0])
    .filter(Boolean);
  const desc = typeof cmd.description === "string" ? cmd.description : "";
  const indent = "  ".repeat(Math.max(0, depth));
  return `${indent}${name}${flags.length ? ` [${flags.join(" ")}]` : ""}${desc ? ` - ${desc}` : ""}`;
}

type TreeRow = { depth: number; text: string };

function walkCommands(cmd: CliCommand, depth: number, out: TreeRow[]): void {
  out.push({ depth, text: commandLine(cmd, depth) });
  const subs = Array.isArray(cmd.subcommands) ? cmd.subcommands : [];
  for (const sub of subs as CliCommand[]) walkCommands(sub, depth + 1, out);
}

function cliEntries(cli: unknown): { entries: HandbookEntry[]; areas: string[] } {
  const commands = (cli as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(commands)) return { entries: [], areas: [] };
  const entries: HandbookEntry[] = [];
  const areas: string[] = [];
  for (const raw of commands as CliCommand[]) {
    const name = typeof raw.name === "string" ? raw.name : null;
    if (!name) continue;
    areas.push(name);
    const rows: TreeRow[] = [];
    walkCommands(raw, 0, rows);
    const summary = typeof raw.description === "string" ? raw.description : `The \`vibe ${name}\` commands.`;
    entries.push({
      id: `cli/${name}`,
      kind: "cli",
      title: `vibe ${name}`,
      source: "CLI reference (generated from the command tree)",
      summary,
      // Indexed from every row, including ones the body may trim: a question
      // naming a deep sub-verb should still find the page it lives on.
      titleTerms: termString(tokenize(name)),
      terms: termString([
        ...tokenize(name),
        ...tokenize(summary),
        ...rows.flatMap((r) => tokenize(r.text.split(" - ")[0] ?? "")),
      ]),
      body: fitFencedTree(rows, "text", HANDBOOK_BODY_MAX_BYTES),
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { entries, areas: [...new Set(areas)].sort() };
}

type ConfigField = {
  key?: unknown;
  fullKey?: unknown;
  type?: unknown;
  required?: unknown;
  default?: unknown;
  children?: unknown;
};

function configLines(field: ConfigField, depth: number, out: TreeRow[]): void {
  const key = typeof field.fullKey === "string" ? field.fullKey : String(field.key ?? "");
  const type = typeof field.type === "string" ? field.type : "unknown";
  const req = field.required === true ? " (required)" : "";
  const def = field.default === undefined ? "" : ` default: ${JSON.stringify(field.default)}`;
  out.push({ depth, text: `${"  ".repeat(Math.max(0, depth))}${key}: ${type}${req}${def}` });
  const children = Array.isArray(field.children) ? field.children : [];
  for (const child of children as ConfigField[]) configLines(child, depth + 1, out);
}

function configEntries(config: unknown): { entries: HandbookEntry[]; keys: string[] } {
  const fields = (config as { fields?: unknown } | null)?.fields;
  if (!Array.isArray(fields)) return { entries: [], keys: [] };
  const entries: HandbookEntry[] = [];
  const keys: string[] = [];
  for (const raw of fields as ConfigField[]) {
    const key = typeof raw.key === "string" ? raw.key : null;
    if (!key) continue;
    const rows: TreeRow[] = [];
    configLines(raw, 0, rows);
    for (const row of rows) keys.push((row.text.trim().split(":")[0] ?? "").trim());
    const summary = `Keys under \`${key}\` in .vibestrate/project.yml.`;
    entries.push({
      id: `config/${key}`,
      kind: "config",
      title: `project.yml: ${key}`,
      source: "Configuration schema (generated from the Zod schema)",
      summary,
      titleTerms: termString(tokenize(key)),
      terms: termString([...tokenize(key), ...rows.flatMap((r) => tokenize(r.text.split(":")[0] ?? ""))]),
      body: fitFencedTree(rows, "yaml", HANDBOOK_BODY_MAX_BYTES),
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { entries, keys: [...new Set(keys)].sort() };
}

// ── Compile ─────────────────────────────────────────────────────────────────

/** Inline-code identifiers (`vibe crew add`, `defaultCrew`) are the terms a user
 *  is most likely to paste into a question, so they index at term weight. */
function inlineCodeTerms(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/`([^`\n]{1,60})`/g)) out.push(...tokenize(m[1] ?? ""));
  return out;
}

function headingTerms(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/^#{1,6}\s+(.+)$/gm)) out.push(...tokenize(cleanProse(m[1] ?? "")));
  return out;
}

/** Glossary entries are written `**Crew.** ...` - the bolded head is a product noun. */
function boldHeadTerms(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\*\*([^*\n]{1,60})\*\*/g)) out.push(...tokenize(m[1] ?? ""));
  return out;
}

/** Fenced examples carry the exact ids a user pastes back ("--flow
 *  quality-arbitration"), which single-backtick scanning misses. */
function fenceTerms(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)) out.push(...tokenize(m[1] ?? ""));
  return out;
}

/**
 * An entry with nothing to say must not exist.
 *
 * Retrieval renders `### title` above the body, so an empty or scaffolding-only
 * body reaches the model as a heading over nothing - and it displaces a page
 * that had the answer, because the entry cap counts it. Dropping it here is the
 * one funnel: every entry the compiler emits passes through this filter, so no
 * future source can add a kind that skips the check.
 */
function hasContent(entry: HandbookEntry): boolean {
  if (Buffer.byteLength(entry.body, "utf8") < HANDBOOK_BODY_MIN_BYTES) return false;
  // Byte count alone would pass a body that is only fence markers and blanks.
  return entry.body
    .split(/\r?\n/)
    .some((line) => line.trim() && !/^```/.test(line.trim()) && line.trim() !== TREE_TRIM_MARKER);
}

export function compileHandbook(sources: HandbookSources): HandbookCorpus {
  const labels = navLabels(sources.nav);
  const lexicon = new Set<string>();
  const entries: HandbookEntry[] = [];

  for (const doc of [...sources.docs].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const { meta, body } = parseFrontmatter(doc.markdown);
    const title = meta.title?.trim() || doc.slug;
    const summary = meta.description?.trim() || "";
    const section = labels.get(doc.slug) ?? "";
    const entry: HandbookEntry = {
      id: `docs/${doc.slug}`,
      kind: "doc",
      title,
      source: `Vibestrate docs: ${doc.slug}`,
      summary,
      titleTerms: termString(tokenize(title)),
      terms: termString([
        ...tokenize(doc.slug),
        ...tokenize(summary),
        ...tokenize(section),
        ...headingTerms(body),
        ...inlineCodeTerms(body),
        ...fenceTerms(body),
        ...boldHeadTerms(body),
      ]),
      body: distillMarkdown(body, HANDBOOK_BODY_MAX_BYTES),
    };
    // A page with no prose must not widen the lexicon either: its title would
    // qualify a question as being about Vibestrate with no page to answer it.
    if (!hasContent(entry)) continue;
    entries.push(entry);
    for (const t of lexicalTerms(`${title} ${doc.slug} ${section}`)) lexicon.add(t);
    for (const t of lexicalTerms(boldHeadTerms(body).join(" "))) lexicon.add(t);
  }

  const cli = cliEntries(sources.cli);
  const config = configEntries(sources.config);
  entries.push(...cli.entries.filter(hasContent), ...config.entries.filter(hasContent));

  // Only TOP-LEVEL command names widen the lexicon. Sub-verbs are generic by
  // nature (`test`, `list`, `build`) and would let any software question in;
  // they still index as terms, so they sharpen a question that already qualified.
  for (const area of cli.areas) for (const t of lexicalTerms(area)) lexicon.add(t);
  for (const key of config.keys) for (const t of lexicalTerms(key)) lexicon.add(t);

  const ids = new Set<string>();
  for (const source of sources.idSources) collectIds(source, ids);
  for (const id of ids) for (const t of lexicalTerms(id)) lexicon.add(t);

  // The product's own name, however it is written.
  for (const t of lexicalTerms("vibestrate vibe mission control")) lexicon.add(t);

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: HANDBOOK_SCHEMA_VERSION,
    lexicon: [...lexicon].sort().join(" "),
    entries,
  };
}

/** Render the corpus as the checked-in TypeScript module. JSON is a subset of
 *  object-literal syntax, so a pretty-printed dump stays diffable in review. */
export function renderCorpusModule(corpus: HandbookCorpus): string {
  return `// GENERATED FILE - DO NOT EDIT BY HAND.
//
// Compiled from docs/content/**.md, docs/content/_nav.json and
// docs/generated/*.json by \`tsx src/consult/handbook/build-handbook.ts\`.
// Edit the docs and regenerate; tests/consult-handbook.test.ts fails if this
// file and the docs disagree.
//
// It is a module, not a data file, on purpose: the retriever imports it
// statically so the corpus is bundled into dist/index.js and there is no path
// a project could shadow. See handbook-compile.ts for the full rationale.
import type { HandbookCorpus } from "./handbook-compile.js";

export const HANDBOOK_CORPUS: HandbookCorpus = ${JSON.stringify(corpus, null, 2)};
`;
}
