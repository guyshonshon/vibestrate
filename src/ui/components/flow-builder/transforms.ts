// Pure converters and diff helpers for the Flow Builder: step drafts, the
// full/definition step shapes, and the draft-history snapshot. No JSX - this
// module is unit-testable without a DOM.
import type {
  FlowApprovalGatePatch,
  FlowStepFull,
  FlowStepKind,
  FlowStepPatch,
} from "../../lib/api.js";
import type { FlowLoop, FlowStepDefinition } from "../../lib/types.js";

/**
 * Per-step draft. Each field mirrors the YAML's optional shape with the
 * dashboard's "null means clear, undefined means leave alone" contract
 * from the API. Built lazily when the user first edits a step so the
 * diff-against-source is straightforward.
 */
export type StepDraft = {
  label?: string;
  optional?: boolean;
  kind?: FlowStepKind;
  // null = clear; undefined = no change; string = set
  seat?: string | null;
  approval?: FlowApprovalGatePatch | null;
  // Per-step skills: undefined = no change; array = set the whole list.
  skills?: string[];
  // Free-form per-step prompt instructions: undefined = no change; null = clear;
  // string = set.
  instructions?: string | null;
};

// A snapshot of the whole editable draft, for undo/redo. The four pieces mirror
// the draft* state in FlowBuilderPage. Snapshots are immutable (every mutation
// replaces the object/array rather than mutating it), so storing references is
// safe.
export type DraftSnap = {
  label: string;
  steps: Record<string, StepDraft>;
  stepList: FlowStepFull[] | null;
  loop: FlowLoop | null;
};

export function sameDraftSnap(a: DraftSnap, b: DraftSnap): boolean {
  return (
    a.label === b.label &&
    JSON.stringify(a.steps) === JSON.stringify(b.steps) &&
    JSON.stringify(a.stepList) === JSON.stringify(b.stepList) &&
    JSON.stringify(a.loop) === JSON.stringify(b.loop)
  );
}

// Builder-side sanity check (warn-only, never blocks): a step that acts on prior
// work - a review, a response, a final summary, or an approval gate - makes no
// sense before any agent-turn has actually produced something. Returns a
// human-readable warning, or null when the step is fine where it sits.
const ACTS_ON_PRIOR: ReadonlySet<FlowStepKind> = new Set([
  "review-turn",
  "response-turn",
  "summary-turn",
  "approval-gate",
]);
export function stepOrderWarning(
  steps: FlowStepDefinition[],
  index: number,
): string | null {
  const kind = steps[index]?.kind;
  if (!kind || !ACTS_ON_PRIOR.has(kind)) return null;
  const hasPriorWork = steps
    .slice(0, index)
    .some((s) => s.kind === "agent-turn");
  if (hasPriorWork) return null;
  const what =
    kind === "approval-gate"
      ? "An approval gate here has nothing to approve"
      : kind === "summary-turn"
        ? "A summary-turn here has nothing to summarize"
        : kind === "response-turn"
          ? "A response-turn here has no findings to answer"
          : "A review-turn here has nothing to review";
  return `${what} - no agent-turn produces work before it. Add an agent-turn first.`;
}

/**
 * Reduce a step draft to the minimal patch payload - fields that are
 * absent or match the current saved value get dropped, so the patch
 * surface only carries actual changes (cleaner network + clearer
 * server-side audit).
 */
export function diffStep(
  cur: FlowStepDefinition,
  draft: StepDraft,
): Omit<FlowStepPatch, "id"> | null {
  const out: Omit<FlowStepPatch, "id"> = {};
  if (draft.label !== undefined && draft.label !== cur.label)
    out.label = draft.label;
  if (draft.optional !== undefined && draft.optional !== cur.optional)
    out.optional = draft.optional;
  if (draft.kind !== undefined && draft.kind !== cur.kind)
    out.kind = draft.kind;

  if (draft.seat !== undefined) {
    const currentSeat = cur.seat ?? null;
    if (draft.seat !== currentSeat) out.seat = draft.seat;
  }
  if (draft.approval !== undefined) {
    const currentApproval = cur.approval ?? null;
    if (!approvalEqual(draft.approval, currentApproval))
      out.approval = draft.approval;
  }
  if (draft.skills !== undefined) {
    const curSkills = cur.skills ?? [];
    if (
      draft.skills.length !== curSkills.length ||
      draft.skills.some((s, i) => s !== curSkills[i])
    )
      out.skills = draft.skills;
  }
  if (draft.instructions !== undefined) {
    const curInstr = cur.instructions ?? null;
    if (draft.instructions !== curInstr) out.instructions = draft.instructions;
  }
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Lift the saved step shape into the API's `FlowStepFull` payload so
 * we can carry it through a `replaceSteps` patch. Folds in any field
 * draft so structural ops don't drop simultaneous field edits.
 */
export function toFlowStepFull(
  step: FlowStepDefinition,
  draft?: StepDraft,
): FlowStepFull {
  const base: FlowStepFull = {
    id: step.id,
    label: step.label,
    kind: step.kind,
    inputs: step.inputs.length ? [...step.inputs] : [],
    outputs: step.outputs.length ? [...step.outputs] : [],
    optional: step.optional,
  };
  if (step.seat !== undefined) base.seat = step.seat;
  if (step.stage !== undefined) base.stage = step.stage;
  if (step.skipWhenReadOnly !== undefined)
    base.skipWhenReadOnly = step.skipWhenReadOnly;
  if (step.approval !== undefined) base.approval = step.approval;
  if (step.repeat !== undefined) base.repeat = step.repeat;
  // Preserve per-step skills through structural (replaceSteps) edits - else a
  // reorder/add/remove in the builder would silently wipe YAML-authored skills.
  if (step.skills !== undefined && step.skills.length > 0)
    base.skills = step.skills;
  if (step.instructions !== undefined && step.instructions !== null)
    base.instructions = step.instructions;
  return applyDraftToFullStep(base, draft);
}

/** Project a `FlowStepFull` back into the display shape used by row UI. */
export function toFlowStepDefinition(step: FlowStepFull): FlowStepDefinition {
  const out: FlowStepDefinition = {
    id: step.id,
    label: step.label,
    kind: step.kind,
    inputs: step.inputs ?? [],
    outputs: step.outputs ?? [],
    optional: step.optional ?? false,
  };
  if (step.seat !== undefined) out.seat = step.seat;
  if (step.stage !== undefined) out.stage = step.stage;
  if (step.skipWhenReadOnly !== undefined)
    out.skipWhenReadOnly = step.skipWhenReadOnly;
  if (step.approval !== undefined) out.approval = step.approval;
  if (step.repeat !== undefined) out.repeat = step.repeat;
  if (step.skills !== undefined) out.skills = step.skills;
  if (step.instructions !== undefined) out.instructions = step.instructions;
  return out;
}

// Shallow-merge a per-step field draft onto a display step so the row reflects
// in-progress edits. Only the draft's display fields are merged; everything else
// (needs, inputs, outputs, stage, ...) is preserved from the original, unlike a
// toFlowStepFull round-trip which would drop fields it doesn't carry.
export function foldStepDraftForDisplay(
  def: FlowStepDefinition,
  draft?: StepDraft,
): FlowStepDefinition {
  if (!draft) return def;
  const next: FlowStepDefinition = { ...def };
  if (draft.label !== undefined) next.label = draft.label;
  if (draft.kind !== undefined) next.kind = draft.kind;
  if (draft.optional !== undefined) next.optional = draft.optional;
  if (draft.seat !== undefined) next.seat = draft.seat ?? undefined;
  if (draft.approval !== undefined) next.approval = draft.approval ?? undefined;
  if (draft.skills !== undefined) next.skills = draft.skills;
  if (draft.instructions !== undefined)
    next.instructions = draft.instructions ?? undefined;
  return next;
}

/** Apply a per-step draft (tri-state for nullables) over a full step. */
export function applyDraftToFullStep(
  step: FlowStepFull,
  draft?: StepDraft,
): FlowStepFull {
  if (!draft) return step;
  const next: FlowStepFull = { ...step };
  if (draft.label !== undefined) next.label = draft.label;
  if (draft.kind !== undefined) next.kind = draft.kind;
  if (draft.optional !== undefined) next.optional = draft.optional;
  if (draft.seat !== undefined) {
    if (draft.seat === null) delete next.seat;
    else next.seat = draft.seat;
  }
  if (draft.approval !== undefined) {
    if (draft.approval === null) delete next.approval;
    else next.approval = draft.approval;
  }
  if (draft.skills !== undefined) next.skills = draft.skills;
  if (draft.instructions !== undefined) {
    if (draft.instructions === null) delete next.instructions;
    else next.instructions = draft.instructions;
  }
  return next;
}

/** Generate a step id that doesn't collide with the current list. */
export function freshStepId(list: FlowStepFull[], prefix: string): string {
  const seen = new Set(list.map((s) => s.id));
  for (let i = 1; i < 1000; i++) {
    const candidate = `${prefix}-${i}`;
    if (!seen.has(candidate)) return candidate;
  }
  return `${prefix}-${Date.now()}`;
}

function approvalEqual(
  a: FlowApprovalGatePatch | null,
  b: FlowApprovalGatePatch | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.reason === b.reason &&
    a.requestedAction === b.requestedAction &&
    a.riskLevel === b.riskLevel &&
    (a.userMessage ?? "") === (b.userMessage ?? "")
  );
}

/**
 * Apply a draft's tri-state value (undefined | null | string) over the
 * source value, returning the effective value for display in a controlled
 * input.
 */
export function resolveNullable<T>(draft: T | null | undefined, current: T | null): T | null {
  if (draft === undefined) return current;
  return draft;
}
