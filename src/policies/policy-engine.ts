import { globToRegex } from "./policy-store.js";
import {
  POLICY_LIMITS,
  type PolicyEvaluationInput,
  type PolicyEvaluationResult,
  type PolicyRule,
  type PolicyViolation,
} from "./policy-types.js";

/**
 * Pure evaluation: given the loaded rule set and a patch, return any
 * violations for the requested surface. Does NOT touch the filesystem.
 *
 * Behavior:
 *   - Filters rules to those whose appliesTo includes the requested
 *     surface.
 *   - Touched-file matching: extracts files from `diff --git a/X b/Y`
 *     and `+++ b/Y` headers (the same parser shape used by
 *     checkPatchSafety; engine accepts pre-parsed files too).
 *   - Added-content matching: scans only lines starting with `+` (not
 *     `+++` headers, not context, not removed lines). Per-line input is
 *     truncated at POLICY_LIMITS.maxScanItemLength to keep one
 *     pathological line from blowing the budget.
 *   - Both matchers present → both must hit (AND).
 *   - Returns the FIRST violation per rule (a single hit is enough to
 *     refuse). Multiple distinct rules can each contribute one.
 *
 * No regex flags or pattern strings are re-validated here — that happens
 * at load time. The engine trusts what the store gave it.
 */
export function evaluatePatchAgainstPolicies(
  rules: readonly PolicyRule[],
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  const applicable = rules.filter((r) => r.appliesTo.includes(input.surface));
  const evaluatedRuleIds = applicable.map((r) => r.id);
  if (applicable.length === 0) {
    return { violations: [], evaluatedRuleIds };
  }

  const touchedFiles =
    input.touchedFiles && input.touchedFiles.length > 0
      ? input.touchedFiles
      : extractTouchedFiles(input.patch);
  const addedLines = extractAddedLines(input.patch);

  const violations: PolicyViolation[] = [];
  for (const rule of applicable) {
    const hit = matchOne(rule, touchedFiles, addedLines);
    if (hit) violations.push({ ruleId: rule.id, message: rule.message, matchedFile: hit });
  }
  return { violations, evaluatedRuleIds };
}

function matchOne(
  rule: PolicyRule,
  touchedFiles: readonly string[],
  addedLines: readonly { file: string | null; line: string }[],
): string | null {
  const hasGlob = !!rule.matchTouchedFiles;
  const hasRegex = !!rule.matchAddedContent;

  let globHits: string[] | null = null;
  if (hasGlob) {
    const re = globToRegex(rule.matchTouchedFiles!.glob);
    globHits = touchedFiles.filter((f) => re.test(f));
    if (globHits.length === 0) return null;
  }

  if (!hasRegex) {
    // Glob-only rule: any matched file refuses.
    return globHits && globHits.length > 0 ? globHits[0]! : null;
  }

  const re = new RegExp(
    rule.matchAddedContent!.regex,
    rule.matchAddedContent!.flags ?? "",
  );

  // If a glob filter exists, only scan added lines whose file is in the
  // glob-hit set. Otherwise scan every added line.
  const fileFilter = globHits ? new Set(globHits) : null;
  for (const { file, line } of addedLines) {
    if (fileFilter && (file === null || !fileFilter.has(file))) continue;
    const truncated =
      line.length > POLICY_LIMITS.maxScanItemLength
        ? line.slice(0, POLICY_LIMITS.maxScanItemLength)
        : line;
    re.lastIndex = 0; // safe regardless of /g flag
    if (re.test(truncated)) {
      return file;
    }
  }
  return null;
}

/**
 * Walk the unified diff and return added-line content (the `+` lines,
 * excluding the `+++` file header). Each line is tagged with the file
 * its `+++ b/<path>` header most recently named so glob filtering works.
 */
function extractAddedLines(
  patch: string,
): { file: string | null; line: string }[] {
  const out: { file: string | null; line: string }[] = [];
  const lines = patch.split(/\r?\n/);
  let currentFile: string | null = null;
  for (const raw of lines) {
    const header = /^\+\+\+ (?:b\/)?(.+)$/.exec(raw);
    if (header) {
      const target = header[1]!.trim();
      currentFile = target === "/dev/null" ? null : target;
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (!raw.startsWith("+")) continue;
    out.push({ file: currentFile, line: raw.slice(1) });
  }
  return out;
}

function extractTouchedFiles(patch: string): string[] {
  const set = new Set<string>();
  const lines = patch.split(/\r?\n/);
  for (const raw of lines) {
    let m = /^diff --git a\/(.*?) b\/(.+)$/.exec(raw);
    if (m) {
      set.add(m[1]!);
      set.add(m[2]!);
      continue;
    }
    m = /^\+\+\+ (?:b\/)?(.+)$/.exec(raw);
    if (m) {
      const t = m[1]!.trim();
      if (t !== "/dev/null") set.add(t);
      continue;
    }
    m = /^--- (?:a\/)?(.+)$/.exec(raw);
    if (m) {
      const t = m[1]!.trim();
      if (t !== "/dev/null") set.add(t);
    }
  }
  return [...set];
}
