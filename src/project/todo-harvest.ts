// ── Deterministic TODO harvest ───────────────────────────────────────────────
//
// `vibe learn` scans the codebase for TODO/FIXME/HACK/XXX/BUG comments and
// writes `.vibestrate/roadmap/todos/harvest.json` - candidate work a human can
// promote onto the Board. Like the codebase map, this is a REGENERABLE CACHE:
// every scan rewrites it wholesale, and nothing here calls a model, so the same
// repo state always produces the same harvest.
//
// It lives under `roadmap/` rather than beside the map for the same reason
// `roadmap/proposals/` does: the producer is the codebase scan, but the roadmap
// is what consumes these, and the consumer owns the location.
//
// ── Why grep is coarse and TypeScript is precise ─────────────────────────────
//
// `searchCodebaseContent` silently falls back from `-P` (PCRE) to `-E` (POSIX
// ERE) on git builds compiled without PCRE. `\b` and lookarounds do not exist in
// ERE, so a PCRE-only pattern would quietly match a DIFFERENT set of lines on
// those machines with no error surfaced anywhere.
//
// So the grep pattern is a plain, ERE-safe alternation over the five markers -
// identical under both engines - and every rule that decides whether a line is
// really a TODO lives in `classifyTodoLine`, a pure function over one string.
// JS regex behaves the same everywhere, and the rules become directly testable
// instead of one unreviewable grep string.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { execa } from "execa";
import { searchCodebaseContent } from "../core/codebase/codebase-search-service.js";
import { redactSecretsInText } from "../core/diff-service.js";
import { writeTextAtomic, ensureDir } from "../utils/fs.js";
import { roadmapTodosDir, roadmapTodosHarvestFile } from "../utils/paths.js";
import { prioritySchema, type Priority } from "../roadmap/roadmap-types.js";

// ── budgets ──────────────────────────────────────────────────────────────────

const MAX_RAW_LEN = 300;
const MAX_TEXT_LEN = 200;
const MAX_TITLE_LEN = 100;

/** Hard ceiling on harvested entries. Hitting it sets `truncated` and adds a
 *  note - never a silent cut. */
const MAX_HARVESTED = 500;

// Deliberately higher than the interactive Content-search defaults: this sweep
// must see every marker in the repo, not the first readable page of them. Still
// bounded, and still under the search service's non-overridable timeout and
// maxBuffer, which are the real safety rail.
const SEARCH_LIMITS = {
  maxFiles: 2000,
  maxMatchesPerFile: 200,
  maxTotalMatches: 5000,
};

/** Substance bar. Below it a TODO is counted but never promotable - a promote
 *  list padded with `TODO: fix` is the chore this feature removes. */
const MIN_TEXT_CHARS = 12;
const MIN_TEXT_WORDS = 2;

// ── schema ───────────────────────────────────────────────────────────────────

export const todoMarkerSchema = z.enum(["TODO", "FIXME", "HACK", "XXX", "BUG"]);
export type TodoMarker = z.infer<typeof todoMarkerSchema>;

export const harvestedTodoSchema = z.object({
  /** sha256(path + "\0" + normalizeTodoText(text)) truncated. Stable across line
   *  drift: the line number is deliberately NOT part of it, so editing code
   *  above a TODO does not orphan the card promoted from it. */
  fingerprint: z.string().min(1).max(64),
  marker: todoMarkerSchema,
  path: z.string().min(1).max(1024),
  line: z.number().int().min(1),
  /** The comment line as found, redacted. */
  raw: z.string().max(MAX_RAW_LEN),
  /** Marker, owner annotation and separator stripped; whitespace collapsed. */
  text: z.string().max(MAX_TEXT_LEN),
  /** Card-ready title. Kept separate from `text` so the promote path has a
   *  default that is not the raw comment, and the UI can show both. */
  suggestedTitle: z.string().min(1).max(MAX_TITLE_LEN),
  suggestedPriority: prioritySchema,
  /** Top-level directory, for grouping in the UI. */
  area: z.string(),
  /** Below the substance bar: counted, never offered for promotion. */
  lowSignal: z.boolean(),
});
export type HarvestedTodo = z.infer<typeof harvestedTodoSchema>;

export const todosFileSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  /** git HEAD when generated; null when not a git repo. Drives staleness. */
  rev: z.string().nullable(),
  // Plain string keys, not the marker enum: a record keyed by an enum requires
  // EVERY member to be present, and a repo with no HACK comments must not fail
  // to parse its own harvest.
  counts: z.record(z.string(), z.number().int().min(0)),
  total: z.number().int().min(0),
  /** A cap was hit or a source was unavailable - more TODOs may exist. */
  truncated: z.boolean(),
  /** Honest degradation notes, mirroring CodebaseMap.notes. */
  notes: z.array(z.string()),
  items: z.array(harvestedTodoSchema),
});
export type TodosFile = z.infer<typeof todosFileSchema>;

/** Counts-only projection, embedded in the codebase map. The map is fetched on
 *  every Codebase page load and its rendering is prompt-adjacent, so it carries
 *  the numbers and never the entries. */
export type TodoCounts = {
  counts: Record<string, number>;
  total: number;
  truncated: boolean;
};

// ── classification ───────────────────────────────────────────────────────────

// ERE-safe by construction: plain alternation, no `\b`, no lookarounds, no
// character-class shorthands. Behaves identically under `-P` and the `-E`
// fallback. Every real rule is applied by `classifyTodoLine` afterwards.
export const TODO_GREP_QUERY = "(TODO|FIXME|HACK|XXX|BUG)";

const TODO_SCAN_INCLUDE =
  "*.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs,*.py,*.go,*.rs,*.rb,*.java,*.kt,*.swift," +
  "*.c,*.h,*.cc,*.cpp,*.hpp,*.cs,*.php,*.sh,*.bash,*.zsh,*.sql,*.vue,*.svelte," +
  "*.scss,*.css,*.yml,*.yaml,*.toml";

// A marker only counts when a comment opener precedes it on the same line.
// Without this the scan reports `const label = "TODO"` and a markdown heading as
// Board cards - the naive-grep failure this whole module exists to avoid.
//
// Openers: `//` `#` `/*` `<!--` `--` anywhere on the line (so trailing comments
// like `foo(); // TODO: ...` are caught), plus a leading `*` ONLY at line start
// (the javadoc continuation) - a bare `*` mid-line is multiplication, not a
// comment opener.
const TODO_LINE_RE = new RegExp(
  "(?:" +
    "^[ \\t]*\\*+[ \\t]*" + // javadoc continuation, line-start only
    "|\\/\\/+[ \\t]*" + // //
    "|#+[ \\t]*" + // #
    "|\\/\\*+[ \\t]*" + // /*
    "|<!--[ \\t]*" + // <!--
    "|--+[ \\t]*" + // -- (sql, lua, haskell)
    ")" +
    "(TODO|FIXME|HACK|XXX|BUG)\\b" +
    "(.*)$",
);

/** `TODO(guy):` / `TODO:` / `TODO -` / `TODO` - the owner annotation and
 *  separator between the marker and the actual text. */
const AFTER_MARKER_RE = /^(?:\([^)]{0,64}\))?[ \t]*[:\-–—]?[ \t]*/;

/** Trailing block-comment closers, so a `/* ... *\/` TODO does not keep them. */
const TRAILING_CLOSER_RE = /(?:\*\/|-->)\s*$/;

const MARKER_PRIORITY: Record<TodoMarker, Priority> = {
  FIXME: "high",
  BUG: "high",
  TODO: "medium",
  HACK: "low",
  XXX: "low",
};

/** Lowercase, collapse whitespace, drop trailing punctuation. Feeds the
 *  fingerprint, so two TODOs differing only in casing or a trailing period are
 *  one item. */
export function normalizeTodoText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:\s]+$/, "")
    .trim();
}

export function todoFingerprint(filePath: string, text: string): string {
  return createHash("sha256")
    .update(`${filePath}\0${normalizeTodoText(text)}`)
    .digest("hex")
    .slice(0, 16);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Top-level directory, or "(root)" for a file at the repo root. */
export function todoArea(filePath: string): string {
  const idx = filePath.indexOf("/");
  return idx === -1 ? "(root)" : filePath.slice(0, idx);
}

/** Truncate on a word boundary where possible, so a title never ends mid-word. */
function toTitle(text: string): string {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  if (sentence.length <= MAX_TITLE_LEN) return sentence;
  const cut = sentence.slice(0, MAX_TITLE_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_TITLE_LEN / 2 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * The whole classification rule set, as a pure function over one line.
 *
 * Returns null when the line is not a real TODO comment. Everything the harvest
 * decides - is this a comment, does it carry enough substance, what is its
 * priority - happens here and nowhere else, so it can be tested directly rather
 * than only through an end-to-end scan.
 *
 * KNOWN LIMIT, deliberately not fixed: this is line-based and cannot see
 * block-comment state. A marker inside a multi-line block comment on a line
 * starting with neither `*` nor the opener is missed, and a marker inside a
 * multi-line string whose line happens to start with `#` is a false positive.
 * Both are rare, neither is worth a parser, and the surface says it is
 * heuristic rather than pretending to be exhaustive.
 */
export function classifyTodoLine(
  filePath: string,
  line: number,
  rawLine: string,
): HarvestedTodo | null {
  const m = TODO_LINE_RE.exec(rawLine);
  if (!m) return null;

  const marker = m[1] as TodoMarker;
  const rest = m[2] ?? "";

  const body = collapse(
    rest.replace(AFTER_MARKER_RE, "").replace(TRAILING_CLOSER_RE, ""),
  );
  const text = body.slice(0, MAX_TEXT_LEN);

  const words = text.split(" ").filter((w) => w.length > 0);
  const lowSignal = text.length < MIN_TEXT_CHARS || words.length < MIN_TEXT_WORDS;

  // A low-signal entry still needs a non-empty title to satisfy the schema; fall
  // back to the marker itself so a bare `// TODO` round-trips instead of
  // throwing on write.
  const suggestedTitle = text.length > 0 ? toTitle(text) : marker;

  return {
    fingerprint: todoFingerprint(filePath, text),
    marker,
    path: filePath,
    line,
    raw: collapse(rawLine).slice(0, MAX_RAW_LEN),
    text,
    suggestedTitle,
    suggestedPriority: MARKER_PRIORITY[marker],
    area: todoArea(filePath),
    lowSignal,
  };
}

// ── scan ─────────────────────────────────────────────────────────────────────

async function currentGitRev(projectRoot: string): Promise<string | null> {
  try {
    const r = await execa("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      reject: false,
      // Same 8s bound as the map's rev read: this runs on every harvest, so a
      // hung git must degrade to rev=null rather than hang the caller.
      timeout: 8_000,
    });
    if (r.exitCode !== 0) return null;
    return r.stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Scan the repo and build a fresh harvest. Degrades honestly (empty items + a
 * note) rather than throwing, so `vibe learn` over a half-initialized or
 * non-git project still succeeds.
 */
export async function extractTodoHarvest(
  projectRoot: string,
  generatedAt: string,
): Promise<TodosFile> {
  const notes: string[] = [];
  const rev = await currentGitRev(projectRoot);

  const result = await searchCodebaseContent({
    projectRoot,
    query: TODO_GREP_QUERY,
    regex: true,
    // Uppercase markers are the convention. Case-insensitive would sweep in
    // every "todo" written in prose, which the comment guard cannot filter out.
    caseSensitive: true,
    include: TODO_SCAN_INCLUDE,
    limits: SEARCH_LIMITS,
  });

  const empty: TodosFile = {
    schemaVersion: 1,
    generatedAt,
    rev,
    counts: {},
    total: 0,
    truncated: false,
    notes,
    items: [],
  };

  if (!result.available || result.error) {
    notes.push(result.error ?? "codebase search unavailable - TODO scan skipped");
    return { ...empty, truncated: true, notes };
  }

  let truncated = result.truncated;
  const seen = new Set<string>();
  const items: HarvestedTodo[] = [];

  outer: for (const file of result.files) {
    if (file.matchesTruncated) truncated = true;
    for (const match of file.matches) {
      const todo = classifyTodoLine(file.path, match.line, match.text);
      if (!todo) continue;
      // Same normalized text in the same file is one item, not several - keep
      // the first (lowest line). Identical text in DIFFERENT files stays
      // separate: that is two pieces of work, not one.
      if (seen.has(todo.fingerprint)) continue;
      if (items.length >= MAX_HARVESTED) {
        truncated = true;
        break outer;
      }
      seen.add(todo.fingerprint);
      items.push(todo);
    }
  }

  if (truncated) {
    notes.push("TODO scan was capped - more markers may exist in the repo.");
  }

  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.marker] = (counts[item.marker] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    generatedAt,
    rev,
    counts,
    total: items.length,
    truncated,
    notes,
    items,
  };
}

// ── artifact ─────────────────────────────────────────────────────────────────

/** The counts projection embedded in the codebase map. */
export function todoCountsOf(harvest: TodosFile): TodoCounts {
  return {
    counts: harvest.counts,
    total: harvest.total,
    truncated: harvest.truncated,
  };
}

/** How many items a human could actually promote (low-signal excluded). */
export function promotableCount(harvest: TodosFile): number {
  return harvest.items.filter((t) => !t.lowSignal).length;
}

/**
 * Regenerate the harvest artifact: extract -> redact -> write. Redaction runs
 * over the serialized JSON for the same reason `writeCodebaseMap` does it - a
 * TODO line can carry a token, and this is a third artifact on disk.
 */
export async function writeTodoHarvest(
  projectRoot: string,
  generatedAt: string,
): Promise<TodosFile> {
  const harvest = await extractTodoHarvest(projectRoot, generatedAt);
  const json = redactSecretsInText(JSON.stringify(harvest, null, 2)).redacted;

  await ensureDir(roadmapTodosDir(projectRoot));
  await writeTextAtomic(roadmapTodosHarvestFile(projectRoot), json);

  // Re-parse the exact redacted JSON that was persisted rather than returning
  // the in-memory value: HTTP/UI callers render this return value directly, so
  // it must never diverge from the disk artifact. No fallback - unparsable
  // redacted JSON means the disk artifact is equally broken, so failing fast is
  // correct.
  return todosFileSchema.parse(JSON.parse(json));
}

/**
 * Load the persisted harvest. Missing file, unparsable JSON, or a schema
 * mismatch all mean "absent" rather than an error: regenerate-on-demand beats
 * carrying back-compat parsing for a regenerable cache.
 */
export async function loadTodoHarvest(
  projectRoot: string,
): Promise<{ present: boolean; harvest: TodosFile | null; stale: boolean }> {
  const absent = { present: false, harvest: null, stale: false } as const;
  let raw: string;
  try {
    raw = await fs.readFile(roadmapTodosHarvestFile(projectRoot), "utf8");
  } catch {
    return absent;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return absent;
  }
  const result = todosFileSchema.safeParse(parsed);
  if (!result.success) return absent;

  const harvest = result.data;
  let stale = false;
  if (harvest.rev !== null) {
    const currentRev = await currentGitRev(projectRoot);
    stale = currentRev !== null && currentRev !== harvest.rev;
  }
  return { present: true, harvest, stale };
}

/** One-line counts summary for `CODEBASE.md` and the `vibe learn` output. The
 *  entries themselves are never rendered there - that is the UI's job, which is
 *  the whole reason the harvest is typed JSON. */
export function renderTodoSummaryLine(counts: TodoCounts): string {
  if (counts.total === 0) return "No TODO markers found.";
  const parts = Object.entries(counts.counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([marker, n]) => `${n} ${marker}`);
  return `${counts.total} marker${counts.total === 1 ? "" : "s"}: ${parts.join(", ")}${
    counts.truncated ? " (capped - more may exist)" : ""
  }`;
}
