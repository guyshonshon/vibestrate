import {
  flowDefinitionSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";

// The built-in **Default flow**: the fixed plan → architect → implement →
// validate → review → (fix → re-validate → review)* → verify workflow,
// expressed as a real flow definition (D2 phase B). This is the single source
// of truth for the workflow's shape; `orchestrator.run()` still encodes the
// same sequence imperatively until phase B-3 retires the run()/runFlowSequence()
// split and executes this definition directly.
//
// The review→fix loop is the adaptive-loop construct, not a fixed repeat: the
// body is [review, fix, revalidation] and `decisionStep` is the head `review`.
// Contract for the loop runner (B-3): each pass runs `review` first; if its
// decision is not CHANGES_REQUESTED the loop exits *before* `fix` (straight to
// `verify`); otherwise it runs `fix` + `revalidation` and loops back to
// `review`. This mirrors `run()`'s review-first loop, where the first review
// can approve and skip every fix. `maxIterations: 3` = the initial review plus
// the default `workflow.maxReviewLoops` (2) fix cycles; B-3 may source the
// bound from config instead of the static value.
//
// As of B-3a the flow runner iterates adaptive loops, so this is now in
// `builtinFlows` below — discoverable and runnable as `--flow default`, which
// executes the review→fix loop correctly. The *implicit* default (a run with no
// flow picked) still goes through `orchestrator.run()`; flipping that and
// retiring the run()/runFlowSequence() split is B-3c.
export const defaultFlow = flowDefinitionSchema.parse({
  id: "default",
  version: 1,
  label: "Default",
  description:
    "The standard plan → architect → implement → validate → review workflow. Review loops back to fix and re-validate until it passes or the bound is hit, then a verify gate decides merge-readiness. Runs when no other flow is picked.",
  slots: {
    planner: {
      label: "Planner",
      description: "Turns the task into a plan.",
      defaultRole: "planner",
    },
    architect: {
      label: "Architect",
      description: "Designs the approach from the plan.",
      defaultRole: "architect",
    },
    executor: {
      label: "Executor",
      description: "Implements the plan and architecture.",
      defaultRole: "executor",
    },
    reviewer: {
      label: "Reviewer",
      description: "Reviews the diff and decides whether changes are needed.",
      defaultRole: "reviewer",
    },
    fixer: {
      label: "Fixer",
      description: "Addresses review findings.",
      defaultRole: "fixer",
    },
    verifier: {
      label: "Verifier",
      description: "Independently verifies the approved result.",
      defaultRole: "verifier",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      slot: "planner",
      roleId: "planner",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      slot: "architect",
      roleId: "architect",
      inputs: ["task-brief", "plan"],
      outputs: ["architecture"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "executor",
      roleId: "executor",
      inputs: ["task-brief", "plan", "architecture"],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      inputs: ["diff"],
      outputs: ["validation"],
      skipWhenReadOnly: true,
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      slot: "reviewer",
      roleId: "reviewer",
      inputs: ["task-brief", "plan", "architecture", "execution", "validation"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "fix",
      label: "Fix",
      kind: "response-turn",
      slot: "fixer",
      roleId: "fixer",
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
      inputs: ["diff"],
      outputs: ["validation"],
      skipWhenReadOnly: true,
    },
    {
      id: "verify",
      label: "Verify",
      kind: "summary-turn",
      slot: "verifier",
      roleId: "verifier",
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
});

export const qualityArbitrationFlow = flowDefinitionSchema.parse({
  id: "quality-arbitration",
  version: 1,
  label: "Quality Arbitration",
  description:
    "Cross-provider planning, review, implementation, challenge, second review, and Amaco decision summary.",
  slots: {
    builder: {
      label: "Builder",
      description: "Plans, implements, and answers review findings.",
      defaultRole: "executor",
    },
    challenger: {
      label: "Challenger",
      description: "Challenges plans and code before the final decision.",
      defaultRole: "reviewer",
    },
    arbiter: {
      label: "Arbiter",
      description: "Summarizes evidence, disagreement, and residual risk.",
      defaultRole: "verifier",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      slot: "builder",
      roleId: "planner",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "plan-review",
      label: "Plan Review",
      kind: "review-turn",
      slot: "challenger",
      roleId: "reviewer",
      inputs: ["task-brief", "plan"],
      outputs: ["findings"],
      optional: true,
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "builder",
      roleId: "executor",
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
      slot: "challenger",
      roleId: "reviewer",
      inputs: ["plan", "diff", "validation"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "challenge-response",
      label: "Challenge Response",
      kind: "response-turn",
      slot: "builder",
      roleId: "fixer",
      inputs: ["findings", "diff", "validation"],
      outputs: ["finding-responses", "diff"],
    },
    {
      id: "second-review",
      label: "Second Review",
      kind: "review-turn",
      slot: "challenger",
      roleId: "reviewer",
      inputs: ["findings", "finding-responses", "diff", "validation"],
      outputs: ["finding-resolutions", "review-decision"],
    },
    {
      id: "decision-summary",
      label: "Decision Summary",
      kind: "summary-turn",
      slot: "arbiter",
      roleId: "verifier",
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
});

export const builtinFlows: readonly FlowDefinition[] = [
  defaultFlow,
  qualityArbitrationFlow,
];

export function findBuiltinFlow(id: string): FlowDefinition | null {
  return builtinFlows.find((flow) => flow.id === id) ?? null;
}
