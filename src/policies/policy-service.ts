import { loadPolicySnapshot } from "./policy-store.js";
import { evaluatePatchAgainstPolicies } from "./policy-engine.js";
import type { PolicySurface } from "./policy-types.js";

/**
 * Thin orchestrator over the store + engine, used by the apply flows.
 * Returns a uniform `{ ok: true } | { ok: false; reason }` so call sites
 * stay readable.
 *
 * Failure mode for malformed policy files: rules in well-formed files are
 * still applied; malformed files are skipped. This is intentional — a
 * typo in one rule file must not paralyze every apply.
 *
 * Refusal format follows the prompt:
 *   "<message> (policy rule: <id>)"
 */
export async function applyPolicyGate(input: {
  projectRoot: string;
  patch: string;
  touchedFiles?: readonly string[];
  surface: PolicySurface;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const snapshot = await loadPolicySnapshot(input.projectRoot);
  if (snapshot.rules.length === 0) {
    return { ok: true };
  }
  const result = evaluatePatchAgainstPolicies(snapshot.rules, {
    patch: input.patch,
    touchedFiles: input.touchedFiles,
    surface: input.surface,
  });
  if (result.violations.length === 0) {
    return { ok: true };
  }
  const first = result.violations[0]!;
  return {
    ok: false,
    reason: `${first.message} (policy rule: ${first.ruleId})`,
  };
}
