// The Flow Editor decides which controls to OFFER per step kind
// (`stepFieldGate`), while `flowDefinitionSchema` decides what is VALID. These
// tests pin the first against the second: a refinement change in the schema
// breaks a test here instead of quietly leaving a control on screen that the
// save will reject, or hiding one the schema would have accepted.
import { describe, expect, it } from "vitest";
import {
  STEP_KINDS,
  draftFromDefinition,
  draftToCandidate,
  draftsDiffer,
  emptyDraft,
  moveStep,
  newStep,
  stepFieldGate,
  validateDraft,
  type EditorStep,
  type FlowEditorDraft,
} from "../src/ui/components/flow-builder/flow-draft.js";
import {
  flowDefinitionSchema,
  type FlowStepKind,
} from "../src/flows/schemas/flow-schema.js";

/** A minimal draft: one seat, and the steps the caller supplies. */
function draftWith(steps: EditorStep[]): FlowEditorDraft {
  return {
    id: "editor-fixture",
    version: 1,
    label: "Editor fixture",
    description: "A flow assembled by the editor test.",
    seats: [{ key: "s", id: "worker", label: "Worker", description: "" }],
    steps,
    loop: null,
    passthrough: {},
  };
}

function stepOfKind(kind: FlowStepKind, id: string): EditorStep {
  const base = { ...newStep([]), id, label: `Step ${id}`, kind };
  // Every turn kind needs a seat, so give one unconditionally: a missing-seat
  // error would mask the field-level issue each test is actually probing.
  base.seat = "worker";
  if (kind === "approval-gate") {
    base.seat = "";
    base.approval = {
      reason: "The change touches the release path.",
      requestedAction: "Approve before it ships.",
      userMessage: "",
      riskLevel: "medium",
    };
  }
  return base;
}

/** Issue messages anchored to the step at `index`, for a targeted assertion. */
function issuesFor(draft: FlowEditorDraft, index: number): string[] {
  return (validateDraft(draft).stepIssues.get(index) ?? []).map((i) => i.message);
}

describe("the editor's baseline drafts parse", () => {
  it("a blank new flow is one edit away from valid: only id and name are missing", () => {
    const draft = emptyDraft();
    const fields = validateDraft(draft).flowIssues.map((i) =>
      i.anchor.kind === "flow" ? i.anchor.field : "",
    );
    expect(new Set(fields)).toEqual(new Set(["id", "label", "description"]));
  });

  it("filling in the identity makes the starter draft valid", () => {
    const draft = {
      ...emptyDraft(),
      id: "starter",
      label: "Starter",
      description: "One seat, one step.",
    };
    const result = validateDraft(draft);
    expect(result.issues).toEqual([]);
    expect(result.definition?.id).toBe("starter");
  });
});

describe("stepFieldGate matches the schema's refinements", () => {
  // `skills` is turn-kinds-only per the schema; probe each kind for real.
  it.each(STEP_KINDS)("offers skills on %s exactly when the schema allows it", (kind) => {
    const step = stepOfKind(kind, "probe");
    const draft = draftWith([stepOfKind("agent-turn", "build"), { ...step, skills: ["a-skill"] }]);
    const rejected = issuesFor(draft, 1).some((m) => m.includes("skills"));
    expect(rejected).toBe(!stepFieldGate(kind, { graphMode: false }).skills);
  });

  it.each(STEP_KINDS)("offers a seat on %s exactly when the schema requires one", (kind) => {
    const draft = draftWith([
      stepOfKind("agent-turn", "build"),
      { ...stepOfKind(kind, "probe"), seat: "" },
    ]);
    const missingSeat = issuesFor(draft, 1).some((m) => m.includes("needs a seat"));
    expect(missingSeat).toBe(stepFieldGate(kind, { graphMode: false }).seat);
  });

  it.each(STEP_KINDS)("offers skipWhen on %s exactly when the schema allows it", (kind) => {
    const draft = draftWith([
      stepOfKind("agent-turn", "build"),
      { ...stepOfKind(kind, "probe"), skipWhen: "inert_diff" },
    ]);
    const rejected = issuesFor(draft, 1).some((m) => m.includes("skipWhen"));
    expect(rejected).toBe(!stepFieldGate(kind, { graphMode: false }).skipWhen);
  });

  it("hides continueOnError and retries on a linear flow, because the schema rejects them there", () => {
    const gate = stepFieldGate("agent-turn", { graphMode: false });
    expect(gate.continueOnError).toBe(false);
    expect(gate.retries).toBe(false);

    const draft = draftWith([
      stepOfKind("agent-turn", "build"),
      { ...stepOfKind("agent-turn", "probe"), continueOnError: true, retries: 2 },
    ]);
    const messages = issuesFor(draft, 1);
    expect(messages.some((m) => m.includes("continueOnError"))).toBe(true);
    expect(messages.some((m) => m.includes("retries"))).toBe(true);
  });

  it("offers continueOnError and retries once a step declares needs", () => {
    const gate = stepFieldGate("agent-turn", { graphMode: true });
    expect(gate.continueOnError).toBe(true);
    expect(gate.retries).toBe(true);

    const draft = draftWith([
      stepOfKind("agent-turn", "build"),
      {
        ...stepOfKind("agent-turn", "probe"),
        needs: ["build"],
        continueOnError: true,
        retries: 2,
      },
    ]);
    expect(validateDraft(draft).issues).toEqual([]);
  });

  it("hides repeat in graph mode and on an approval gate, matching the schema", () => {
    expect(stepFieldGate("agent-turn", { graphMode: true }).repeat).toBe(false);
    expect(stepFieldGate("approval-gate", { graphMode: false }).repeat).toBe(false);
  });
});

describe("violations anchor to the step that caused them", () => {
  it("pins the over-wide parallel group to a step, not to the flow", () => {
    // Five steps sharing one `needs` set is one over MAX_PARALLEL_FANOUT.
    const root = stepOfKind("agent-turn", "root");
    const fan = ["a", "b", "c", "d", "e"].map((id) => ({
      ...stepOfKind("review-turn", id),
      needs: ["root"],
      outputs: [`findings-${id}`],
    }));
    const result = validateDraft(draftWith([root, ...fan]));
    const fanout = result.issues.find((i) => i.message.includes("max fan-out"));
    expect(fanout).toBeDefined();
    expect(fanout?.anchor.kind).toBe("step");
  });

  it("pins a loop crossed with graph mode to the loop", () => {
    const draft: FlowEditorDraft = {
      ...draftWith([
        stepOfKind("agent-turn", "build"),
        { ...stepOfKind("review-turn", "review"), needs: ["build"] },
      ]),
      loop: { from: "build", to: "review", decisionStep: "review", maxIterations: 3 },
    };
    const result = validateDraft(draft);
    expect(result.loopIssues.map((i) => i.message).join(" ")).toContain(
      "can't also use an adaptive `loop`",
    );
  });

  it("pins a forward needs reference to the step that declared it", () => {
    const draft = draftWith([
      { ...stepOfKind("agent-turn", "first"), needs: ["second"] },
      stepOfKind("review-turn", "second"),
    ]);
    expect(issuesFor(draft, 0).join(" ")).toContain("must be declared earlier");
  });

  it("reports a duplicate seat id the record shape would otherwise erase", () => {
    const draft = draftWith([stepOfKind("agent-turn", "build")]);
    draft.seats = [
      { key: "a", id: "worker", label: "Worker", description: "" },
      { key: "b", id: "worker", label: "Worker two", description: "" },
    ];
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    expect(result.seatIssues.get("worker")?.[0]?.message).toContain(
      "Two seats share the id",
    );
  });
});

describe("what the editor validated is what the save posts", () => {
  // The page posts `validation.definition` - the schema's own parsed output -
  // to POST /api/flows, where `createFlowBody` parses it with the SAME schema.
  // If that round trip were not idempotent, a flow could read "valid" in the
  // form and still be refused on the way to disk, which is the exact failure
  // this editor exists to prevent.
  it("re-parses the parsed definition unchanged", () => {
    const draft: FlowEditorDraft = {
      ...draftWith([
        stepOfKind("agent-turn", "build"),
        { ...stepOfKind("review-turn", "review"), inputs: ["plan"], outputs: ["findings"] },
        { ...stepOfKind("agent-turn", "fix"), repeatTimes: 2 },
        stepOfKind("approval-gate", "gate"),
      ]),
      loop: { from: "build", to: "review", decisionStep: "review", maxIterations: 3 },
    };
    const first = validateDraft(draft).definition;
    expect(first).not.toBeNull();

    const second = flowDefinitionSchema.safeParse(first);
    expect(second.success).toBe(true);
    expect(second.success && second.data).toEqual(first);
  });
});

describe("loading an existing flow", () => {
  it("carries top-level fields the form has no control for through a round trip", () => {
    const definition = {
      id: "carried",
      version: 2,
      label: "Carried",
      description: "Has params the editor never shows.",
      seats: { worker: { label: "Worker" } },
      steps: [
        {
          id: "build",
          label: "Build",
          kind: "agent-turn",
          seat: "worker",
          inputs: [],
          outputs: [],
          needs: [],
          optional: false,
          skipWhenReadOnly: false,
          cleanRoom: false,
          continueOnError: false,
          retries: 0,
          skills: [],
        },
      ],
      params: { niche: { type: "string", required: true, secret: false, shared: true } },
      complexity: "low",
      hidden: true,
    };
    const draft = draftFromDefinition(definition);
    const candidate = draftToCandidate(draft);
    expect(candidate.params).toEqual(definition.params);
    expect(candidate.complexity).toBe("low");
    expect(candidate.hidden).toBe(true);
    expect(validateDraft(draft).issues).toEqual([]);
  });

  it("a freshly loaded draft is not dirty", () => {
    const draft = {
      ...emptyDraft(),
      id: "clean",
      label: "Clean",
      description: "Loaded and untouched.",
    };
    const reloaded = draftFromDefinition(validateDraft(draft).definition);
    expect(draftsDiffer(draft, reloaded)).toBe(false);
  });

  it("mints a distinct id when steps are added back-to-back", () => {
    // The page adds inside the state updater so `newStep` sees the list React
    // holds. Reading a stale list twice is what produced two steps both
    // called "step-2", which the schema then rejected as a duplicate id.
    let steps = [stepOfKind("agent-turn", "step-1")];
    steps = [...steps, newStep(steps)];
    steps = [...steps, newStep(steps)];
    expect(new Set(steps.map((s) => s.id)).size).toBe(3);
    expect(new Set(steps.map((s) => s.key)).size).toBe(3);
  });

  it("reordering steps changes the draft", () => {
    const steps = [stepOfKind("agent-turn", "one"), stepOfKind("agent-turn", "two")];
    const before = draftWith(steps);
    const after = { ...before, steps: moveStep(steps, 1, 0) };
    expect(draftsDiffer(before, after)).toBe(true);
  });
});
