// specUpPosture (docs/design/spec-up-phase.md:178-182, spec-up-phase-plan.md:96).
// A persona aims the spec-up PLANNING agents (intake / scope / spec / architecture)
// the way `reviewLenses` aim the independent reviewers.
//
// Unlike `reviewLenses` - which governs the REVIEWER and is a CLOSED vocabulary so a
// persona can never smuggle behavior past the gate - `specUpPosture` is free text:
// it governs the PLANNING agents, the same trust class as the per-step CTO-director
// `instructions` already baked into the spec-up flows, and the spec-up output is
// human-reviewed before any build. Why free text is safe here (orchestrator-personas.md
// non-negotiable #7): the posture text is ALWAYS committed/reviewed config - the run
// API/CLI accepts only a persona *id*, never free text, so it can never be remotely
// sourced. It reaches the spec-up-review reviewer turn too, whose APPROVED decision
// feeds computeMergeReady - but that gate governs a read-only, NO-DIFF, human-stepped
// terminal status (there is nothing to merge/push), not a code merge.

/** The spec-up phase flow ids - the only runs that carry a spec-up posture. */
export const SPEC_UP_FLOW_IDS: ReadonlySet<string> = new Set([
  "spec-up-intake",
  "spec-up",
  "spec-up-roadmap",
]);

/** Pure. True for a spec-up phase run (intake / spec-up / roadmap). */
export function isSpecUpFlow(flowId: string | null | undefined): boolean {
  return flowId != null && SPEC_UP_FLOW_IDS.has(flowId);
}

/**
 * Pure. Wrap a persona's free-text spec-up posture in a bounded, labelled block for
 * injection into spec-up turns. Returns null for an empty/whitespace posture, so the
 * caller injects nothing and spec-up runs are byte-identical to before.
 */
export function renderSpecUpPostureBlock(
  specUpPosture: string | null | undefined,
): string | null {
  const posture = (specUpPosture ?? "").trim();
  if (!posture) return null;
  return `Supervisor spec-up posture - bring this lens to the scoping, the spec, and the architecture (advisory; the spec is human-reviewed before any build):\n${posture}`;
}
