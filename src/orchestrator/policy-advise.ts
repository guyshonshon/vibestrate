// Project policy - advise tier (docs/design/policy-consolidation.md). Owner-taught,
// project-scoped rules ("use a hyphen, not an em-dash"; "no eyebrow labels")
// rendered into a reviewer turn so a MODEL verifies the artifact against them - the
// enforcement tier for rules that are real but not mechanizable.
//
// Project-scoped (was persona-scoped): a project-wide rule reaches the review under
// ANY active supervisor. An UNSCOPED rule (scope.lenses == []) injects on every run;
// a lens-scoped rule is an opt-in targeting refinement (fires only when the run's
// active lenses include one of them) - not persona ownership.
//
// Safe to inject as free text for the SAME reason specUpPosture is: it is
// owner-committed config, referenced by id, never accepted as free text over the run
// API/CLI. The injectability gate is `confirmedAt`: a supervisor-*proposed*
// (unconfirmed) rule is inert and its text never reaches a prompt.
//
// No code-enforced merge gate rides on an advise rule; a flagged rule rides the
// existing review -> fix -> re-review loop. The `block` tier (policy-block.ts) is the
// deterministic merge-cap.
import type { ProjectPolicy } from "../project/config-schema.js";

/** Max advise rules injected into a single reviewer turn (keeps context bounded). */
export const POLICY_ADVISE_INJECTION_CAP = 12;

export type PolicyAdviseSelection = {
  /** The prompt block appended to a reviewer turn. */
  block: string;
  /** The rules that made it into the block (declaration order, deduped). */
  injected: ProjectPolicy[];
  /** How many confirmed/in-scope rules were dropped by the cap. */
  droppedForCap: number;
};

/**
 * Pure. Select the confirmed, advise-tier, in-scope rules for a reviewer turn,
 * deduped by id and capped. A rule is in scope when its `scope.lenses` is empty
 * (every run) or intersects the run's active review lenses (opt-in targeting).
 */
export function selectAdvisePolicies(
  policies: readonly ProjectPolicy[],
  ctx: { activeLenses: readonly string[] },
): { injected: ProjectPolicy[]; droppedForCap: number } {
  const active = new Set(ctx.activeLenses);
  const seen = new Set<string>();
  const matched: ProjectPolicy[] = [];
  for (const p of policies ?? []) {
    if (!p || p.confirmedAt == null) continue; // trust gate: unconfirmed is inert
    if (p.tier !== "advise") continue; // block tier is deterministic, not injected
    if (seen.has(p.id)) continue;
    const lenses = p.scope?.lenses ?? [];
    const inScope = lenses.length === 0 || lenses.some((l) => active.has(l));
    if (!inScope) continue;
    seen.add(p.id);
    matched.push(p);
  }
  const injected = matched.slice(0, POLICY_ADVISE_INJECTION_CAP);
  return { injected, droppedForCap: matched.length - injected.length };
}

/**
 * Pure. Render the selected advise rules into a bounded, labelled reviewer block.
 * Returns null when nothing is selected, so the caller injects nothing and the turn
 * is byte-identical to before.
 */
export function renderPolicyAdviseBlock(
  policies: readonly ProjectPolicy[],
  ctx: { activeLenses: readonly string[] },
): PolicyAdviseSelection | null {
  const { injected, droppedForCap } = selectAdvisePolicies(policies, ctx);
  if (injected.length === 0) return null;
  const lines = injected.map((p) => {
    const statement = p.statement.trim().replace(/\.+$/, "");
    return p.correction
      ? `- ${statement}. Fix: ${p.correction.trim()}`
      : `- ${statement}.`;
  });
  const block = [
    "Project policies - verify the change against each; flag every violation with its exact location and the stated correction (advisory; rides the normal review -> fix loop, never softens a code-enforced gate):",
    ...lines,
  ].join("\n");
  return { block, injected, droppedForCap };
}
