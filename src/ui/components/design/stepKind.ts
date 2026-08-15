import { Eye, FileCheck, Hammer, Lock, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FlowStepKind } from "../../lib/api.js";
import type { ChipTone } from "./Chip.js";

export type StepKindGroup = "build" | "review" | "check" | "gate";

/**
 * The single source of truth for how a step kind reads on screen.
 *
 * The KEYS are the wire format - `flowStepKindSchema` in
 * flows/schemas/flow-schema.ts - and are what every flow YAML and the builtin
 * catalog already store, so they are never renamed. Everything to the right is
 * display, and this is the only place the UI spells a kind's name, purpose or
 * colour: `stepKindName` is the only way a kind is allowed to reach the DOM.
 *
 * `group` is what the step DOES in the build -> review -> ship loop, and is
 * what drives colour, so two same-coloured steps genuinely share a function
 * rather than each kind owning one arbitrary hue.
 *
 * Declaration order is the order the pickers offer, which is the loop itself.
 */
export const STEP_KIND_INFO: Record<
  FlowStepKind,
  { name: string; does: string; group: StepKindGroup; icon: LucideIcon }
> = {
  "agent-turn": {
    name: "Build",
    does: "A seat writes the change.",
    group: "build",
    icon: Hammer,
  },
  "response-turn": {
    name: "Revise",
    does: "A seat answers the review and fixes.",
    group: "build",
    icon: Wrench,
  },
  "review-turn": {
    name: "Review",
    does: "A seat judges the work.",
    group: "review",
    icon: Eye,
  },
  "summary-turn": {
    name: "Summarize",
    does: "A seat writes the wrap-up.",
    group: "review",
    icon: FileCheck,
  },
  validation: {
    name: "Check",
    does: "Commands run, pass or fail.",
    group: "check",
    icon: ShieldCheck,
  },
  "approval-gate": {
    name: "Approve",
    does: "You decide before it continues.",
    group: "gate",
    icon: Lock,
  },
};

/** Kinds in the order a picker offers them. Derived from the map, so a kind
 *  added to the schema can never be missing from a picker. */
export const STEP_KIND_ORDER = Object.keys(STEP_KIND_INFO) as FlowStepKind[];

/**
 * The on-screen name for a kind. Takes a plain string because some payloads
 * (run audits, YAML previews, graph nodes) are not narrowed to the union, and
 * a kind this build does not know degrades to its stored id rather than
 * blanking the row it appears in.
 */
export function stepKindName(kind: string): string {
  return STEP_KIND_INFO[kind as FlowStepKind]?.name ?? kind;
}

export function stepKindGroup(kind: string): StepKindGroup {
  // An unrecognised kind reads as work, which is what most kinds are. Rows that
  // only know a count carry no kind at all and stay grey via
  // STEP_GROUP_HEX_UNKNOWN instead of coming through here.
  return STEP_KIND_INFO[kind as FlowStepKind]?.group ?? "build";
}

export const STEP_GROUP_LABEL: Record<StepKindGroup, string> = {
  build: "Build",
  review: "Review",
  check: "Check",
  gate: "Gate",
};

const GROUP_PURPOSE: Record<StepKindGroup, string> = {
  build: "produces or changes work",
  review: "judges the work",
  check: "runs commands, pass or fail",
  gate: "a person decides",
};

/** What a legend colour means, plus the kinds that carry it - named the way the
 *  rest of the UI names them, derived so the two can never disagree. */
export const STEP_GROUP_DESC = Object.fromEntries(
  (Object.keys(GROUP_PURPOSE) as StepKindGroup[]).map((g) => {
    const members = STEP_KIND_ORDER.filter(
      (k) => STEP_KIND_INFO[k].group === g,
    ).map((k) => STEP_KIND_INFO[k].name);
    return [g, `${GROUP_PURPOSE[g]} (${members.join(", ")})`];
  }),
) as Record<StepKindGroup, string>;

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
