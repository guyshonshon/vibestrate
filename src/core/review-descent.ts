// ── A3 (express): deterministic review descent ──────────────────────────────
//
// Decides whether a `skipWhen: "inert_diff"` review-turn may be skipped, from
// the run's ACTUAL changed files - never the task text, never model judgment
// (proportional-orchestration.md non-negotiable #2; run-experience batch P4b).
//
// The bar is deliberately STRICTER than B3's validation-scoping allowlist:
// only prose files (.md/.markdown/.txt/.rst) qualify. B3's set includes
// active-content types like .svg that are fine to skip *test commands* for
// but must never skip *review* (adversarial-review finding). And the A2
// protected-path floor applies on top: a protected prose file (a workflow
// README under .vibestrate/, a user-protected runbook) still gets reviewed.
//
// Failure direction: any uncertainty (empty diff, unknown file, protected
// match, diff unavailable) means the review RUNS. A wrong call can only cause
// more review, never less.

import {
  isProtectedDiff,
  type ProtectedPathsConfig,
  type ProtectedPathMatch,
} from "../orchestrator/protected-paths.js";

/** Strict prose-only set. A subset of B3's inert allowlist on purpose. */
const STRICT_PROSE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".rst",
]);

export type ReviewDescentDecision = {
  /** True ONLY when every changed file is strict-prose AND unprotected. */
  skip: boolean;
  reason:
    | "all-prose-unprotected"
    | "empty-diff"
    | "non-prose-files"
    | "protected-files";
  /** All changed files considered. */
  files: string[];
  /** Files that disqualified the skip (non-prose). */
  nonProse: string[];
  /** Protected matches that disqualified the skip. */
  protectedMatches: ProtectedPathMatch[];
};

function isStrictProse(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false; // no extension / dotfile -> not prose (fail-safe)
  return STRICT_PROSE_EXTENSIONS.has(base.slice(dot).toLowerCase());
}

/** Pure: classify a diff's paths for review descent. */
export function evaluateReviewDescent(
  changedPaths: readonly string[],
  config?: ProtectedPathsConfig,
): ReviewDescentDecision {
  const files = [...changedPaths];
  if (files.length === 0) {
    return {
      skip: false,
      reason: "empty-diff",
      files,
      nonProse: [],
      protectedMatches: [],
    };
  }
  const nonProse = files.filter((p) => !isStrictProse(p));
  if (nonProse.length > 0) {
    return {
      skip: false,
      reason: "non-prose-files",
      files,
      nonProse,
      protectedMatches: [],
    };
  }
  const prot = isProtectedDiff(files, config);
  if (prot.protected) {
    return {
      skip: false,
      reason: "protected-files",
      files,
      nonProse: [],
      protectedMatches: prot.matches,
    };
  }
  return {
    skip: true,
    reason: "all-prose-unprotected",
    files,
    nonProse: [],
    protectedMatches: [],
  };
}
