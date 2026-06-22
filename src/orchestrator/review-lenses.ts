// Persona reviewLenses, made behavioral (orchestrator-personas.md follow-up;
// config-schema.ts personaConfigSchema.reviewLenses: "Not yet enforced as a
// panel-review filter this slice - that is a follow-up"). A persona's
// `reviewLenses` used to be display-only metadata; this maps them through a
// CLOSED vocabulary to fixed review-emphasis prompt fragments and the orchestrator
// injects them into the independent-reviewer turns. So switching persona changes
// WHAT the reviewers scrutinise (the design's "behavioral or cut" non-negotiable),
// not just the label shown in the UI.
//
// The closed vocabulary is load-bearing (orchestrator-personas.md open question:
// "reviewLenses should be a small closed vocabulary mapped to prompt fragments,
// not free text, so personas can't smuggle behavior"). An unknown lens contributes
// NO fragment - it is surfaced for audit but never reaches the reviewer prompt.
// Fail-safe: a typo, or a project persona trying to smuggle an instruction through
// a lens string, is inert rather than injected. Persona text that DOES reach the
// prompt is advisory-tier only and can never soften a code-enforced gate.

/** The closed lens vocabulary -> a one-line review-emphasis fragment. Adding a
 *  lens here is the ONLY way a persona's reviewLens becomes behavioral. Fragments
 *  are descriptive scrutiny aims, never gate-softening instructions. */
export const REVIEW_LENS_FRAGMENTS: Record<string, string> = {
  correctness:
    "Correctness & logic - does the change do what it claims, including edge cases, error paths, and boundary conditions?",
  tests:
    "Test coverage - are the new/changed behaviors covered, and do the tests actually assert behavior (not vacuous/always-pass)?",
  "security-risk":
    "Security risk - blast radius, unsafe defaults, and any handling of auth, secrets, or untrusted input this change touches.",
  authz:
    "Authorization - every new or changed path enforces the right authentication and authorization; no missing, bypassable, or order-dependent checks.",
  secrets:
    "Secrets & exposure - no secret, token, key, or credential is logged, returned in a response, committed, or otherwise exposed by this change.",
  injection:
    "Injection & untrusted input - SQL/command/path/template injection, unsafe deserialization, and unvalidated input reaching a dangerous sink.",
  "ux-ia":
    "UX & information architecture - clarity, hierarchy, and whether the change fits the existing user flows rather than bolting on a new one.",
  accessibility:
    "Accessibility - keyboard reachability, semantics/ARIA, colour contrast, focus handling, and screen-reader behavior.",
  "visual-consistency":
    "Visual consistency - alignment with the existing design tokens, spacing scale, and component patterns; no one-off styling.",
  performance:
    "Performance - avoidable work, N+1 access patterns, oversized payloads, and hot-path cost introduced by this change.",
};

export type ReviewLensEmphasis = {
  /** The prompt block appended to a reviewer turn. */
  block: string;
  /** Lenses that mapped to a fragment (declaration order, deduped). */
  known: string[];
  /** Lenses with no fragment - recorded for audit, NEVER injected. */
  unknown: string[];
};

/**
 * Pure. Map a persona's `reviewLenses` through the closed vocabulary into a
 * bounded review-emphasis block. Returns null when no lens is known (so the
 * caller injects nothing and behavior is byte-identical to before).
 */
export function renderPersonaReviewLensEmphasis(
  reviewLenses: readonly string[],
): ReviewLensEmphasis | null {
  const known: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of reviewLenses ?? []) {
    const lens = (raw ?? "").trim();
    if (!lens || seen.has(lens)) continue;
    seen.add(lens);
    if (Object.prototype.hasOwnProperty.call(REVIEW_LENS_FRAGMENTS, lens)) {
      known.push(lens);
    } else {
      unknown.push(lens);
    }
  }
  if (known.length === 0) return null;
  const block = [
    "Supervisor review lenses - scrutinise this change specifically through these lenses (advisory; never a reason to pass a failing gate):",
    ...known.map((k) => `- ${REVIEW_LENS_FRAGMENTS[k]}`),
  ].join("\n");
  return { block, known, unknown };
}

/**
 * Pure. True for an independent-reviewer turn (a lensed reviewer), false for the
 * arbiter / binding-verdict join. Mirrors flow-resolver's reviewerProfile pinning
 * rule: a `review-turn`/`reviewing`-stage seat that is NOT arbiter-shaped (the
 * "arbiter" seat, or a join reading >= 2 upstream outputs). The arbiter weighs the
 * reviewers and renders the verdict; it is not itself a lens.
 */
export function isReviewerStep(step: {
  kind?: string | null;
  stage?: string | null;
  seat?: string | null;
  needs?: readonly unknown[] | null;
}): boolean {
  const isArbiterShaped =
    step.seat === "arbiter" || (step.needs?.length ?? 0) >= 2;
  return (
    (step.kind === "review-turn" || step.stage === "reviewing") &&
    !isArbiterShaped
  );
}

/**
 * Pure. Compose the `additionalNotes` for a flow-step turn: base notes, the step's
 * own lens/instructions, then the persona's advisory blocks - the reviewLens
 * emphasis ONLY on a lensed reviewer turn, and the spec-up posture (when set, i.e.
 * a spec-up run). Extracted so the injection rules (the design's "behave or cut"
 * acceptance test) are directly unit-testable, not buried in the runner.
 */
export function composeReviewerStepNotes(input: {
  baseNotes: string;
  stepInstructions?: string | null;
  lensEmphasis: string | null;
  isReviewer: boolean;
  /** Persona spec-up posture block; set only on a spec-up run (else null). */
  specUpPostureBlock?: string | null;
}): string {
  let notes = input.stepInstructions
    ? `${input.baseNotes}\n\nStep lens / instructions:\n${input.stepInstructions}`
    : input.baseNotes;
  if (input.lensEmphasis && input.isReviewer) notes += `\n\n${input.lensEmphasis}`;
  if (input.specUpPostureBlock) notes += `\n\n${input.specUpPostureBlock}`;
  return notes;
}
