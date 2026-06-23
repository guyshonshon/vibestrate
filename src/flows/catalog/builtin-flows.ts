import {
  flowDefinitionSchema,
  type FlowDefinition,
} from "../schemas/flow-schema.js";

// The built-in **default flow**: the fixed plan → architect → implement →
// validate → review → (fix → re-validate → review)* → verify workflow, expressed
// as a real flow definition. This is the single source of truth for the default
// workflow's shape - a plain `vibe run` resolves it and executes it through the
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
  capabilities: {
    taskKinds: ["feature", "bugfix", "refactor", "chore", "docs"],
    strengths: ["general", "implementation"],
    costClass: "medium",
    latencyClass: "medium",
    requires: { validation: true },
  },
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
  capabilities: {
    taskKinds: ["feature", "refactor", "bugfix"],
    strengths: ["security", "architecture", "risk", "correctness"],
    costClass: "high",
    latencyClass: "high",
    requires: { validation: true },
  },
});

// The built-in **pick-up flow**: the checklist-aware shape for executing a card
// item-by-item (Phase 3, design §1). A holistic `plan` runs ONCE (it sees the
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

// The built-in **late review panel**: the first graph (DAG) flow (Slice 4,
// custom-workflow-dags.md Phase A+B). It runs the standard plan -> architect ->
// implement -> validate spine, then fans out into THREE read-only reviewers
// that inspect the *same* real diff + validation evidence from distinct lenses
// (correctness, tests, security/risk), concurrently, and an arbiter join reads
// all three and renders one verdict.
//
// Why a panel: late review over a concrete diff catches more than a single
// reviewer, and the lenses are deliberately distinct (not the same prompt 3x).
// The reviewers all sit in the read-only `reviewer` seat (one role, three
// lenses via per-step `instructions`) and write DISTINCT output tokens, so the
// frontier scheduler can run them in parallel with no worktree collision - the
// read-only-ness is hard-enforced at resolve time. The reviewers are
// `continueOnError` (Slice 5): if one lens's provider hard-fails, the run is not
// sunk - that step is marked failed + recorded, and the arbiter still renders a
// verdict from the surviving lenses (the brief tells it which lens is missing). There is no fix loop or
// second validation here: graph flows can't yet combine with the adaptive loop
// (deferred to Phase D), so the panel SURFACES a verdict + findings; a
// CHANGES_REQUESTED arbiter blocks the run honestly for a human/next run.
//
// The orchestrator selects this only when evidence warrants the extra spend
// (security-sensitive, broad/architectural, low validation confidence, or the
// user asks for heavier review) - see select-workflow + its capabilities.
//
// This is also the first flow to adopt the **structured handoff contracts**
// (flow-output-contracts.ts): the builder spine emits `plan-handoff` ->
// `architecture-handoff` -> `execution-handoff` (structured JSON) instead of
// free-form `plan`/`architecture`/`execution`, so the panel reviews against a
// deterministic through-line. Parsing degrades gracefully, so a provider that
// emits imperfect JSON still completes (raw text retained + a parse event).
export const reviewPanelFlow = flowDefinitionSchema.parse({
  id: "panel-review",
  version: 1,
  label: "Late review panel",
  description:
    "Plan, architect, implement, and validate, then fan out a 3-lens read-only review panel (correctness, tests, security/risk) over the real diff and an arbiter join that renders one verdict. Heavier - selected only when evidence warrants it.",
  seats: {
    planner: { label: "Planner", description: "Turns the task into a plan." },
    architect: { label: "Architect", description: "Designs the approach." },
    implementer: { label: "Implementer", description: "Implements the change." },
    reviewer: {
      label: "Reviewer",
      description: "Reviews the diff under one assigned lens.",
    },
    arbiter: {
      label: "Arbiter",
      description: "Reads every reviewer's findings and renders one verdict.",
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
      outputs: ["plan-handoff"],
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      seat: "architect",
      stage: "architecting",
      needs: ["plan"],
      inputs: ["task-brief", "plan-handoff"],
      outputs: ["architecture-handoff"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      needs: ["architecture"],
      inputs: ["task-brief", "plan-handoff", "architecture-handoff"],
      outputs: ["execution-handoff", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      stage: "executing",
      needs: ["implement"],
      inputs: ["diff"],
      outputs: ["validation"],
      skipWhenReadOnly: true,
    },
    {
      id: "review-correctness",
      label: "Review: correctness",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["validation"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
      ],
      outputs: ["findings-correctness"],
      continueOnError: true,
      instructions:
        "Your lens is CORRECTNESS & LOGIC only. Hunt for real bugs: wrong behavior, broken edge cases, race conditions, mishandled errors, off-by-one, contract violations. Ignore style and test-coverage gaps (other reviewers own those). Cite file:line evidence; do not pad with low-severity nits.",
    },
    {
      id: "review-tests",
      label: "Review: tests",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["validation"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
      ],
      outputs: ["findings-tests"],
      continueOnError: true,
      instructions:
        "Your lens is TESTS & VERIFIABILITY only. Are the changes actually covered? Missing/weak assertions, untested branches, flaky patterns, or claims the validation evidence doesn't support. Ignore correctness bugs and security (other reviewers own those). Cite what is and isn't exercised.",
    },
    {
      id: "review-risk",
      label: "Review: security & risk",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["validation"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
      ],
      outputs: ["findings-risk"],
      continueOnError: true,
      instructions:
        "Your lens is SECURITY, RISK & ARCHITECTURE only. Look for injection/secret/path-traversal exposure, unsafe effects, broken boundaries, irreversible or hard-to-revert moves, and architectural drift. Ignore style and routine test gaps. Flag anything that warrants sandboxing or human sign-off.",
    },
    {
      id: "arbiter",
      label: "Arbiter verdict",
      kind: "review-turn",
      seat: "arbiter",
      stage: "reviewing",
      needs: ["review-correctness", "review-tests", "review-risk"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
        "findings-correctness",
        "findings-tests",
        "findings-risk",
      ],
      outputs: ["review-decision"],
      instructions:
        "You are the arbiter. Read all three reviewers' findings (correctness, tests, security/risk) plus the diff and validation evidence. De-duplicate, weigh severity against the deterministic evidence (the validation results), and render ONE verdict. APPROVED only if no blocking issue survives scrutiny; otherwise CHANGES_REQUESTED with the consolidated must-fix list. Do not launder a reviewer's confidence - cite the evidence.",
    },
  ],
  complexity: "high",
  capabilities: {
    taskKinds: ["feature", "refactor", "bugfix"],
    strengths: ["security", "risk", "correctness", "tests", "architecture", "review"],
    costClass: "high",
    latencyClass: "high",
    requires: { validation: true },
  },
});

// The built-in **security review panel**: the `panel-review` shape aimed through
// a SECURITY lens (orchestrator-personas.md). Same structure - plan -> architect
// -> implement -> validate, then a 3-lens read-only fan-out + an arbiter join -
// but the three reviewers inspect AUTHZ, SECRETS/EXPOSURE, and INJECTION/UNSAFE
// INPUT instead of the generalist correctness/tests/risk lenses. It is the flow
// the built-in `security` persona prefers, so a risk-tagged task under that
// persona is upgraded here (different persona -> different review lenses) without
// any dynamic flow rewriting - the lenses are declared by the flow, honestly.
export const securityReviewFlow = flowDefinitionSchema.parse({
  id: "security-review",
  version: 1,
  label: "Security review panel",
  description:
    "Plan, architect, implement, and validate, then fan out a 3-lens read-only SECURITY panel (authorization, secrets/exposure, injection & unsafe input) over the real diff and an arbiter join that renders one verdict. The flow the `security` supervisor persona prefers.",
  seats: {
    planner: { label: "Planner", description: "Turns the task into a plan." },
    architect: { label: "Architect", description: "Designs the approach." },
    implementer: { label: "Implementer", description: "Implements the change." },
    reviewer: {
      label: "Reviewer",
      description: "Reviews the diff under one assigned security lens.",
    },
    arbiter: {
      label: "Arbiter",
      description: "Reads every reviewer's findings and renders one verdict.",
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
      outputs: ["plan-handoff"],
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      seat: "architect",
      stage: "architecting",
      needs: ["plan"],
      inputs: ["task-brief", "plan-handoff"],
      outputs: ["architecture-handoff"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      needs: ["architecture"],
      inputs: ["task-brief", "plan-handoff", "architecture-handoff"],
      outputs: ["execution-handoff", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      stage: "executing",
      needs: ["implement"],
      inputs: ["diff"],
      outputs: ["validation"],
      skipWhenReadOnly: true,
    },
    {
      id: "review-authz",
      label: "Review: authentication & authorization",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["validation"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
      ],
      outputs: ["findings-authz"],
      continueOnError: true,
      instructions:
        "Your lens is AUTHENTICATION & AUTHORIZATION only. Hunt for missing/wrong authz checks (unprotected endpoints, privilege escalation, IDOR/object-ownership gaps, tenant/role boundary leaks, open-by-default) AND broken authn (weak/missing login checks, session fixation/handling, insecure cookies/tokens, auth bypass). Ignore style and generic test gaps. Cite file:line evidence.",
    },
    {
      id: "review-secrets",
      label: "Review: secrets & exposure",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["validation"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
      ],
      outputs: ["findings-secrets"],
      continueOnError: true,
      instructions:
        "Your lens is SECRETS & DATA EXPOSURE only. Look for hardcoded credentials/keys/tokens, secrets in logs/errors/artifacts, PII leakage, over-broad responses, missing redaction, insecure storage/transport, and secret-shaped strings added to the diff. Ignore correctness and test coverage. Cite what is exposed and where.",
    },
    {
      id: "review-injection",
      label: "Review: injection & unsafe input",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      needs: ["validation"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
      ],
      outputs: ["findings-injection"],
      continueOnError: true,
      instructions:
        "Your lens is INJECTION, UNSAFE INPUT & WEB-REQUEST SAFETY only. Hunt for SQL/command/path/template injection, SSRF, unsafe deserialization, XSS/output-encoding gaps, CSRF (missing anti-forgery on state-changing requests), CORS misconfiguration (over-broad origins/credentials), unvalidated/untrusted input reaching a sink, and unsafe shell/eval. Ignore style and routine test gaps. Cite the source->sink path with file:line.",
    },
    {
      id: "arbiter",
      label: "Arbiter verdict",
      kind: "review-turn",
      seat: "arbiter",
      stage: "reviewing",
      needs: ["review-authz", "review-secrets", "review-injection"],
      inputs: [
        "task-brief",
        "plan-handoff",
        "architecture-handoff",
        "execution-handoff",
        "validation",
        "findings-authz",
        "findings-secrets",
        "findings-injection",
      ],
      outputs: ["review-decision"],
      instructions:
        "You are the security arbiter. Read all three reviewers' findings (authn/authz, secrets/exposure, injection & web-request safety) plus the diff and validation evidence. De-duplicate, weigh severity against the deterministic evidence, and render ONE verdict. APPROVED only if no exploitable issue survives scrutiny; otherwise CHANGES_REQUESTED with the consolidated must-fix list. Do not launder a reviewer's confidence - cite the evidence. This is a 3-lens review by reviewers, not a SAST/secret/dependency scanner - say so if a class needs tooling you can't run.",
    },
  ],
  complexity: "high",
  capabilities: {
    taskKinds: ["feature", "bugfix", "refactor"],
    strengths: ["security", "authz", "secrets", "injection", "risk", "review"],
    costClass: "high",
    latencyClass: "high",
    requires: { validation: true },
  },
});

// The built-in **per-item analysis pick-up**: the first checklist DAG (Slice 5,
// custom-workflow-dags.md Phase D - "Shape A"). It is the pick-up flow with a
// GRAPH inside the per-item band: for EACH checklist item, two read-only analysts
// study the item in parallel from distinct lenses (risk/impact + test-surface),
// then a single serial implementer writes the item informed by both. "Think in
// parallel, then build", once per item, in one worktree (a commit per item).
//
// Why this shape first: the analysts are read-only `agent-turn`s (not
// review-turns), so the band produces NO arbitration findings - it sidesteps the
// run-global arbitration-ledger collision that a per-item REVIEW panel (Shape B)
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

// The built-in **pick-up (per-item review)** flow (Shape B /
// checklist-dag-shape-b): like pickupAnalysisFlow but the per-item band runs
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

// The built-in **express flow** (A3, proportional-orchestration.md / batch
// P4b): one implementer turn with a diff-floored safety net. Validation is
// change-scoped (B3) and the review step is `skipWhen: "inert_diff"` - it runs
// UNLESS the run's actual diff is strict-prose (.md/.markdown/.txt/.rst) and
// touches no protected path (A2). The skip is recorded evidence; assurance
// then reports `review: skipped_inert_diff` and caps at partially_verified.
// A gate-free "solo" variant was explicitly rejected (adversarial review):
// the back gate must be decided by the diff, never by task text.
export const expressFlow = flowDefinitionSchema.parse({
  id: "express",
  version: 1,
  label: "Express",
  description:
    "One implementer turn for small, low-risk tasks. Validation is scoped to the actual change, and review runs only when the diff demands it - any non-prose or protected file gets a real review turn.",
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
  ],
  complexity: "low",
  capabilities: {
    taskKinds: ["docs", "chore", "tweak", "bugfix"],
    strengths: ["speed", "small-changes"],
    costClass: "low",
    latencyClass: "low",
  },
});

// ── Parameterized example (T11) ──────────────────────────────────────────────
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

// ── Spec-up phase ("Plan" as a CTO) ────────────────────────────────────────────
// Three read-only links in a human-stepped chain (no durable pause, no nested
// runs - see docs/design/spec-up-phase.md). The CTO posture lives in each step's
// `instructions` (the director, v1; a persona `specUpPosture` field is a tracked
// follow-up). None of the steps produce a `diff`, so run-launcher clamps every
// link read-only by construction.
//
// Chain integrity (the load-bearing invariant, asserted by a test): the roadmap
// link resumes the spec-up run at stage "executing", so seedResumedSteps copies the
// output.md of every step BEFORE the first executing step - scope/spec/
// architecture/risks - keyed by the roadmap flow's step ids. Those ids + stages
// MUST match the spec-up flow exactly, or the second link throws at seed time.

// Link 1: intake. Reads the brief, classifies it, emits the structured gap
// questions the consult surface renders as a form. Terminates.
export const specUpIntakeFlow = flowDefinitionSchema.parse({
  id: "spec-up-intake",
  version: 1,
  label: "Spec-up: Intake",
  // Internal phase, not a user-selectable flow - hidden from every picker; the
  // adaptive trigger + consult-submit launch it by id.
  hidden: true,
  description:
    "Spec-up phase link 1 - WRITES NO CODE. The CTO reads the brief and asks the gap questions needed to scope the work (auth? payments? scale? persistence?). Emits a structured questions artifact; the answers seed the spec-up run. Launched by 'Plan'.",
  seats: {
    planner: { label: "CTO (intake)", description: "Reads the brief and asks the scoping questions." },
  },
  steps: [
    {
      id: "intake",
      label: "Intake",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["questions"],
      instructions:
        "You are the CTO doing intake before planning. Produce the GAP QUESTIONS that scope the work - the decisions a vague brief leaves open (sign-in? payments? persistence? scale? deadline? existing system?). For each: a kebab-case id, the question, why it matters (one line), kind 'choice' (2-4 options) or 'text', and a `category` from: scope, users, data, constraints, success, integrations, other. Be thorough; never ask for secret values. DEEP-QUESTIONING: if context already holds the user's prior answers, treat them as settled and ask ONLY follow-ups still open - drill deeper, never repeat answered ones. If no material gap remains, set `coverageComplete: true` with empty `questions`; else `false` with the rest. Emit the questions JSON per the contract.",
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

// Link 2: spec-up. With the answers as context, the CTO scopes the work, writes a
// spec + architecture (incl. a provisioning checklist of env var NAMES) + risks,
// and a reviewer checks completeness against the APPROVED scope (single pass v1 -
// the read-only clamp disables the adaptive loop; the human approves between
// links). Terminates with reviewable draft artifacts.
export const specUpFlow = flowDefinitionSchema.parse({
  id: "spec-up",
  version: 1,
  label: "Spec-up",
  hidden: true,
  description:
    "Spec-up phase link 2 - WRITES NO CODE. The CTO turns the brief + answers into a scope, a spec, an architecture with a provisioning checklist, and a risks register, then a reviewer checks completeness against the approved scope. Produces reviewable spec/architecture/risks drafts. Launched after the intake questions are answered.",
  seats: {
    planner: { label: "CTO (spec-up)", description: "Scopes the work and writes the spec and risks." },
    architect: { label: "Architect", description: "Designs the architecture and provisioning checklist." },
    reviewer: { label: "Reviewer", description: "Checks the spec-up draft for completeness against the approved scope." },
  },
  steps: [
    {
      id: "scope",
      label: "Scope",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["scope"],
      instructions:
        "You are the CTO running spec-up on this work before any code. From the brief and the user's answers, define the SCOPE: what is in, what is explicitly OUT, and your assumptions. Surface unstated requirements the user likely didn't mention (auth, persistence, payments, scale, privacy) - but thorough means surface-then-scope to what the user actually wants, NOT build everything. State which gap questions are now answered and any that remain. Be concrete and decisive.",
    },
    {
      id: "spec",
      label: "Spec",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief", "scope"],
      outputs: ["spec"],
      instructions:
        "As CTO, turn the approved scope into a SPECIFICATION: the capabilities to build, the data model, the key user flows, and acceptance criteria in plain prose. Explain tradeoffs so a non-expert can steer ('you need auth because customers store payment data; here are the options and their costs'). Reference env var NAMES only, never secret values. Stay within the approved scope; flag anything you think is missing as an open question rather than silently expanding.",
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      seat: "architect",
      stage: "architecting",
      inputs: ["task-brief", "scope", "spec"],
      outputs: ["architecture"],
      instructions:
        "As CTO/architect, design the ARCHITECTURE from the spec: components and their responsibilities, the interfaces between them, the chosen stack and why, and a PROVISIONING checklist (services to set up and the env var NAMES to fill in a gitignored .env - never real values). Give 2-3 options for the load-bearing decisions with cost / maintainability tradeoffs. Prefer the simplest design that meets the approved scope.",
    },
    {
      id: "risks",
      label: "Risks",
      kind: "agent-turn",
      seat: "planner",
      stage: "architecting",
      inputs: ["task-brief", "scope", "spec", "architecture"],
      outputs: ["risks"],
      instructions:
        "As CTO, enumerate the RISKS: what is most likely to go wrong, the failure modes, the security and data-privacy concerns, and what is hardest to get right. For each, give a concrete mitigation. Be honest about what this plan does NOT guarantee, and call out where the user must make an informed decision.",
    },
    {
      id: "spec-up-review",
      label: "Review spec-up",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["task-brief", "scope", "spec", "architecture", "risks"],
      outputs: ["findings", "review-decision"],
      instructions:
        "Review the scope, spec, architecture, and risks for COMPLETENESS AGAINST THE APPROVED SCOPE - not against an ideal system. Does the spec cover everything in scope? Are the acceptance criteria checkable? Are there unaddressed risks or unstated requirements WITHIN scope? Decide APPROVED if the spec-up draft is sound and complete for the approved scope, or CHANGES_REQUESTED with the specific gaps. Do not request scope expansion.",
    },
  ],
  complexity: "high",
  capabilities: {
    taskKinds: [],
    strengths: ["planning", "analysis", "architecture"],
    costClass: "medium",
    latencyClass: "medium",
  },
});

// Link 3: roadmap. Resumes the spec-up run (stage "executing"), so scope/spec/
// architecture/risks are seeded as context, and synthesizes them into a
// dependency-aware proposal in the VIBESTRATE_TASK marker format the existing
// proposal parser/accept path consumes. The four seeded steps must mirror the
// spec-up flow's ids + stages exactly (chain integrity).
export const specUpRoadmapFlow = flowDefinitionSchema.parse({
  id: "spec-up-roadmap",
  version: 1,
  label: "Spec-up: Roadmap",
  hidden: true,
  description:
    "Spec-up phase link 3 - WRITES NO CODE. Resumes the approved spec and synthesizes the spec/architecture/risks into an ordered, dependency-aware roadmap proposal (board cards with acceptance criteria and estimates). Review and accept it from the proposals surface. Launched after the spec is approved.",
  seats: {
    planner: { label: "CTO (roadmap)", description: "Synthesizes the approved spec into board cards." },
    architect: { label: "Architect", description: "Seeded architecture context." },
    reviewer: { label: "Reviewer", description: "Seeded review context." },
  },
  steps: [
    {
      id: "scope",
      label: "Scope",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["scope"],
    },
    {
      id: "spec",
      label: "Spec",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief", "scope"],
      outputs: ["spec"],
    },
    {
      id: "architecture",
      label: "Architecture",
      kind: "agent-turn",
      seat: "architect",
      stage: "architecting",
      inputs: ["task-brief", "scope", "spec"],
      outputs: ["architecture"],
    },
    {
      id: "risks",
      label: "Risks",
      kind: "agent-turn",
      seat: "planner",
      stage: "architecting",
      inputs: ["task-brief", "scope", "spec", "architecture"],
      outputs: ["risks"],
    },
    {
      id: "synthesize",
      label: "Synthesize roadmap",
      kind: "agent-turn",
      seat: "planner",
      stage: "executing",
      inputs: ["task-brief", "scope", "spec", "architecture", "risks"],
      outputs: ["roadmap-proposal"],
      instructions:
        "Synthesize the approved scope, spec, architecture, and risks into an ordered, dependency-aware ROADMAP of board cards. Decompose the work to directly-buildable leaves: a trivial brief is one card; a large system is a multi-level tree (auth, data, billing, rendering...). For each card emit a VIBESTRATE_TASK block with TITLE, DESCRIPTION, PRIORITY, DEPENDS_ON (titles of blocking cards), ACCEPTANCE (the prose acceptance criteria), and EST (a rough size like S / M / L). Order so dependencies come first; never create a cycle.",
    },
  ],
  complexity: "medium",
  capabilities: {
    taskKinds: [],
    strengths: ["planning", "analysis"],
    costClass: "medium",
    latencyClass: "medium",
  },
});

export const builtinFlows: readonly FlowDefinition[] = [
  defaultFlow,
  planOnlyFlow,
  qualityArbitrationFlow,
  pickupFlow,
  reviewPanelFlow,
  pickupAnalysisFlow,
  pickupReviewFlow,
  securityReviewFlow,
  expressFlow,
  scaffoldFlow,
  specUpIntakeFlow,
  specUpFlow,
  specUpRoadmapFlow,
];

export function findBuiltinFlow(id: string): FlowDefinition | null {
  return builtinFlows.find((flow) => flow.id === id) ?? null;
}
