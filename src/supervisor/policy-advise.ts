// Project policy - advise tier. Owner-taught, project-scoped rules ("use a hyphen,
// not an em-dash"; "no eyebrow labels") rendered into agent turns so a MODEL honours
// them - the enforcement tier for rules that are real but not mechanizable.
//
// TWO AUDIENCES, TWO WORDINGS, one selection. A reviewer is told to VERIFY the diff
// against each rule and flag violations; a code-WRITING seat (implementer/fixer) is
// told to COMPLY with each while making the change. Injecting into reviewers only -
// the original behaviour - meant every violation cost a full review -> fix -> re-review
// round trip to remove something the writer would not have written had it been told.
// Measured on a benchmark build: the identical XSS was written on every attempt and
// caught every time, never prevented.
//
// The writer wording deliberately CONSTRAINS rather than commissions work: it says
// comply while making this change, never "audit the codebase against these", so the
// block does not fight the ponytail minimalism posture that shares the same turn.
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

/** Pure. One rule per line, with the owner's stated correction when there is one. */
function renderPolicyLines(injected: readonly ProjectPolicy[]): string[] {
  return injected.map((p) => {
    const statement = p.statement.trim().replace(/\.+$/, "");
    return p.correction
      ? `- ${statement}. Fix: ${p.correction.trim()}`
      : `- ${statement}.`;
  });
}

const REVIEWER_HEADER =
  "Project policies - verify the change against each; flag every violation with its exact location and the stated correction (advisory; rides the normal review -> fix loop, never softens a code-enforced gate):";

// Comply, do not commission. The writer is told these bind the code it is about to
// write - NOT that it should go find existing violations, which would turn every
// policy into a refactor and fight the ponytail posture on the same turn.
const WRITER_HEADER =
  "Project policies - these bind the code you write. Comply with each one in this change; do not go looking for pre-existing violations elsewhere, and do not widen the task to satisfy them. A reviewer checks the diff against this same list:";

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
  const block = [REVIEWER_HEADER, ...renderPolicyLines(injected)].join("\n");
  return { block, injected, droppedForCap };
}

/**
 * Pure. The same selection, worded for a code-WRITING seat (implementer/fixer) so
 * the rules reach the turn that can still avoid the violation. Same trust gate, same
 * scope filter, same cap - only the header differs, so a rule can never reach a
 * writer without also being checkable by a reviewer.
 */
export function renderPolicyComplyBlock(
  policies: readonly ProjectPolicy[],
  ctx: { activeLenses: readonly string[] },
): PolicyAdviseSelection | null {
  const { injected, droppedForCap } = selectAdvisePolicies(policies, ctx);
  if (injected.length === 0) return null;
  const block = [WRITER_HEADER, ...renderPolicyLines(injected)].join("\n");
  return { block, injected, droppedForCap };
}
