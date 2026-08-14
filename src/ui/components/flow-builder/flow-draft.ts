// The Flow Editor's draft model and its validation. No JSX and no network, so
// the whole thing is unit-testable without a DOM.
//
// The one rule this module exists to enforce: `flowDefinitionSchema` is the
// ONLY judge of whether a draft is a valid flow. Nothing here re-states a
// schema rule as an `if`. `validateDraft` builds the candidate object, hands it
// to the real schema, and translates zod's issue paths into anchors the UI can
// pin to the step, seat, or field that caused them. When the draft parses, the
// parsed output IS what the save posts - so what the editor validated and what
// the server writes cannot diverge.
//
// The draft is deliberately looser than the schema: every text field is a
// string and every optional is representable as empty, because a user midway
// through typing an id is in a state the schema has no shape for. Building the
// candidate is where that looseness collapses back onto the schema's shape.
import {
  flowDefinitionSchema,
  type FlowDefinition,
  type FlowStage,
  type FlowStepKind,
} from "../../../flows/schemas/flow-schema.js";

export const STEP_KINDS: readonly FlowStepKind[] = [
  "agent-turn",
  "review-turn",
  "response-turn",
  "validation",
  "approval-gate",
  "summary-turn",
];

export const FLOW_STAGES: readonly FlowStage[] = [
  "planning",
  "architecting",
  "executing",
  "reviewing",
  "verifying",
];

export type EditorApproval = {
  reason: string;
  requestedAction: string;
  userMessage: string;
  riskLevel: "low" | "medium" | "high";
};

export type EditorSeat = {
  /** React identity. Survives the user renaming the seat id. */
  key: string;
  id: string;
  label: string;
  description: string;
};

/**
 * One step, in the shape the form edits. Empty string means "not set" for every
 * optional text field; `draftToCandidate` omits those keys rather than sending
 * `""`, so the schema reports the refinement that describes the real problem
 * ("needs a seat") instead of a length error on an empty string.
 */
export type EditorStep = {
  /** React identity, independent of `id` so renaming a step doesn't remount it. */
  key: string;
  id: string;
  label: string;
  kind: FlowStepKind;
  seat: string;
  needs: string[];
  inputs: string[];
  outputs: string[];
  instructions: string;
  optional: boolean;
  skipWhenReadOnly: boolean;
  cleanRoom: boolean;
  continueOnError: boolean;
  retries: number;
  stage: FlowStage | "";
  skipWhen: "inert_diff" | "";
  approval: EditorApproval | null;
  /** `repeat.times`, or null for no fixed repeat. */
  repeatTimes: number | null;
  skills: string[];
};

export type EditorLoop = {
  from: string;
  to: string;
  decisionStep: string;
  maxIterations: number;
};

export type FlowEditorDraft = {
  id: string;
  version: number;
  label: string;
  description: string;
  seats: EditorSeat[];
  steps: EditorStep[];
  loop: EditorLoop | null;
  /**
   * Top-level flow fields this editor does not surface (`params`,
   * `capabilities`, `checklistSegment`, `checklistReview`, `complexity`,
   * `hidden`) carried through verbatim. Without this, opening a YAML-authored
   * flow in the form editor and saving would silently delete everything the
   * form has no control for.
   */
  passthrough: Record<string, unknown>;
};

/** Top-level keys the form owns; everything else on a loaded flow is passthrough. */
const FORM_OWNED_KEYS = new Set([
  "id",
  "version",
  "label",
  "description",
  "seats",
  "steps",
  "loop",
]);

let keyCounter = 0;
/**
 * A fresh React key. Callers that also need to SELECT what they just added mint
 * the key up front and pass it in, so the key they hand to `setActiveKey` is the
 * one the committed row carries even if React re-invokes the state updater.
 */
export function editorKey(prefix: "step" | "seat"): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

/** A step id that doesn't collide with the ids already in the draft. */
export function freshStepId(steps: readonly EditorStep[], prefix = "step"): string {
  const taken = new Set(steps.map((s) => s.id));
  for (let i = 1; ; i += 1) {
    const candidate = `${prefix}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function freshSeatId(seats: readonly EditorSeat[], prefix = "seat"): string {
  const taken = new Set(seats.map((s) => s.id));
  for (let i = 1; ; i += 1) {
    const candidate = `${prefix}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A new step, with an id that doesn't collide with `steps`. Callers must build
 * it from the CURRENT step list (inside the state updater), or two adds in one
 * tick both read the pre-add list and mint the same id.
 */
export function newStep(steps: readonly EditorStep[], key = editorKey("step")): EditorStep {
  return {
    key,
    id: freshStepId(steps),
    label: "New step",
    kind: "agent-turn",
    seat: "",
    needs: [],
    inputs: [],
    outputs: [],
    instructions: "",
    optional: false,
    skipWhenReadOnly: false,
    cleanRoom: false,
    continueOnError: false,
    retries: 0,
    stage: "",
    skipWhen: "",
    approval: null,
    repeatTimes: null,
    skills: [],
  };
}

export function newSeat(seats: readonly EditorSeat[], key = editorKey("seat")): EditorSeat {
  const id = freshSeatId(seats);
  return { key, id, label: id, description: "" };
}

/** The starting point for "create a new flow": one seat, one step, nothing else. */
export function emptyDraft(): FlowEditorDraft {
  const seats = [
    {
      key: editorKey("seat"),
      id: "implementer",
      label: "Implementer",
      description: "",
    },
  ];
  const step = { ...newStep([]), seat: "implementer", label: "Build the change" };
  return {
    id: "",
    version: 1,
    label: "",
    description: "",
    seats,
    steps: [step],
    loop: null,
    passthrough: {},
  };
}

/**
 * Lift a saved flow definition into the draft. Takes the definition as `unknown`
 * and reads it defensively: what arrives over HTTP is JSON, and the editor must
 * fail on a bad shape by showing schema errors, not by throwing mid-render.
 */
export function draftFromDefinition(definition: unknown): FlowEditorDraft {
  const raw = (definition ?? {}) as Record<string, unknown>;
  const passthrough: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!FORM_OWNED_KEYS.has(k)) passthrough[k] = v;
  }

  const seatsRaw = (raw.seats ?? {}) as Record<string, unknown>;
  const seats: EditorSeat[] = Object.entries(seatsRaw).map(([id, value]) => {
    const seat = (value ?? {}) as Record<string, unknown>;
    return {
      key: editorKey("seat"),
      id,
      label: typeof seat.label === "string" ? seat.label : "",
      description: typeof seat.description === "string" ? seat.description : "",
    };
  });

  const stepsRaw = Array.isArray(raw.steps) ? (raw.steps as unknown[]) : [];
  const steps: EditorStep[] = stepsRaw.map((value) => {
    const s = (value ?? {}) as Record<string, unknown>;
    const approvalRaw = s.approval as Record<string, unknown> | undefined | null;
    const repeatRaw = s.repeat as Record<string, unknown> | undefined | null;
    return {
      key: editorKey("step"),
      id: str(s.id),
      label: str(s.label),
      kind: (STEP_KINDS.includes(s.kind as FlowStepKind)
        ? (s.kind as FlowStepKind)
        : "agent-turn"),
      seat: str(s.seat),
      needs: strArray(s.needs),
      inputs: strArray(s.inputs),
      outputs: strArray(s.outputs),
      instructions: str(s.instructions),
      optional: s.optional === true,
      skipWhenReadOnly: s.skipWhenReadOnly === true,
      cleanRoom: s.cleanRoom === true,
      continueOnError: s.continueOnError === true,
      retries: typeof s.retries === "number" ? s.retries : 0,
      stage: FLOW_STAGES.includes(s.stage as FlowStage) ? (s.stage as FlowStage) : "",
      skipWhen: s.skipWhen === "inert_diff" ? "inert_diff" : "",
      approval: approvalRaw
        ? {
            reason: str(approvalRaw.reason),
            requestedAction: str(approvalRaw.requestedAction),
            userMessage: str(approvalRaw.userMessage),
            riskLevel:
              approvalRaw.riskLevel === "low" || approvalRaw.riskLevel === "high"
                ? approvalRaw.riskLevel
                : "medium",
          }
        : null,
      repeatTimes:
        repeatRaw && typeof repeatRaw.times === "number" ? repeatRaw.times : null,
      skills: strArray(s.skills),
    };
  });

  const loopRaw = raw.loop as Record<string, unknown> | undefined | null;
  return {
    id: str(raw.id),
    version: typeof raw.version === "number" ? raw.version : 1,
    label: str(raw.label),
    description: str(raw.description),
    seats,
    steps,
    loop: loopRaw
      ? {
          from: str(loopRaw.from),
          to: str(loopRaw.to),
          decisionStep: str(loopRaw.decisionStep),
          maxIterations:
            typeof loopRaw.maxIterations === "number" ? loopRaw.maxIterations : 3,
        }
      : null,
    passthrough,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Collapse the draft onto the object shape `flowDefinitionSchema` parses. This
 * is the only place the loose form shape meets the strict schema shape, and it
 * makes exactly one kind of decision: an unset optional is OMITTED, never sent
 * as an empty string or a null.
 */
export function draftToCandidate(draft: FlowEditorDraft): Record<string, unknown> {
  const seats: Record<string, unknown> = {};
  for (const seat of draft.seats) {
    const value: Record<string, unknown> = { label: seat.label };
    if (seat.description) value.description = seat.description;
    seats[seat.id] = value;
  }

  const steps = draft.steps.map((s) => {
    const out: Record<string, unknown> = {
      id: s.id,
      label: s.label,
      kind: s.kind,
      inputs: s.inputs,
      outputs: s.outputs,
      needs: s.needs,
      optional: s.optional,
      skipWhenReadOnly: s.skipWhenReadOnly,
      cleanRoom: s.cleanRoom,
      continueOnError: s.continueOnError,
      retries: s.retries,
      skills: s.skills,
    };
    if (s.seat) out.seat = s.seat;
    if (s.instructions) out.instructions = s.instructions;
    if (s.stage) out.stage = s.stage;
    if (s.skipWhen) out.skipWhen = s.skipWhen;
    if (s.repeatTimes !== null) out.repeat = { times: s.repeatTimes };
    if (s.approval) {
      const approval: Record<string, unknown> = {
        reason: s.approval.reason,
        requestedAction: s.approval.requestedAction,
        riskLevel: s.approval.riskLevel,
      };
      if (s.approval.userMessage) approval.userMessage = s.approval.userMessage;
      out.approval = approval;
    }
    return out;
  });

  const candidate: Record<string, unknown> = {
    ...draft.passthrough,
    id: draft.id,
    version: draft.version,
    label: draft.label,
    description: draft.description,
    seats,
    steps,
  };
  if (draft.loop) candidate.loop = draft.loop;
  return candidate;
}

export type IssueAnchor =
  | { kind: "flow"; field: string }
  | { kind: "seat"; seatId: string }
  | { kind: "step"; stepIndex: number; field: string | null }
  | { kind: "loop" };

export type FlowIssue = { message: string; anchor: IssueAnchor };

export type FlowDraftValidation = {
  ok: boolean;
  issues: FlowIssue[];
  /** Issues by step index, so a row can carry the violation it caused. */
  stepIssues: Map<number, FlowIssue[]>;
  seatIssues: Map<string, FlowIssue[]>;
  loopIssues: FlowIssue[];
  /** Everything not anchored to a step, seat, or the loop. */
  flowIssues: FlowIssue[];
  /**
   * The parsed definition, or null when the draft is invalid. Saving posts THIS
   * object, so the editor can never send a shape the schema didn't approve.
   */
  definition: FlowDefinition | null;
};

// What a field is called on screen, so a generic zod issue can name it. Only
// the fields this editor renders need an entry; anything else falls back to the
// raw path segment, which is still better than an unlabelled sentence.
const FIELD_LABEL: Record<string, string> = {
  id: "The id",
  version: "The version",
  label: "The name",
  description: "The description",
  seats: "Seats",
  steps: "Steps",
  seat: "The seat",
  kind: "The kind",
  inputs: "Inputs",
  outputs: "Outputs",
  needs: "Needs",
  instructions: "The instructions",
  skills: "Skills",
  retries: "Retries",
  stage: "The stage",
  approval: "The approval gate",
  reason: "The reason",
  requestedAction: "The requested action",
  userMessage: "The message to the approver",
  riskLevel: "The risk level",
  repeat: "The repeat count",
  times: "Times",
  maxIterations: "Max iterations",
  from: "The first step",
  to: "The last step",
  decisionStep: "The decision step",
};

function fieldLabel(path: readonly PropertyKey[]): string {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const seg = path[i];
    if (typeof seg !== "string") continue;
    return FIELD_LABEL[seg] ?? seg;
  }
  return "This flow";
}

/**
 * Turn a zod issue into a sentence.
 *
 * Every rule specific to flows is a `custom` refinement whose message already
 * names the step and says what to do, so those pass through untouched -
 * rewriting them would put a second copy of the rule in the UI. What gets
 * rewritten is only zod's own generic vocabulary ("Too small: expected string
 * to have >=1 characters"), which names no field and reads as machine output.
 */
function messageFor(issue: {
  code: string;
  message: string;
  path: readonly PropertyKey[];
}): string {
  if (issue.code === "custom") return issue.message;
  const field = fieldLabel(issue.path);
  const bound = issue as { minimum?: unknown; maximum?: unknown };
  switch (issue.code) {
    case "too_small":
      return bound.minimum === 1 || bound.minimum === undefined
        ? `${field} is required.`
        : `${field} must be at least ${String(bound.minimum)}.`;
    case "too_big":
      return `${field} can be at most ${String(bound.maximum)}.`;
    case "invalid_type":
      return `${field} is required.`;
    default:
      // Regex and enum failures already carry the schema's own wording
      // (flowTokenSchema spells out the token rule), so keep it.
      return issue.message;
  }
}

/**
 * One field, one sentence. An empty id fails both the "required" and the token
 * -shape rules at once; showing both stacks two complaints on a field the user
 * has not filled in yet, and only the first one is actionable.
 */
function dropRedundant(issues: FlowIssue[]): FlowIssue[] {
  const required = new Set<string>();
  for (const issue of issues) {
    if (issue.message.endsWith(" is required.")) required.add(anchorKey(issue.anchor));
  }
  return issues.filter(
    (issue) =>
      issue.message.endsWith(" is required.") ||
      !required.has(anchorKey(issue.anchor)),
  );
}

function anchorKey(anchor: IssueAnchor): string {
  switch (anchor.kind) {
    case "step":
      return `step:${anchor.stepIndex}:${anchor.field ?? ""}`;
    case "seat":
      return `seat:${anchor.seatId}`;
    case "loop":
      return "loop";
    default:
      return `flow:${anchor.field}`;
  }
}

function anchorFor(path: readonly PropertyKey[]): IssueAnchor {
  const head = path[0];
  if (head === "steps" && typeof path[1] === "number") {
    const field = path[2];
    return {
      kind: "step",
      stepIndex: path[1],
      field: typeof field === "string" ? field : null,
    };
  }
  if (head === "seats" && typeof path[1] === "string") {
    return { kind: "seat", seatId: path[1] };
  }
  if (head === "loop") return { kind: "loop" };
  return { kind: "flow", field: typeof head === "string" ? head : "flow" };
}

/**
 * Two seats sharing an id are invisible to the schema: `seats` is a record, so
 * the second write silently replaces the first and the flow parses clean while
 * the user's screen shows two rows. The schema can't see a collision that the
 * shape itself erases, so the editor reports it - this is the only check here
 * that is not the schema's, and it exists because of a shape limit, not a rule.
 */
function duplicateSeatIssues(draft: FlowEditorDraft): FlowIssue[] {
  const seen = new Set<string>();
  const issues: FlowIssue[] = [];
  for (const seat of draft.seats) {
    if (seen.has(seat.id)) {
      issues.push({
        message: `Two seats share the id "${seat.id}". Seat ids are the keys of the flow's seat map, so the second one would replace the first.`,
        anchor: { kind: "seat", seatId: seat.id },
      });
    }
    seen.add(seat.id);
  }
  return issues;
}

export function validateDraft(draft: FlowEditorDraft): FlowDraftValidation {
  const parsed = flowDefinitionSchema.safeParse(draftToCandidate(draft));
  const issues: FlowIssue[] = parsed.success
    ? []
    : dropRedundant(
        parsed.error.issues.map((issue) => ({
          message: messageFor(issue),
          anchor: anchorFor(issue.path),
        })),
      );
  issues.push(...duplicateSeatIssues(draft));

  const stepIssues = new Map<number, FlowIssue[]>();
  const seatIssues = new Map<string, FlowIssue[]>();
  const loopIssues: FlowIssue[] = [];
  const flowIssues: FlowIssue[] = [];
  for (const issue of issues) {
    switch (issue.anchor.kind) {
      case "step": {
        const bucket = stepIssues.get(issue.anchor.stepIndex);
        if (bucket) bucket.push(issue);
        else stepIssues.set(issue.anchor.stepIndex, [issue]);
        break;
      }
      case "seat": {
        const bucket = seatIssues.get(issue.anchor.seatId);
        if (bucket) bucket.push(issue);
        else seatIssues.set(issue.anchor.seatId, [issue]);
        break;
      }
      case "loop":
        loopIssues.push(issue);
        break;
      default:
        flowIssues.push(issue);
    }
  }

  const ok = parsed.success && issues.length === 0;
  return {
    ok,
    issues,
    stepIssues,
    seatIssues,
    loopIssues,
    flowIssues,
    definition: ok && parsed.success ? parsed.data : null,
  };
}

/** True iff the draft has opted into graph mode: any step declares `needs`. */
export function isGraphDraft(draft: FlowEditorDraft): boolean {
  return draft.steps.some((s) => s.needs.length > 0);
}

/**
 * Which controls a step of this kind is OFFERED. This is an affordance, not a
 * second validator: `validateDraft` is what decides validity, and every entry
 * below names the `flowDefinitionSchema` refinement it mirrors. If the two ever
 * drift, the schema still wins and the violation still surfaces on the step -
 * the user just sees a control that was going to be rejected.
 *
 * `tests/flow-editor-draft.test.ts` pins each entry against the real schema, so
 * a refinement change breaks the test rather than quietly changing the form.
 */
export type StepFieldGate = {
  seat: boolean;
  instructions: boolean;
  skills: boolean;
  approval: boolean;
  repeat: boolean;
  continueOnError: boolean;
  retries: boolean;
  skipWhen: boolean;
};

// Mirrors the schema's TURN_STEP_KINDS.
const TURN_KINDS: ReadonlySet<FlowStepKind> = new Set<FlowStepKind>([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

// Mirrors the schema's SKIP_WHEN_KINDS: the back gates that judge someone
// else's work.
const SKIP_WHEN_KINDS: ReadonlySet<FlowStepKind> = new Set<FlowStepKind>([
  "review-turn",
  "summary-turn",
]);

export function stepFieldGate(
  kind: FlowStepKind,
  opts: { graphMode: boolean },
): StepFieldGate {
  const turn = TURN_KINDS.has(kind);
  return {
    // "Flow step ... of kind ... needs a seat" - turn kinds only.
    seat: turn,
    instructions: turn,
    // "... can't declare skills (turn steps only)".
    skills: turn,
    // "... can only declare approval metadata when kind is approval-gate",
    // and an approval-gate without it is rejected.
    approval: kind === "approval-gate",
    // "Flow approval gate ... cannot repeat", and graph mode rejects repeat
    // outright (a repeat expands ids the DAG can't target).
    repeat: kind !== "approval-gate" && !opts.graphMode,
    // "... only supported in graph flows (declare step `needs`)", turn kinds only.
    continueOnError: turn && opts.graphMode,
    retries: turn && opts.graphMode,
    // "... only supported in linear flows (no `needs`)", review/summary only.
    skipWhen: SKIP_WHEN_KINDS.has(kind) && !opts.graphMode,
  };
}

/**
 * Drop the values a kind change just made illegal. Without this, switching a
 * step from review-turn to validation would leave `skills` set and the flow
 * would refuse to save with an error about a control the form no longer shows.
 */
export function applyKindChange(
  step: EditorStep,
  kind: FlowStepKind,
  opts: { graphMode: boolean },
): EditorStep {
  const gate = stepFieldGate(kind, opts);
  return {
    ...step,
    kind,
    seat: gate.seat ? step.seat : "",
    instructions: gate.instructions ? step.instructions : "",
    skills: gate.skills ? step.skills : [],
    approval: gate.approval
      ? (step.approval ?? {
          reason: "",
          requestedAction: "",
          userMessage: "",
          riskLevel: "medium",
        })
      : null,
    repeatTimes: gate.repeat ? step.repeatTimes : null,
    continueOnError: gate.continueOnError ? step.continueOnError : false,
    retries: gate.retries ? step.retries : 0,
    skipWhen: gate.skipWhen ? step.skipWhen : "",
  };
}

/** Move the step at `from` so it lands at `to`. Returns a new array. */
export function moveStep(
  steps: readonly EditorStep[],
  from: number,
  to: number,
): EditorStep[] {
  if (from < 0 || from >= steps.length) return [...steps];
  const target = Math.max(0, Math.min(to, steps.length - 1));
  if (target === from) return [...steps];
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved!);
  return next;
}

/**
 * Whether two drafts differ, for the dirty flag. Compares the candidate rather
 * than the draft so React-only bookkeeping (the `key` fields) never reads as an
 * edit.
 */
export function draftsDiffer(a: FlowEditorDraft, b: FlowEditorDraft): boolean {
  return JSON.stringify(draftToCandidate(a)) !== JSON.stringify(draftToCandidate(b));
}
