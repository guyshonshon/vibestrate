// The general-purpose flows: what a run picks when it picks nothing, the
// read-only planner, the fast track, and the params worked example.
//
// Parsed through flowDefinitionSchema at module load, so a malformed builtin
// fails at IMPORT rather than at run time. See ../builtin-flows.ts for the
// catalog-wide editing rules.

import {
  flowDefinitionSchema,
} from "../../schemas/flow-schema.js";

// The built-in **default flow**: plan → implement → validate → review, with
// the reviewer sending changes STRAIGHT BACK to the implementer. This is the
// single source of truth for the default workflow's shape - a plain `vibe run`
// resolves it and executes it through the one flow runner. There is no
// separate code path.
//
// Three seats on purpose. The earlier six-seat pipeline (architect, dedicated
// fixer, verify gate - preserved below as `deep`) spent five of its six turns
// around the one turn that writes code, and profiling real runs showed the
// wall was almost entirely those extra full-context turns. Here the
// implementer owns its work through the loop: its role prompt ends with a
// scoped self-review of its own diff, and review findings re-enter the
// SAME implement step rather than a separate fixer seat.
//
// The loop body is [implement, validation, review] with `decisionStep` at the
// tail `review`. Each pass implements (with the latest findings in context -
// the `findings` input is empty on the first pass and carries the review's
// arbitration ledger on re-entry), validates, then reviews; a decision other
// than CHANGES_REQUESTED exits the loop. `maxIterations: 3` = the initial
// implementation plus two redo passes.
//
// No verify summary-turn: merge-readiness is an APPROVED review plus passing
// validation (merge-readiness.ts waives the verification clause when no
// summary-turn ran). The reviewer seat is the judge of record - the scaffolded
// crew runs it under the `review_exec` permission profile so it can execute
// the test suite itself instead of trusting the implementer's word.
//
// `skipWhenReadOnly` marks the steps a read-only run skips; `stage` marks each
// step's phase so `--resume-from <stage>` can seed the upstream steps.
export const defaultFlow = flowDefinitionSchema.parse({
  id: "default",
  version: 2,
  label: "Default",
  description:
    "Plan → implement → validate → review. Changes requested go straight back to the implementer - who self-reviews its own diff before every hand-off - until the reviewer approves or the loop budget runs out. The reviewer judges the whole execution against the plan and project rules, and can run the tests itself.",
  seats: {
    planner: {
      label: "Planner",
      description: "Turns the task into a plan.",
    },
    implementer: {
      label: "Implementer",
      description:
        "Implements the plan, self-reviews its own diff in scope, and owns the work through review rounds.",
    },
    reviewer: {
      label: "Reviewer",
      description:
        "Judges the whole execution against the plan and project rules; may run the tests.",
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
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      // `findings` and `validation` are produced LATER in the sequence, so on
      // the first pass they resolve as omitted-unavailable; on loop re-entry
      // they carry the review's findings ledger and the last validation run.
      inputs: ["task-brief", "plan", "findings", "validation"],
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
      inputs: ["task-brief", "plan", "execution", "validation"],
      // The reviewer judges what was actually built, against the standard it
      // was asked for. A summarized `execution` is the failure this contract
      // exists for - a reviewer told the exact content is available above,
      // holding a digest of the code it is meant to be reviewing, reporting
      // findings about work it never saw. `task-brief` is the standard itself;
      // a review measured against a summary of the goal is a different review.
      //
      // Requiring `execution` is only safe because the runner now declares what
      // its run shape cannot produce: a read-only run skips the step that
      // outputs it, and that exemption is recorded on the packet rather than
      // silently applied. `plan` and `validation` stay optional - the loop
      // re-enters review before either necessarily exists.
      requiredInputs: ["task-brief", "execution"],
      outputs: ["findings", "review-decision"],
    },
  ],
  loop: {
    from: "implement",
    to: "review",
    decisionStep: "review",
    maxIterations: 3,
  },
  complexity: "medium",
  capabilities: {
    taskKinds: ["feature", "bugfix", "refactor", "chore", "docs"],
    strengths: ["general", "implementation"],
    costClass: "medium",
    latencyClass: "medium",
    requires: { validation: true },
  },
});

// ── Deep ───────────────────────────────────────────────────────────────────
// The six-seat pipeline that WAS the default: plan → architect → implement →
// validate → review → (fix → re-validate → review)* → verify. Kept as its own
// flow for work where a separate architecture pass and an independent verify
// gate earn their turns; the default is now the three-seat loop above.
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
export const deepFlow = flowDefinitionSchema.parse({
  id: "deep",
  version: 1,
  label: "Deep",
  description:
    "The heavyweight pipeline: plan → architect → implement → validate → review, with a dedicated fixer answering review rounds and an independent verify gate deciding merge-readiness.",
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
  capabilities: {
    taskKinds: ["feature", "bugfix", "refactor", "chore", "docs"],
    strengths: ["general", "implementation"],
    costClass: "medium",
    latencyClass: "medium",
    requires: { validation: true },
  },
});

// ── Plan-only ("Plan mode") ─────────────────────────────────────────────────
// A plan + review flow: a planner turns the task into a plan and a reviewer
// critiques it. There are no implement/validate/fix/verify steps. The guard is
// NOT the mere absence of write steps - an agent-turn under a write-capable
// crew profile can still touch disk. The real guard is `run-launcher.ts`, which
// forces `readOnly: true` for any flow that produces no `diff`, clamping every
// role to the read-only permission profile; and `select-workflow.ts` excludes
// no-write flows from auto-selection so a cost-minimizing `--select` can't route
// implement-work here and silently write nothing. Reviewing a plan with no diff
// is the same path a read-only default run already takes (implement skipped,
// review still runs). Merge-readiness is APPROVED-only under read-only: the plan
// itself is what the reviewer approves; CHANGES_REQUESTED terminates as BLOCKED.
export const planOnlyFlow = flowDefinitionSchema.parse({
  id: "plan-only",
  version: 1,
  label: "Plan",
  description:
    "Plan + review only - WRITES NO CODE. A planner turns the task into a concrete plan and a reviewer critiques it; nothing is implemented, validated, or written to disk. Produces a vetted plan and an APPROVED / BLOCKED verdict. Do not pick this for tasks that need code changes - it is for thinking a change through before building it.",
  seats: {
    planner: {
      label: "Planner",
      description: "Turns the task into a concrete plan.",
    },
    reviewer: {
      label: "Reviewer",
      description: "Critiques the plan and decides whether it is sound.",
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
      id: "plan-review",
      label: "Review plan",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "plan"],
      outputs: ["findings", "review-decision"],
    },
  ],
  complexity: "low",
  capabilities: {
    taskKinds: [],
    strengths: ["planning", "analysis"],
    costClass: "low",
    latencyClass: "low",
  },
});

// The built-in **express flow**: one implementer turn with a diff-floored safety
// net. Validation is change-scoped, and BOTH back gates - review and verify -
// carry `skipWhen: "inert_diff"`, so they run UNLESS the run's actual diff is
// strict-prose (.md/.markdown/.txt/.rst) and touches no protected path.
//
// Both gates matter, and for different reasons: the review judges the change,
// the verify independently confirms the result. Express is the flow a sizer
// routes to when it believes a task is small, and a sizer works from task text
// - it can be wrong. The diff cannot. So every code change that lands here gets
// checked twice regardless of what anything believed about the task going in,
// while a genuine prose tweak still costs one turn.
//
// A skipped review is recorded evidence; assurance then reports
// `review: skipped_inert_diff`. A gate-free "solo" variant was rejected
// deliberately: the back gate must be decided by the diff, never by task text.
export const expressFlow = flowDefinitionSchema.parse({
  id: "express",
  version: 1,
  label: "Express",
  description:
    "One implementer turn for small, low-risk tasks. Validation is scoped to the actual change, and review plus verification run only when the diff demands it - any non-prose or protected file gets both a real review turn and a real verify turn.",
  seats: {
    implementer: {
      label: "Implementer",
      description: "Implements the task directly (no separate plan/architect).",
    },
    reviewer: {
      label: "Reviewer",
      description:
        "Reviews the diff when the deterministic descent requires it.",
    },
    verifier: {
      label: "Verifier",
      description:
        "Independently confirms the result when the diff demands it.",
    },
  },
  steps: [
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: ["task-brief"],
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
      label: "Review (diff-floored)",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "execution", "validation"],
      outputs: ["findings", "review-decision"],
      skipWhen: "inert_diff",
    },
    {
      id: "verify",
      label: "Verify (diff-floored)",
      kind: "summary-turn",
      seat: "verifier",
      stage: "verifying",
      inputs: ["task-brief", "execution", "findings", "validation"],
      outputs: ["verification"],
      skipWhenReadOnly: true,
      skipWhen: "inert_diff",
    },
  ],
  complexity: "low",
  capabilities: {
    taskKinds: ["docs", "chore", "tweak", "bugfix"],
    strengths: ["speed", "small-changes"],
    costClass: "low",
    latencyClass: "low",
  },
});

// ── Parameterized example ────────────────────────────────────────────────────
// Demonstrates `params:` + `{{params.x}}` substitution. A "scaffold" flow that
// takes a project name + framework and builds a starter. Real, runnable - and
// the worked example the docs point at.
export const scaffoldFlow = flowDefinitionSchema.parse({
  id: "scaffold",
  version: 1,
  label: "Scaffold (parameterized)",
  description:
    "A small parameterized example: scaffold a starter project from a name + framework. Shows how a flow declares `params:` and substitutes them into step instructions with {{params.x}}.",
  params: {
    projectName: {
      type: "string",
      required: true,
      description: "The name of the project to scaffold",
    },
    framework: {
      type: "enum",
      values: ["next", "astro", "sveltekit", "remix"],
      default: "next",
      description: "Which framework to scaffold",
    },
  },
  seats: {
    implementer: {
      label: "Implementer",
      description: "Scaffolds the starter project.",
    },
  },
  steps: [
    {
      id: "scaffold",
      label: "Scaffold the project",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      instructions:
        "Scaffold a starter {{params.framework}} project named \"{{params.projectName}}\". Create a minimal, runnable skeleton; do not over-build.",
      inputs: ["task-brief"],
      outputs: ["execution", "diff"],
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      stage: "executing",
      inputs: ["diff"],
      outputs: ["validation"],
    },
  ],
});
