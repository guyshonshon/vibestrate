// Preference block gate (M2, docs/design/preference-gates.md). A `block`-severity
// preference is a DETERMINISTIC hard merge-cap: its regex `pattern` is matched
// against the run's ADDED diff lines, and any match caps merge-readiness. This is
// the only place a preference touches the merge gate, and it is deliberately NOT
// the model reviewer (a model verdict in the merge path could brick legitimate
// merges; a regex blocks exactly what it matches).
//
// Reuses the policy engine's VALIDATED primitives rather than a parallel engine:
// `extractAddedLines` for the diff body and `POLICY_LIMITS` for the bounds (the
// same ReDoS defense the shipped policy engine relies on - there is no runtime
// regex cancellation in Node). Patterns are validated at write/confirm time (the
// preferenceSchema refine), so a malformed pattern here is a near-impossible edge;
// if one slips through it is treated as INERT (fail-open) and surfaced, never a
// crash and never a silent block of every merge.
import { POLICY_LIMITS } from "../policies/policy-types.js";
import { extractAddedLines } from "../policies/policy-engine.js";
import { isSecretLikePath } from "../core/diff-service.js";
import type { PersonaPreference } from "../project/config-schema.js";

export type PreferenceViolation = {
  id: string;
  statement: string;
  /** The file the match occurred in (null for an added line with no file header). */
  file: string | null;
};

export type PreferenceBlockResult = {
  /** True when no confirmed block preference matched the diff. */
  clean: boolean;
  violations: PreferenceViolation[];
  /** Confirmed block preferences that could not be enforced (no/invalid pattern) -
   *  fail-open, surfaced so a broken hard-gate is visible, not silent. */
  inert: { id: string; reason: string }[];
};

export function evaluateBlockPreferences(
  preferences: readonly PersonaPreference[],
  patch: string,
): PreferenceBlockResult {
  const added = extractAddedLines(patch);
  const violations: PreferenceViolation[] = [];
  const inert: { id: string; reason: string }[] = [];
  for (const p of preferences ?? []) {
    if (!p || p.confirmedAt == null) continue; // trust gate: unconfirmed is inert
    if (p.severity !== "block") continue;
    if (!p.pattern) {
      inert.push({ id: p.id, reason: "block preference has no pattern" });
      continue;
    }
    if (p.pattern.length > POLICY_LIMITS.maxRegexLength) {
      inert.push({ id: p.id, reason: "pattern exceeds the length cap" });
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(p.pattern);
    } catch {
      inert.push({ id: p.id, reason: "pattern is not a valid regular expression" });
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
