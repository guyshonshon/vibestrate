import type { ChipTone } from "./Chip.js";

// The single source of truth for step-kind colour. Steps are coloured by what
// they DO in the build -> review -> ship loop, not one arbitrary hue per kind -
// so two same-coloured steps genuinely share a function. Used by the step list,
// the kind chips, the bar-meter, and the builder legend, so they never drift.
export type StepKindGroup = "build" | "review" | "check" | "gate";

export function stepKindGroup(kind: string): StepKindGroup {
  switch (kind) {
    case "review-turn":
    case "summary-turn":
      return "review";
    case "validation":
      return "check";
    case "approval-gate":
      return "gate";
    // agent-turn + response-turn both produce/change the work.
    default:
      return "build";
  }
}

export const STEP_GROUP_LABEL: Record<StepKindGroup, string> = {
  build: "Build",
  review: "Review",
  check: "Check",
  gate: "Gate",
};

export const STEP_GROUP_DESC: Record<StepKindGroup, string> = {
  build: "an agent produces or changes the work (agent-turn, response-turn)",
  review: "an agent judges the work, no new changes (review-turn, summary-turn)",
  check: "automated commands, pass/fail (validation)",
  gate: "a human decides whether to continue (approval-gate)",
};

/** Chip/dot tone (Tailwind token) per group. */
export const STEP_GROUP_TONE: Record<StepKindGroup, ChipTone> = {
  build: "violet",
  review: "sky",
  check: "emerald",
  gate: "amber",
};

/** Mid-tone hex per group for the bar-meter's inline fills (reads on both
 *  themes). Steps of unknown kind (hub rows that only know a count) stay grey
 *  via STEP_GROUP_HEX_UNKNOWN - never coloured as if they were "build". */
export const STEP_GROUP_HEX: Record<StepKindGroup, string> = {
  build: "#a78bfa", // violet-soft
  review: "#7cc5ff", // sky-glow
  check: "#34d399", // emerald
  gate: "#fb923c", // amber-soft
};
export const STEP_GROUP_HEX_UNKNOWN = "#9a9aa2";
