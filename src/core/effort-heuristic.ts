// Pure, reproducible effort classifier for a task description.
//
// Why heuristic and not LLM-based: we'd burn a provider call to *save* a
// provider call. The signals here are coarse but free, deterministic,
// and surface their reasoning to the user — so a wrong verdict is a
// click away from being overridden, not a quiet mistake.
//
// Lives in its own module so the CLI, server route, and dashboard all
// share one source of truth.

export type EffortClassification = {
  /** The bucket the heuristic picked. */
  effort: "low" | "medium" | "high";
  /** 0..1 — how strongly the signals point at this bucket. */
  confidence: number;
  /**
   * Human-readable signals that drove the decision, ordered most-impactful
   * first. The UI shows these verbatim so the user can disagree
   * intelligently.
   */
  reasons: string[];
};

export type EffortClassifierInput = {
  /** Task title + description joined with a space. Description is optional. */
  text: string;
  /** Optional list of file paths the task is known to touch. */
  files?: string[];
};

// Keyword lists — lower-cased, single-word patterns. Multi-word phrases
// are matched via includes() so "no-op" or "code review" still hit.
const LOW_KEYWORDS = [
  "typo",
  "comment",
  "comments",
  "rename",
  "renames",
  "format",
  "formatting",
  "prettier",
  "lint",
  "linting",
  "whitespace",
  "indent",
  "indentation",
  "spelling",
  "wording",
  "copy",
  "tweak",
  "no-op",
  "trivial",
  "docs",
  "doc",
  "readme",
  "changelog",
];

const HIGH_KEYWORDS = [
  "refactor",
  "refactoring",
  "redesign",
  "architecture",
  "architect",
  "migrate",
  "migration",
  "rewrite",
  "port",
  "porting",
  "overhaul",
  "decouple",
  "decoupling",
  "split",
  "merge", // "merge two services"
  "extract",
  "extraction",
  "introduce", // "introduce a new module"
  "implement", // "implement feature X" tends to be non-trivial
  "feature",
  "redesign",
  "infrastructure",
  "scheduler",
  "orchestrator",
  "consolidate",
];

/**
 * Score-based bucketing. Each signal pushes the score toward low (negative)
 * or high (positive); middle stays medium. The conversion to confidence
 * is `min(|score| / threshold, 1)` so a single faint signal lands at
 * low confidence and stacked signals get strong confidence.
 */
const THRESHOLD = 4;

export function classifyEffort(
  input: EffortClassifierInput,
): EffortClassification {
  const text = input.text.trim();
  const lower = text.toLowerCase();
  const words = text.length === 0 ? [] : text.split(/\s+/);
  const files = input.files ?? [];

  let score = 0;
  const reasons: string[] = [];

  // 1) Word count
  if (words.length === 0) {
    reasons.push("Empty task — defaulting to medium.");
    return { effort: "medium", confidence: 0.1, reasons };
  }
  if (words.length < 6) {
    score -= 2;
    reasons.push(`Very short task (${words.length} words) — leans low.`);
  } else if (words.length < 15) {
    score -= 1;
    reasons.push(`Short task (${words.length} words) — leans low.`);
  } else if (words.length > 60) {
    score += 2;
    reasons.push(`Long task (${words.length} words) — leans high.`);
  } else if (words.length > 30) {
    score += 1;
    reasons.push(`Wordy task (${words.length} words) — leans high.`);
  }

  // 2) Keyword presence
  const lowHits: string[] = [];
  const highHits: string[] = [];
  for (const kw of LOW_KEYWORDS) {
    if (containsWord(lower, kw)) lowHits.push(kw);
  }
  for (const kw of HIGH_KEYWORDS) {
    if (containsWord(lower, kw)) highHits.push(kw);
  }
  if (lowHits.length > 0) {
    // Each low-effort keyword nudges by 1, capped at -3 so a single
    // "typo" doesn't drown out other strong high-effort signals.
    const delta = Math.min(lowHits.length, 3);
    score -= delta;
    reasons.push(
      `Low-effort keyword${lowHits.length > 1 ? "s" : ""}: ${lowHits.join(", ")}.`,
    );
  }
  if (highHits.length > 0) {
    const delta = Math.min(highHits.length, 3);
    score += delta;
    reasons.push(
      `High-effort keyword${highHits.length > 1 ? "s" : ""}: ${highHits.join(", ")}.`,
    );
  }

  // 3) File count
  if (files.length === 1) {
    score -= 1;
    reasons.push("Single file targeted — leans low.");
  } else if (files.length >= 5) {
    score += 1;
    reasons.push(`${files.length} files targeted — leans high.`);
  }

  // 4) File-type weighting
  if (files.length > 0) {
    const onlyDocs = files.every((f) => /\.(md|mdx|txt|rst)$/i.test(f));
    if (onlyDocs) {
      score -= 1;
      reasons.push("All targeted files are docs — leans low.");
    }
    const hasConfigOrInfra = files.some((f) =>
      /(\.config\.|\.yml$|\.yaml$|Dockerfile|tsconfig|vite\.config|package\.json|workflow|infra|terraform|helm)/i.test(
        f,
      ),
    );
    if (hasConfigOrInfra) {
      score += 1;
      reasons.push("Touches config/infra — leans high.");
    }
  }

  // Bucketing + confidence
  let effort: "low" | "medium" | "high";
  if (score <= -2) effort = "low";
  else if (score >= 2) effort = "high";
  else effort = "medium";

  const confidence = Math.min(Math.abs(score) / THRESHOLD, 1);
  // Round to two decimals so JSON output stays tidy.
  const roundedConfidence = Math.round(confidence * 100) / 100;

  if (reasons.length === 0) {
    reasons.push("No strong signals — defaulting to medium.");
  }

  return { effort, confidence: roundedConfidence, reasons };
}

/**
 * Word-boundary substring check that treats hyphens / underscores as
 * non-word characters so "no-op" matches `containsWord(s, "no-op")`. We
 * don't use `\b` because we want "rewrite" to NOT hit "underwriter" — a
 * naive includes() check would. So we wrap the keyword in non-word
 * boundaries explicitly.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return re.test(haystack);
}
