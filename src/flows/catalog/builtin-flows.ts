import {
  flowDefinitionSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";

// The built-in **default flow**: the fixed plan → architect → implement →
// validate → review → (fix → re-validate → review)* → verify workflow, expressed
// as a real flow definition. This is the single source of truth for the default
// workflow's shape — a plain `vibe run` resolves it and executes it through the
// one flow runner (see runner-unification.md). There is no separate code path.
//
// The review→fix loop is the adaptive-loop construct, not a fixed repeat: the
// body is [review, fix, revalidation] and `decisionStep` is the head `review`.
// Each pass runs `review` first; if its decision is not CHANGES_REQUESTED the
// loop exits *before* `fix` (straight to `verify`); otherwise it runs `fix` +
// `revalidation` and loops back to `review`. `maxIterations: 3` = the initial
// review plus the default `workflow.maxReviewLoops` (2) fix cycles.
//
// `skipWhenReadOnly` marks the steps a read-only run skips; `stage` marks each
// step's phase so `--resume-from <stage>` can seed the upstream steps.
export const defaultFlow = flowDefinitionSchema.parse({
  id: "default",
  version: 1,
  label: "Default",
  description:
    "The standard plan → architect → implement → validate → review workflow. Review loops back to fix and re-validate until it passes or the bound is hit, then a verify gate decides merge-readiness. Runs when no other flow is picked.",
  seats: {
    planner: {
      label: "Planner",
      description: "Turns the task into a plan.",
    },
    architect: {
      label: "Architect",
      description: "Designs the approach from the plan.",
    },
    implementer: {
      label: "Implementer",
      description: "Implements the plan and architecture.",
    },
    reviewer: {
      label: "Reviewer",
      description: "Reviews the diff and decides whether changes are needed.",
    },
    fixer: {
      label: "Fixer",
      description: "Addresses review findings.",
    },
    verifier: {
      label: "Verifier",
      description: "Independently verifies the approved result.",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      seat: "architect",
      stage: "architecting",
      inputs: ["task-brief", "plan"],
      outputs: ["architecture"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: ["task-brief", "plan", "architecture"],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      stage: "executing",
      inputs: ["diff"],
      outputs: ["validation"],
      skipWhenReadOnly: true,
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "plan", "architecture", "execution", "validation"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "fix",
      label: "Fix",
      kind: "response-turn",
      seat: "fixer",
      stage: "executing",
      inputs: [
        "task-brief",
        "plan",
        "architecture",
        "execution",
        "findings",
        "validation",
      ],
      outputs: ["finding-responses", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "revalidation",
      label: "Re-validate",
      kind: "validation",
      stage: "executing",
      inputs: ["diff"],
      outputs: ["validation"],
      skipWhenReadOnly: true,
    },
    {
      id: "verify",
      label: "Verify",
      kind: "summary-turn",
      seat: "verifier",
      stage: "verifying",
      inputs: [
        "task-brief",
        "plan",
        "architecture",
        "execution",
        "findings",
        "validation",
      ],
      outputs: ["verification"],
      skipWhenReadOnly: true,
    },
  ],
  loop: {
    from: "review",
    to: "revalidation",
    decisionStep: "review",
    maxIterations: 3,
  },
  complexity: "high",
});

export const qualityArbitrationFlow = flowDefinitionSchema.parse({
  id: "quality-arbitration",
  version: 1,
  label: "Quality Arbitration",
  description:
    "Cross-provider planning, review, implementation, challenge, second review, and Vibestrate decision summary.",
  seats: {
    builder: {
      label: "Builder",
      description: "Plans, implements, and answers review findings.",
    },
    challenger: {
      label: "Challenger",
      description: "Challenges plans and code before the final decision.",
    },
    arbiter: {
      label: "Arbiter",
      description: "Summarizes evidence, disagreement, and residual risk.",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      seat: "builder",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "plan-review",
      label: "Plan Review",
      kind: "review-turn",
      seat: "challenger",
      inputs: ["task-brief", "plan"],
      outputs: ["findings"],
      optional: true,
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "builder",
      inputs: ["task-brief", "plan", "findings"],
      outputs: ["execution", "diff"],
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      inputs: ["diff"],
      outputs: ["validation"],
    },
    {
      id: "implementation-review",
      label: "Implementation Review",
      kind: "review-turn",
      seat: "challenger",
      inputs: ["plan", "diff", "validation"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "challenge-response",
      label: "Challenge Response",
      kind: "response-turn",
      seat: "builder",
      inputs: ["findings", "diff", "validation"],
      outputs: ["finding-responses", "diff"],
    },
    {
      id: "second-review",
      label: "Second Review",
      kind: "review-turn",
      seat: "challenger",
      inputs: ["findings", "finding-responses", "diff", "validation"],
      outputs: ["finding-resolutions", "review-decision"],
    },
    {
      id: "decision-summary",
      label: "Decision Summary",
      kind: "summary-turn",
      seat: "arbiter",
      inputs: [
        "plan",
        "findings",
        "finding-responses",
        "finding-resolutions",
        "diff",
        "validation",
      ],
      outputs: ["decision-summary"],
    },
  ],
  complexity: "high",
});

// The built-in **pick-up flow**: the checklist-aware shape for executing a card
// item-by-item (Phase 3, design §1). A holistic `plan` runs ONCE (it sees the
// whole card + all items via the task brief); then the `checklistSegment`
// (`micro-plan` → `implement`) repeats ONCE PER checklist item, in one worktree,
// with the current-item brief + carried compact summaries injected as the
// `checklist-item` / `prior-items` context tokens; finally a holistic `review`
// runs ONCE over the accumulated work. The runner commits + summarizes each item
// at the segment tail. With no checklist (or an instant task) the segment just
// runs once — the N=1 case.
export const pickupFlow = flowDefinitionSchema.parse({
  id: "pickup",
  version: 1,
  label: "Pick-up (checklist)",
  description:
    "Execute a card item-by-item: a holistic plan once, then micro-plan → implement repeated per checklist item in one worktree (compact summaries carried forward, a commit per item), then a holistic review.",
  seats: {
    planner: { label: "Planner", description: "Plans the card and each item." },
    implementer: {
      label: "Implementer",
      description: "Implements one checklist item at a time.",
    },
    reviewer: {
      label: "Reviewer",
      description: "Reviews the accumulated result across all items.",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "micro-plan",
      label: "Micro-plan item",
      kind: "agent-turn",
      seat: "planner",
      // The whole per-item band runs under the "executing" run status (the run
      // is executing the checklist); keeping micro-plan here makes the
      // jump-back between items a self-transition rather than a regress to
      // "planning".
      stage: "executing",
      inputs: ["task-brief", "plan", "checklist-item", "prior-items"],
      outputs: ["micro-plan"],
    },
    {
      id: "implement",
      label: "Implement item",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: [
        "task-brief",
        "plan",
        "micro-plan",
        "checklist-item",
        "prior-items",
      ],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "plan", "execution", "prior-items"],
      outputs: ["findings", "review-decision"],
    },
  ],
  checklistSegment: { from: "micro-plan", to: "implement" },
  complexity: "medium",
});

export const builtinFlows: readonly FlowDefinition[] = [
  defaultFlow,
  qualityArbitrationFlow,
  pickupFlow,
];

export function findBuiltinFlow(id: string): FlowDefinition | null {
  return builtinFlows.find((flow) => flow.id === id) ?? null;
}
