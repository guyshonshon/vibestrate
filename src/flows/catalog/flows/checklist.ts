// Checklist flows. Each declares a `checklistSegment` whose band is the
// per-item body: it repeats once per open item when the run is bound to a card
// in a checklist mode, and runs once otherwise.
//
// Parsed through flowDefinitionSchema at module load, so a malformed builtin
// fails at IMPORT rather than at run time. See ../builtin-flows.ts for the
// catalog-wide editing rules.

import {
  flowDefinitionSchema,
} from "../../schemas/flow-schema.js";

// The built-in **pick-up flow**: the checklist-aware shape for executing a card
// item-by-item. A holistic `plan` runs ONCE (it sees the
// whole card + all items via the task brief); then the `checklistSegment`
// (`micro-plan` → `implement`) repeats ONCE PER checklist item, in one worktree,
// with the current-item brief + carried compact summaries injected as the
// `checklist-item` / `prior-items` context tokens; finally a holistic `review`
// runs ONCE over the accumulated work. The runner commits + summarizes each item
// at the segment tail. With no checklist (or an instant task) the segment just
// runs once - the N=1 case.
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
  capabilities: {
    taskKinds: ["checklist"],
    strengths: ["multi-step", "checklist"],
    costClass: "medium",
    latencyClass: "medium",
    avoids: { readOnly: true },
  },
});

// The built-in **per-item analysis pick-up**: the first checklist DAG. It is the
// pick-up flow with a GRAPH inside the per-item band: for EACH checklist item,
// two read-only analysts
// study the item in parallel from distinct lenses (risk/impact + test-surface),
// then a single serial implementer writes the item informed by both. "Think in
// parallel, then build", once per item, in one worktree (a commit per item).
//
// Why this shape first: the analysts are read-only `agent-turn`s (not
// review-turns), so the band produces NO arbitration findings - it sidesteps the
// run-global arbitration-ledger collision that a per-item REVIEW panel
// would hit when the same step ids run N times. The analysts share `needs`
// (a parallel group) and are hard-enforced read-only at resolve time, so the
// frontier runs them concurrently with no worktree collision; the implementer is
// the serial join (one writer per worktree). Analysts are `continueOnError`: if
// one lens's provider hard-fails, the item still implements with the survivor.
//
// The band repeats once per checklist item (or runs ONCE for an instant/N=1 or
// read-only run - the fan-out is valuable regardless). A holistic plan runs once
// before the band and a holistic review once after.
export const pickupAnalysisFlow = flowDefinitionSchema.parse({
  id: "pickup-analysis",
  version: 1,
  label: "Pick-up (per-item analysis)",
  description:
    "Execute a card item-by-item with a per-item analysis fan-out: a holistic plan once, then for each checklist item two read-only analysts (risk/impact + tests) run in parallel and the implementer writes the item informed by both (a commit per item), then a holistic review.",
  seats: {
    planner: { label: "Planner", description: "Plans the card and each item." },
    reviewer: {
      label: "Analyst",
      description: "Studies one item under an assigned lens before it is built.",
    },
    implementer: {
      label: "Implementer",
      description: "Implements one item, informed by the analysts.",
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
      // The whole per-item band runs under "executing" (the run is executing the
      // checklist), so the jump-back between items is a self-transition.
      stage: "executing",
      inputs: ["task-brief", "plan", "checklist-item", "prior-items"],
      outputs: ["micro-plan"],
    },
    {
      id: "analyze-risk",
      label: "Analyze: risk & impact",
      kind: "agent-turn",
      seat: "reviewer",
      stage: "executing",
      needs: ["micro-plan"],
      inputs: ["task-brief", "plan", "micro-plan", "checklist-item", "prior-items"],
      outputs: ["analysis-risk"],
      continueOnError: true,
      instructions:
        "Your lens is RISK & IMPACT for THIS checklist item only. Before any code is written, surface what could go wrong: blast radius, data/edge cases, ordering or concurrency hazards, things elsewhere in the codebase this item must not break, and anything that warrants caution. Be concrete and brief; this advice feeds the implementer.",
    },
    {
      id: "analyze-tests",
      label: "Analyze: test surface",
      kind: "agent-turn",
      seat: "reviewer",
      stage: "executing",
      needs: ["micro-plan"],
      inputs: ["task-brief", "plan", "micro-plan", "checklist-item", "prior-items"],
      outputs: ["analysis-tests"],
      continueOnError: true,
      instructions:
        "Your lens is the TEST SURFACE for THIS checklist item only. Before any code is written, identify what should be verified: which behaviors and edge cases need coverage, existing tests that must keep passing, and the smallest checks that would prove the item works. Be concrete and brief; this advice feeds the implementer.",
    },
    {
      id: "implement",
      label: "Implement item",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      // The join: runs after both analysts, informed by both lenses. Single
      // writer in the band - one writer per worktree.
      needs: ["analyze-risk", "analyze-tests"],
      inputs: [
        "task-brief",
        "plan",
        "micro-plan",
        "analysis-risk",
        "analysis-tests",
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
  capabilities: {
    taskKinds: ["checklist"],
    strengths: ["multi-step", "checklist", "analysis"],
    costClass: "medium",
    latencyClass: "medium",
    avoids: { readOnly: true },
  },
});

// The built-in **pick-up (per-item review)** flow: like pickupAnalysisFlow but
// the per-item band runs
// REVIEW AFTER implementation rather than analysis before it. Band structure:
//   micro-plan -> implement -> [review-correctness, review-risk] -> arbiter
// The two reviewer turns fan out in parallel (both read-only, review-turn),
// then the arbiter join reads both and renders a per-item verdict. The holistic
// plan + review steps run once (outside the band). The `per-item-findings` input
// on `implement` carries the arbiter verdict on fix iterations (absent on i=0).
export const pickupReviewFlow = flowDefinitionSchema.parse({
  id: "pickup-review",
  version: 1,
  label: "Pick-up (per-item review)",
  description:
    "Execute a card item-by-item with a per-item REVIEW panel: a holistic plan once, then for each checklist item the implementer writes it and a per-item panel (correctness + risk) plus an arbiter review THAT item's diff; a per-item fix loop runs before the item commits, then a holistic review.",
  seats: {
    planner: { label: "Planner", description: "Plans the card and each item." },
    implementer: { label: "Implementer", description: "Implements (and fixes) one item." },
    reviewer: { label: "Reviewer", description: "Reviews one item under an assigned lens." },
    arbiter: { label: "Arbiter", description: "Renders one per-item verdict." },
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
      needs: ["micro-plan"],
      // per-item-findings is present only on a fix iteration (>0); absent on iteration 0.
      inputs: [
        "task-brief",
        "plan",
        "micro-plan",
        "checklist-item",
        "prior-items",
        "per-item-findings",
      ],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "review-correctness",
      label: "Review: correctness",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["implement"],
      inputs: ["task-brief", "plan", "micro-plan", "execution", "diff", "checklist-item"],
      outputs: ["findings-correctness"],
      continueOnError: true,
      instructions:
        "Your lens is CORRECTNESS & LOGIC for THIS checklist item's diff only. Hunt real bugs: wrong behavior, broken edge cases, races, mishandled errors, contract violations. Cite file:line; no style nits.",
    },
    {
      id: "review-security-risk",
      label: "Review: security risk",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["implement"],
      inputs: ["task-brief", "plan", "micro-plan", "execution", "diff", "checklist-item"],
      outputs: ["findings-security-risk"],
      continueOnError: true,
      instructions:
        "Your lens is SECURITY, RISK & ARCHITECTURE for THIS item's diff only. Injection/secret/path exposure, unsafe effects, broken boundaries, hard-to-revert moves, architectural drift. Flag anything needing sandboxing or human sign-off.",
    },
    {
      id: "arbiter",
      label: "Arbiter verdict",
      kind: "review-turn",
      seat: "arbiter",
      stage: "reviewing",
      needs: ["review-correctness", "review-security-risk"],
      inputs: [
        "task-brief",
        "plan",
        "micro-plan",
        "execution",
        "diff",
        "checklist-item",
        "findings-correctness",
        "findings-security-risk",
      ],
      outputs: ["review-decision"],
      instructions:
        "You are the arbiter for THIS checklist item. Read both reviewers' findings plus the item diff. De-duplicate, weigh severity, render ONE verdict. APPROVED only if no blocking issue survives; otherwise CHANGES_REQUESTED with the consolidated must-fix list. Cite evidence; do not launder confidence.",
    },
    {
      id: "review",
      label: "Holistic review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "plan", "execution", "prior-items"],
      outputs: ["findings", "review-decision"],
    },
  ],
  checklistSegment: { from: "micro-plan", to: "arbiter" },
  checklistReview: { lenses: ["correctness", "security-risk"] },
  complexity: "high",
  capabilities: {
    taskKinds: ["checklist"],
    strengths: ["multi-step", "checklist", "review", "correctness", "security-risk"],
    costClass: "high",
    latencyClass: "high",
    avoids: { readOnly: true },
  },
});

// The built-in **saga** flow (Saga conductor). A LIGHTER sibling of
// pickup-review for sequencing a multi-step saga: it keeps the per-item REVIEW
// band (so the band stays a graph review-band - `review-item` is a review-turn
// with `needs`, which gives the conductor's saga mode its clean halt-with-reset
// + between-steps budget hooks for free), but collapses pickup-review's
// correctness + risk + arbiter PANEL into a SINGLE per-item reviewer. One
// reviewer hunts real bugs AND security/risk in this item's diff and renders the
// verdict directly. Holistic plan + review run once, outside the band. The
// `per-item-findings` input on `implement` carries the prior verdict on fix
// iterations (absent on i=0).
export const sagaFlow = flowDefinitionSchema.parse({
  id: "saga",
  version: 1,
  label: "Saga",
  description:
    "Sequence a multi-step saga item-by-item with a LIGHT per-item review: a holistic plan once, then for each step the implementer writes it and a SINGLE reviewer checks that step's diff for bugs and security/risk and renders APPROVED / CHANGES_REQUESTED; a per-item fix loop runs before the step commits, then a holistic review. Lighter than pick-up (per-item review) - one reviewer, no arbiter panel.",
  seats: {
    planner: { label: "Planner", description: "Plans the saga and each step." },
    implementer: { label: "Implementer", description: "Implements (and fixes) one step." },
    reviewer: { label: "Reviewer", description: "Reviews one step's diff end-to-end." },
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
      label: "Micro-plan step",
      kind: "agent-turn",
      seat: "planner",
      stage: "executing",
      inputs: ["task-brief", "plan", "checklist-item", "prior-items"],
      outputs: ["micro-plan"],
    },
    {
      id: "implement",
      label: "Implement step",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      needs: ["micro-plan"],
      // per-item-findings is present only on a fix iteration (>0); absent on iteration 0.
      inputs: [
        "task-brief",
        "plan",
        "micro-plan",
        "checklist-item",
        "prior-items",
        "per-item-findings",
      ],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "review-item",
      label: "Review step",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["implement"],
      inputs: ["task-brief", "plan", "micro-plan", "execution", "diff", "checklist-item"],
      outputs: ["review-decision"],
      instructions:
        "You are the SINGLE reviewer for THIS saga step's diff only. Hunt real bugs (wrong behavior, broken edge cases, races, mishandled errors, contract violations) AND security/risk (injection, secret/path exposure, unsafe effects, broken boundaries, hard-to-revert moves, architectural drift). Cite file:line; no style nits. Render ONE verdict: APPROVED only if no blocking issue survives, otherwise CHANGES_REQUESTED with the must-fix list. Do not launder confidence.",
    },
    {
      id: "review",
      label: "Holistic review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "plan", "execution", "prior-items"],
      outputs: ["findings", "review-decision"],
    },
  ],
  checklistSegment: { from: "micro-plan", to: "review-item" },
  complexity: "medium",
  capabilities: {
    taskKinds: ["checklist"],
    strengths: ["multi-step", "checklist", "review"],
    costClass: "medium",
    latencyClass: "medium",
    avoids: { readOnly: true },
  },
});
