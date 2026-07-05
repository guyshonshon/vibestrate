// ── Known methodologies (durable-memory, bounded) ─────────────────────────────
//
// The project's development methodology is just a durable param (`vibe params
// set methodology=tdd`, a project-global key). When it's set to a value this
// catalog knows, the PLANNER turn gets that ONE methodology's concrete planning
// guidance injected - bounded, so it primes the approach without reintroducing
// context bloat. An unknown value injects nothing (the orchestrator warns once).
//
// Scope is deliberately small: a fixed catalog + a planner-prompt block. The
// "advisor infers a methodology from the codebase and writes it to the profile"
// idea stays CUT (it's the risky durable-memory Slice-4 write path) - methodology
// is user-set, full stop. See docs/design/durable-project-memory.md.

/** A recognized methodology: its label + the concrete planning guidance the
 *  planner receives when the project selects it. */
export type Methodology = {
  id: string;
  label: string;
  /** Bounded planning guidance (a few lines) injected into the planner turn. */
  guidance: string;
};

/** The fixed catalog. Keys are the canonical (lowercase) ids a user sets. */
export const KNOWN_METHODOLOGIES: Record<string, Methodology> = {
  tdd: {
    id: "tdd",
    label: "Test-Driven Development",
    guidance:
      "Plan this change test-first. For each behavior, add or extend a test that " +
      "fails before the code exists, then make it pass, then refactor. The plan " +
      "should name the tests to write and sequence them red -> green -> refactor; " +
      "production code is justified by a failing test, not written ahead of one.",
  },
  bdd: {
    id: "bdd",
    label: "Behavior-Driven Development",
    guidance:
      "Frame this change as observable behaviors first. Describe the scenarios in " +
      "Given-When-Then terms from the user's perspective, then derive the " +
      "implementation from them. The plan should list the scenarios and the " +
      "acceptance check that proves each, before any implementation detail.",
  },
  incremental: {
    id: "incremental",
    label: "Incremental delivery",
    guidance:
      "Deliver in the smallest safe vertical slices, each independently " +
      "shippable and validated, rather than one large change. The plan should " +
      "sequence the slices so the build and tests stay green at every step, and " +
      "call out the first slice that delivers real value.",
  },
};

/** The recognized ids (for error messages, docs, and enum choices). */
export const KNOWN_METHODOLOGY_IDS = Object.keys(KNOWN_METHODOLOGIES);

/** Resolve a stored value to a catalog entry, or null if unset/unknown. Pure;
 *  tolerant of surrounding whitespace and case. */
export function resolveMethodology(
  value: string | null | undefined,
): Methodology | null {
  if (!value) return null;
  return KNOWN_METHODOLOGIES[value.trim().toLowerCase()] ?? null;
}

/**
 * The bounded "# Methodology" prompt section for a selected methodology, or ""
 * when unset/unknown (no section). Framed as a planning directive, not history.
 * Pure - same value => same block.
 */
export function renderMethodologyForPrompt(
  value: string | null | undefined,
): string {
  const m = resolveMethodology(value);
  if (!m) return "";
  return [
    "# Methodology",
    "",
    `This project follows **${m.label}** (\`${m.id}\`). Plan the work accordingly:`,
    "",
    m.guidance,
  ].join("\n");
}
