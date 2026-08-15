// ── Handbook retrieval: the relevant slice of Vibestrate's own docs ─────────
//
// Deterministic keyword retrieval over the compiled corpus. Same question +
// same corpus => the same entries, in the same order, byte for byte. No model
// call, no network, no filesystem read: the corpus is a statically imported
// module, so this works offline, inside a sandbox, and cannot be shadowed by a
// file in the user's project. Rationale lives in handbook-compile.ts.
//
// The relevance gate is the point of the feature. A question that names none of
// Vibestrate's own vocabulary retrieves NOTHING, so asking consult "why did my
// React build fail" does not drag Vibestrate pages into the prompt.
//
// The second gate is the SURFACE. Retrieval is where "only suggest what the
// reader can actually do" is enforced, because the prompt is a request the model
// may ignore while an entry that never arrived cannot be repeated. See
// isCommandReference / stripCommandExamples below, and consult-surface.ts for
// the reasoning that produced them.

import { HANDBOOK_CORPUS } from "./handbook-corpus.generated.js";
import {
  GENERIC_TERMS,
  HANDBOOK_SCHEMA_VERSION,
  tokenize,
  truncateBytes,
  type HandbookEntry,
} from "./handbook-compile.js";
import type { ConsultSurface } from "../consult-surface.js";

if (HANDBOOK_CORPUS.schemaVersion !== HANDBOOK_SCHEMA_VERSION) {
  // Fail closed: a corpus compiled against a different shape is not something
  // to half-read. Regenerate with `tsx src/consult/handbook/build-handbook.ts`.
  throw new Error(
    `Handbook corpus is schema v${HANDBOOK_CORPUS.schemaVersion}, expected v${HANDBOOK_SCHEMA_VERSION}. Regenerate it.`,
  );
}

/** Whole-section cap. Ten sibling sections already compete for consult's 96 KB
 *  context budget and the project half must stay dominant - the handbook is
 *  reference material, not the answer. 8 KB is three to four distilled pages,
 *  enough to answer "how do I make a crew" from the Crew page plus `vibe crew`. */
export const HANDBOOK_SECTION_MAX_BYTES = 8 * 1024;
/** Past four entries the tail is nearly always noise; the cap also bounds cost. */
export const HANDBOOK_MAX_ENTRIES = 4;
/**
 * Two product terms, or one that lands in the title. Measured on the real
 * corpus: a single term-level hit (score 3) is where the noise lives - "my tests
 * are failing" matched `vibe editor`, `vibe gateways` and `vibe notifications`
 * purely because each has a `test` subcommand. Requiring 6 drops those and
 * leaves the strong hits untouched. The cost is that a thin question with one
 * weak term retrieves nothing, which is the side to err on.
 */
export const HANDBOOK_MIN_SCORE = 6;

const WEIGHT_TITLE = 8;
const WEIGHT_TERM = 3;

const lexicon = new Set(HANDBOOK_CORPUS.lexicon.split(" ").filter(Boolean));
const indexed = HANDBOOK_CORPUS.entries.map((entry) => ({
  entry,
  titleTerms: new Set(entry.titleTerms.split(" ").filter(Boolean)),
  terms: new Set(entry.terms.split(" ").filter(Boolean)),
}));

export type HandbookHit = { entry: HandbookEntry; score: number; matched: string[] };

// ── Surface enforcement ─────────────────────────────────────────────────────

/**
 * The subcommands `vibe` actually has, read off the corpus rather than typed out
 * again, so a command added or removed in the docs cannot leave a stale list
 * here. Used only to recognise a question that NAMES a command.
 */
const CLI_SUBCOMMANDS = new Set(
  HANDBOOK_CORPUS.entries
    .filter((e) => e.kind === "cli")
    .map((e) => e.id.slice("cli/".length)),
);

/**
 * Words that mean "I am asking about the command line", not "I am stuck".
 *
 * Deliberately narrow, because the wide version misfired on the surface it was
 * meant to protect. `command` alone fires on "why does my run say command not
 * found", which is the canonical phrase of someone stuck, and answering it with
 * a CLI reference is the opposite of help. `terminal` fires on "how do I open
 * the terminal?", which in the dashboard is a PANEL. `flag` fires on "how do I
 * flag a run for review". Each of those pulled the whole command reference back
 * into a browser answer. The phrase "command line" is kept below, spelled as a
 * phrase, since that one really is unambiguous.
 */
const COMMAND_WORDS = new Set(["cli", "subcommand", "subcommands", "npx"]);

/**
 * Multi-word ways of naming the command line that a single token cannot.
 *
 * "which command lists my flows" asks for a command; "why does my run say
 * command not found" reports an error. The word is identical and the intent is
 * opposite, so the phrase is what has to be matched, never the token.
 */
const COMMAND_PHRASES = [
  /\bcommand[-\s]line\b/,
  /\b(?:in|from|via|using)\s+(?:the\s+)?terminal\b/,
  // Asking WHICH command, as opposed to quoting one in an error.
  /\b(?:which|what|whats|what's)\s+commands?\b/,
  /\bcommand\s+(?:to|for)\b/,
];

/**
 * Does the question ask about a command outright?
 *
 * This is the escape hatch that keeps the surface rule from becoming its own
 * bug. Someone in the dashboard who types "what does `vibe run --flow` do" is
 * asking about the CLI, and answering "open the Runs screen" would be a refusal
 * dressed as help. So a question that names a real subcommand, or uses the
 * vocabulary of the command line, gets the CLI pages back on every surface.
 */
export function asksAboutCommands(question: string): boolean {
  const lower = question.toLowerCase();
  for (const m of lower.matchAll(/\bvibe(?:strate)?\s+([a-z][a-z-]*)/g)) {
    if (CLI_SUBCOMMANDS.has(m[1] ?? "")) return true;
  }
  if (COMMAND_PHRASES.some((re) => re.test(lower))) return true;
  return lower.split(/[^a-z0-9]+/).some((w) => COMMAND_WORDS.has(w));
}

/**
 * An entry that is nothing but a command tree.
 *
 * `kind: "cli"` is the generated `vibe <x>` reference; `docs/cli/*` are the
 * handwritten pages about driving Vibestrate from a terminal. Both are correct
 * and both are useless to a reader in a browser, and they are what the model
 * repeated verbatim: the four `vibe config ...` invocations in the answer that
 * started this all came from `cli/config`.
 *
 * Concept and config pages are NOT in this set. They describe what a flow or a
 * policy is, which is surface-independent - their command examples are handled
 * by stripCommandExamples instead of costing the reader the whole page.
 */
export function isCommandReference(entry: HandbookEntry): boolean {
  return entry.kind === "cli" || entry.id.startsWith("docs/cli/");
}

/** A fenced line that belongs to a command example: an invocation, a bare
 *  continuation flag, or a shell comment between invocations. */
const COMMAND_EXAMPLE_LINE = /^\s*(?:[$>]\s*)?(?:npx\s+)?(?:vibe(?:strate)?\b|--?[a-z]|#)/;

/** An actual invocation, as opposed to a line that merely LOOKS like part of
 *  one. Required before a fence is treated as a command example, because
 *  COMMAND_EXAMPLE_LINE alone matches things that are not commands at all:
 *  every line of a ```md fence of markdown headings starts with `#`, and every
 *  line of a ```diff fence of removals starts with `-`. Both were being deleted
 *  outright, and a diff fence that was the whole body took its entry with it. */
const COMMAND_INVOCATION_LINE = /^\s*(?:[$>]\s*)?(?:npx\s+)?vibe(?:strate)?\b/;

/**
 * Remove the fenced command examples from an entry body, leaving the prose.
 *
 * Only whole fences whose every non-blank line is a command go; a `yaml` fence
 * showing a config key, or a fence with output in it, survives untouched. Inline
 * `` `vibe doctor` `` spans mid-sentence are deliberately left alone: deleting
 * one turns "run `vibe doctor` to check" into "run  to check", and a command
 * named inside a sentence is information about the product, not the answer's
 * recommendation. What the surface governs is what the answer TELLS THE READER
 * TO DO, and that is governed by isCommandReference plus the screen map plus the
 * instruction - not by scrubbing every occurrence of the word.
 *
 * WHAT THIS DOES AND DOES NOT GUARANTEE. It removes the command REFERENCE pages
 * and the command EXAMPLES. It does not remove every mention: measured on the
 * real corpus, "how do I resume a paused run" still carries `vibe pause` and
 * `vibe resume` inside sentences on the concept page. So the honest claim is
 * that the dashboard answer RECOMMENDS screens, not that the word never reaches
 * the model - and a test asserting the latter is asserting something this code
 * does not do, on whichever question happened to be picked.
 */
export function stripCommandExamples(text: string): string {
  return text
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (whole, inner: string) => {
      const lines = inner.split("\n").filter((l) => l.trim().length > 0);
      if (!lines.length) return whole;
      const allExampleShaped = lines.every((l) => COMMAND_EXAMPLE_LINE.test(l));
      const hasRealCommand = lines.some((l) => COMMAND_INVOCATION_LINE.test(l));
      return allExampleShaped && hasRealCommand ? "" : whole;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type RetrieveOptions = {
  /** Where the answer will be read. Required, and deliberately not optional:
   *  the surface decides which entries are eligible at all, so a caller that
   *  forgot to state it would quietly get terminal instructions rendered in a
   *  browser - the exact bug this field exists to close. */
  surface: ConsultSurface;
  maxEntries?: number;
  maxBytes?: number;
};

/** The question terms that are Vibestrate's own vocabulary. Empty => the
 *  question is not about Vibestrate and retrieval returns nothing. */
export function productTerms(question: string): string[] {
  const seen = new Set<string>();
  for (const token of tokenize(question)) {
    if (token.length < 2 || GENERIC_TERMS.has(token)) continue;
    if (lexicon.has(token)) seen.add(token);
  }
  return [...seen].sort();
}

/**
 * Rank the corpus against a question. Only product terms score - a word the
 * product does not use contributes nothing, so an off-topic question cannot
 * accumulate a score out of incidental prose matches.
 *
 * The surface filter runs BEFORE the budget is spent, not after: a de-ranked CLI
 * page would still eat one of the four slots and still read to the model as "the
 * docs say to do it this way". Dropped entries free their slot for the concept
 * and config pages behind them.
 */
export function retrieveHandbook(question: string, opts: RetrieveOptions): HandbookHit[] {
  const terms = productTerms(question);
  if (!terms.length) return [];

  const hideCommands = opts.surface === "dashboard" && !asksAboutCommands(question);

  const scored: HandbookHit[] = [];
  for (const { entry, titleTerms, terms: entryTerms } of indexed) {
    if (hideCommands && isCommandReference(entry)) continue;
    let score = 0;
    const matched: string[] = [];
    for (const term of terms) {
      let hit = 0;
      if (titleTerms.has(term)) hit += WEIGHT_TITLE;
      if (entryTerms.has(term)) hit += WEIGHT_TERM;
      if (hit) {
        score += hit;
        matched.push(term);
      }
    }
    if (score < HANDBOOK_MIN_SCORE) continue;
    // Strip the command examples out of what survives, and drop an entry that
    // was ONLY examples - a heading with nothing under it is worse than no
    // entry, because it displaces a page that had something to say.
    const shaped = hideCommands ? withStrippedExamples(entry) : entry;
    if (!shaped) continue;
    scored.push({ entry: shaped, score, matched });
  }

  // Deterministic order: score desc, then id asc. The id tie-break is what makes
  // the same question produce the same sections on every run.
  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));

  const maxEntries = opts.maxEntries ?? HANDBOOK_MAX_ENTRIES;
  const maxBytes = opts.maxBytes ?? HANDBOOK_SECTION_MAX_BYTES;
  const kept: HandbookHit[] = [];
  let used = 0;
  for (const hit of scored) {
    if (kept.length >= maxEntries) break;
    const cost = Buffer.byteLength(renderEntry(hit.entry), "utf8");
    if (kept.length && used + cost > maxBytes) continue;
    kept.push(hit);
    used += cost;
  }
  return kept;
}

/** The entry with its command examples removed, or null when that left nothing.
 *  Returning a rewritten COPY keeps the byte accounting below and the rendered
 *  section reading the same text - the alternative, stripping at render time,
 *  budgets for bytes that never ship. */
function withStrippedExamples(entry: HandbookEntry): HandbookEntry | null {
  const summary = dropEmptySections(stripCommandExamples(entry.summary));
  const body = dropEmptySections(stripCommandExamples(entry.body));
  if (!summary && !body) return null;
  // A page that was mostly commands survives stripping as a heading skeleton,
  // and that is WORSE than dropping it: the section header promises this text
  // is authoritative and tells the model not to invent anything, so a page of
  // headings with nothing under them either gets filled in or gets reported as
  // unverifiable. Measured on the real corpus, "how do I set up a provider?"
  // delivered three headings and one orphaned sentence this way. If stripping
  // took most of the page, the page no longer answers anything - drop it and
  // let the next-ranked entry have the slot.
  const before = entry.summary.length + entry.body.length;
  const after = summary.length + body.length;
  if (before > 0 && after / before < GUTTED_RATIO) return null;
  return { ...entry, summary, body };
}

/** Below this share of its original text surviving, an entry is a skeleton
 *  rather than a shortened page. Half is deliberately generous: the aim is to
 *  catch command-first references, not to punish a page with one example. */
const GUTTED_RATIO = 0.5;

/**
 * Remove headings that stripping left with nothing under them.
 *
 * A heading is a promise that content follows. When the command examples under
 * it were the content, the promise is now false, and a model reading it either
 * invents the missing steps or says it cannot verify them.
 */
function dropEmptySections(text: string): string {
  if (!text) return text;
  const lines = text.split("\n");
  const keep: boolean[] = lines.map(() => true);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^#{1,6}\s/.test(lines[i] ?? "")) continue;
    let j = i + 1;
    while (j < lines.length && !(lines[j] ?? "").trim()) j += 1;
    // Nothing but another heading, or the end of the page, follows this one.
    if (j >= lines.length || /^#{1,6}\s/.test(lines[j] ?? "")) keep[i] = false;
  }
  return lines
    .filter((_, i) => keep[i])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderEntry(entry: HandbookEntry): string {
  const head = `### ${entry.title} (${entry.source})`;
  return [head, entry.summary, entry.body].filter(Boolean).join("\n").trim();
}

const SECTION_HEADER = [
  "## Vibestrate product documentation (authoritative for how Vibestrate itself works)",
  "Shipped with this build and selected for the question below. Use it to answer questions about Vibestrate's own commands, config keys and concepts, and do not invent a command or key that is not here. It describes the product, not this project - project facts come from the other sections.",
].join("\n");

/**
 * The prompt section, or null when the question is not about Vibestrate. The
 * first entry is truncated rather than dropped if it alone exceeds the cap, so
 * a hit is never silently reduced to an empty section.
 */
export function renderHandbookSection(
  hits: HandbookHit[],
  maxBytes = HANDBOOK_SECTION_MAX_BYTES,
): string | null {
  if (!hits.length) return null;
  const body = hits.map((h) => renderEntry(h.entry)).join("\n\n");
  return `${SECTION_HEADER}\n\n${truncateBytes(body, maxBytes)}`;
}
