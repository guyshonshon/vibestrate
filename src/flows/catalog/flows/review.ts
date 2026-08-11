// Review-heavy flows. panel-review and security-review are graph flows - a
// read-only lens fan-out joined by an arbiter; quality-arbitration is the
// linear builder-vs-challenger exchange.
//
// Parsed through flowDefinitionSchema at module load, so a malformed builtin
// fails at IMPORT rather than at run time. See ../builtin-flows.ts for the
// catalog-wide editing rules.

import {
  flowDefinitionSchema,
} from "../../schemas/flow-schema.js";

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

// The built-in **late review panel**: the first graph (DAG) flow. It runs the
// standard plan -> architect -> implement -> validate spine, then fans out into
// THREE read-only reviewers that inspect the *same* real diff + validation
// evidence from distinct lenses (correctness, tests, security/risk),
// concurrently, and an arbiter join reads all three and renders one verdict.
//
// Why a panel: late review over a concrete diff catches more than a single
// reviewer, and the lenses are deliberately distinct (not the same prompt 3x).
// The reviewers all sit in the read-only `reviewer` seat (one role, three
// lenses via per-step `instructions`) and write DISTINCT output tokens, so the
// frontier scheduler can run them in parallel with no worktree collision - the
// read-only-ness is hard-enforced at resolve time. The reviewers are
// `continueOnError`: if one lens's provider hard-fails, the run is not
// sunk - that step is marked failed + recorded, and the arbiter still renders a
// verdict from the surviving lenses (the brief tells it which lens is missing). There is no fix loop or
// second validation here: graph flows can't yet combine with the adaptive loop
// (still deferred), so the panel SURFACES a verdict + findings; a
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
// a SECURITY lens. Same structure - plan -> architect -> implement -> validate,
// then a 3-lens read-only fan-out + an arbiter join -
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
