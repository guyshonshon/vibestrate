// Project policy - block tier (docs/design/policy-consolidation.md). A `block`-tier
// policy is a DETERMINISTIC hard merge-cap: its regex `matcher` is matched against
// the run's ADDED diff lines, and any match caps merge-readiness. This is the only
// place a project policy touches the merge gate, and it is deliberately NOT the model
// reviewer (a model verdict in the merge path could brick legitimate merges; a regex
// blocks exactly what it matches).
//
// Reuses the policy engine's VALIDATED primitives rather than a parallel engine:
// `extractAddedLines` for the diff body and `POLICY_LIMITS` for the bounds (the same
// ReDoS defense the shipped policy engine relies on - there is no runtime regex
// cancellation in Node). Matchers are validated at write/confirm time (the
// projectPolicySchema refine), so a malformed matcher here is a near-impossible edge;
// if one slips through it is treated as INERT (fail-open) and surfaced, never a crash
// and never a silent block of every merge.
import { POLICY_LIMITS } from "../policies/policy-types.js";
import { extractAddedLines } from "../policies/policy-engine.js";
import { isSecretLikePath } from "../core/diff-service.js";
import type { ProjectPolicy } from "../project/config-schema.js";

export type BlockPolicyViolation = {
  id: string;
  statement: string;
  /** The file the match occurred in (null for an added line with no file header). */
  file: string | null;
};

export type BlockPolicyResult = {
  /** True when no confirmed block policy matched the diff. */
  clean: boolean;
  violations: BlockPolicyViolation[];
  /** Confirmed block policies that could not be enforced (no/invalid matcher) -
   *  fail-open, surfaced so a broken hard-gate is visible, not silent. */
  inert: { id: string; reason: string }[];
};

export function evaluateBlockPolicies(
  policies: readonly ProjectPolicy[],
  patch: string,
): BlockPolicyResult {
  const added = extractAddedLines(patch);
  const violations: BlockPolicyViolation[] = [];
  const inert: { id: string; reason: string }[] = [];
  for (const p of policies ?? []) {
    if (!p || p.confirmedAt == null) continue; // trust gate: unconfirmed is inert
    if (p.tier !== "block") continue;
    if (!p.matcher) {
      inert.push({ id: p.id, reason: "block policy has no matcher" });
      continue;
    }
    if (p.matcher.length > POLICY_LIMITS.maxRegexLength) {
      inert.push({ id: p.id, reason: "matcher exceeds the length cap" });
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(p.matcher);
    } catch {
      inert.push({ id: p.id, reason: "matcher is not a valid regular expression" });
      continue;
    }
    let matchedFile: string | null | undefined;
    for (const { file, line } of added) {
      // Never scan secret-like files (matches the policy/secret-redaction posture).
      if (file != null && isSecretLikePath(file)) continue;
      const truncated =
        line.length > POLICY_LIMITS.maxScanItemLength
          ? line.slice(0, POLICY_LIMITS.maxScanItemLength)
          : line;
      re.lastIndex = 0; // safe regardless of a /g flag
      if (re.test(truncated)) {
        matchedFile = file; // may be null on a /dev/null-headed added line
        break;
      }
    }
    if (matchedFile !== undefined) {
      violations.push({ id: p.id, statement: p.statement, file: matchedFile });
    }
  }
  return { clean: violations.length === 0, violations, inert };
}
