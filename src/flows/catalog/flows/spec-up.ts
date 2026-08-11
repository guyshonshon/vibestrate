// The hidden three-link spec chain. spec-up-roadmap's leading step ids must
// mirror spec-up's exactly: the roadmap link resumes the spec-up run and seeds
// artifacts BY STEP ID, so a renamed id throws at seed time.
//
// Parsed through flowDefinitionSchema at module load, so a malformed builtin
// fails at IMPORT rather than at run time. See ../builtin-flows.ts for the
// catalog-wide editing rules.

import {
  flowDefinitionSchema,
} from "../../schemas/flow-schema.js";

// ── Spec-up phase ("Plan" as a CTO) ────────────────────────────────────────────
// Three read-only links in a human-stepped chain (no durable pause, no nested
// runs). The CTO posture lives in each step's `instructions` (the director, v1;
// a persona `specUpPosture` field is a tracked follow-up). None of the steps
// produce a `diff`, so run-launcher clamps every link read-only by construction.
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
