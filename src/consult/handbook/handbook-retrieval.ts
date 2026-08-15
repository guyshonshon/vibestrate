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

import { HANDBOOK_CORPUS } from "./handbook-corpus.generated.js";
import {
  GENERIC_TERMS,
  HANDBOOK_SCHEMA_VERSION,
  tokenize,
  truncateBytes,
  type HandbookEntry,
} from "./handbook-compile.js";

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
 */
export function retrieveHandbook(
  question: string,
  opts: { maxEntries?: number; maxBytes?: number } = {},
): HandbookHit[] {
  const terms = productTerms(question);
  if (!terms.length) return [];

  const scored: HandbookHit[] = [];
  for (const { entry, titleTerms, terms: entryTerms } of indexed) {
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
    if (score >= HANDBOOK_MIN_SCORE) scored.push({ entry, score, matched });
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
