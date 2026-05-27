import {
  flowDefinitionSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";

// The built-in **default flow**: the fixed plan → architect → implement →
// validate → review → (fix → re-validate → review)* → verify workflow, expressed
// as a real flow definition. This is the single source of truth for the default
// workflow's shape — a plain `amaco run` resolves it and executes it through the
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
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      slot: "architect",
      roleId: "architect",
      stage: "architecting",
      inputs: ["task-brief", "plan"],
      outputs: ["architecture"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "executor",
      roleId: "executor",
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
      slot: "reviewer",
      roleId: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "plan", "architecture", "execution", "validation"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "fix",
      label: "Fix",
      kind: "response-turn",
      slot: "fixer",
      roleId: "fixer",
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
      slot: "verifier",
      roleId: "verifier",
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

// Minimal looped flow — the "just a coder + a reviewer" shape. The loop body is
// the whole flow (implement → review); the review (decisionStep at the tail)
// loops back to the coder while it asks for changes, up to the bound. No
// planner/architect/verifier: an APPROVED review + passing validation is
// merge-ready (the runner only requires verification when a verify step exists).
export const coderReviewerFlow = flowDefinitionSchema.parse({
  id: "coder-reviewer",
  version: 1,
  label: "Coder + Reviewer (looped)",
  description:
    "A minimal loop: the coder implements, the reviewer checks, and it loops back to the coder until the review passes or the bound is hit. No separate planner or verifier.",
  slots: {
    coder: {
      label: "Coder",
      description: "Implements and revises the change.",
      defaultRole: "executor",
    },
    reviewer: {
      label: "Reviewer",
      description: "Reviews the diff and decides whether to loop back.",
      defaultRole: "reviewer",
    },
  },
  steps: [
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "coder",
      roleId: "executor",
      stage: "executing",
      // On a loop-back the review's findings are in scope so the coder revises.
      inputs: ["task-brief", "findings"],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      slot: "reviewer",
      roleId: "reviewer",
      stage: "reviewing",
      inputs: ["execution", "diff"],
      outputs: ["findings", "review-decision"],
    },
  ],
  loop: {
    from: "implement",
    to: "review",
    decisionStep: "review",
    maxIterations: 3,
  },
});

export const builtinFlows: readonly FlowDefinition[] = [
  defaultFlow,
  coderReviewerFlow,
  qualityArbitrationFlow,
];

export function findBuiltinFlow(id: string): FlowDefinition | null {
  return builtinFlows.find((flow) => flow.id === id) ?? null;
}
