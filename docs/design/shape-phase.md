# Shape phase ("Plan" as a CTO)

Status: proposed, **revised after an adversarial review** (2026-06-19). The
review found a fatal flaw in the first draft (it assumed durable pause/resume
exists - it does not) and several concrete errors. This version corrects them.
Supersedes the minimal `plan-only` flow as the meaning of "Plan".

## Context

Today "Plan" means "draft a plan for a code change" (the `plan-only` flow). That
is the minimal version of the wrong thing.

What we want: "Plan" is the **discovery -> spec -> architecture -> roadmap** work
a CTO does *before* code. Given a vague brief ("a mini ecommerce store") it
surfaces the unstated (auth, payments, shipping, scale), **asks the user the gap
questions**, scopes explicitly, produces a spec + architecture + risks +
provisioning checklist, and synthesizes a **reviewable, executable roadmap**.

Vibestrate is for any size of task. "Keep it small" is not the goal. The
discipline: thorough means *surface everything, then scope to what the user
actually wants* - not build everything. The gap-questions are the scoping.

## The core model: adaptive depth lives in the OUTPUT, not the runtime

Two independent reviews (2026-06-19) established what the architecture does and
does not support. The honest model:

**The hierarchy is in the artifact, not in runs spawning runs.** Vibestrate
runs are flat and independent - there is no parent/child run, no
orchestrator-of-orchestrators (`run-launcher.ts`, `detached-run.ts`; no
`parentRunId` anywhere). So "recursion" is NOT each node becoming its own run.
It is: **one smart planning run emits a multi-level decomposition tree as
cards**, and the agent judges "leaf or decompose?" *inside that tree*.

- "add logs to xyz when abc is dispatched" -> the agent emits one leaf card.
- "multi-tenant invoice system" -> the agent emits a 3-level tree of cards
  (auth, billing, tenancy, rendering, ...), each leaf a directly-buildable unit.

"The supervisor knows when and when not to" is the planning agent's judgment
*in the artifact* - a prompt/agent capability, fully achievable on a flat run.
**Dynamic triggering** is a cheap upfront judgment ("does this even need
planning?"). The user can override depth and **collapse / expand** nodes - the
tree is reviewable. The card DAG already holds it (`dependency-graph.ts`).

Real guards (the only ones that exist): a hard **max-depth** and the
**reviewable tree**. "Monotonic shrink" was dropped - there is no notion of node
"size" to check it against; it was not a mechanical guard. Per-tree budget is
not available either (spend is a global daily cap, `spend-cap-service.ts:21`);
runaway fan-out is bounded by max-depth + the daily cap, not a tree envelope.

## Durable suspend/resume and runtime recursion are FOUNDATIONS, not v1

The first draft claimed durable resume was "tractable now". The second review
disproved it against the code. The honest position:

- **"Each phase writes an artifact" does NOT mean "the run is checkpointed."**
  Artifacts capture *outputs*; the run's *control state* lives in memory:
  `loopIteration` is a local variable (`orchestrator.ts:2765`),
  `reviewLoopCount` is only written at the end (`:4039`), `budgetCeilingAcknowledged`
  / overrides are instance fields. Resume off artifacts alone resets the loop
  counter -> **termination silently re-arms** (loops forever / overspends).
- **No atomic writes.** `ArtifactStore`/`state.json`/event-log are bare
  `fs.writeFile`/`appendFile` (`utils/fs.ts:9`). A mid-write kill leaves a
  half-artifact that existence-driven auto-skip would trust. The whole fs layer
  needs an atomic primitive it lacks.
- **Existing resume is human-vouched rewind, not auto-skip.** `seedResumedSteps`
  (`orchestrator.ts:1779`) skips by index because a human asserts the source
  stage is done - that voucher is the safety. Auto-skip removes it.

So **durable suspend/resume = a real foundation**: atomic durable writes + an
ordered last-completed-phase marker + checkpointing in-memory control state +
making the 1300-line flow-walk re-entrant from a persisted cursor. Weeks, not
an afternoon. **Runtime recursion** (a node spawning child runs) is a second
foundation: parent/child runs + an orchestrator-of-orchestrators + a tree-scoped
budget. Both are tracked future capabilities; neither is a prerequisite for the
hierarchical-planning experience above.

## What is buildable today: the run-chain

Shape ships now as a **chain of fresh, human-initiated runs** glued by the
existing human-vouched `resumeFrom` rewind (each link seeds upstream by index
from a source the human approved). A flat planning run emits the decomposition
tree as cards; the human steps between links. No durable pause, no nested runs,
no atomic-write rewrite. The M0-M5 milestones below stand. The foundations
(durable resume, runtime recursion) are deliberate later investments, made when
scale and the brief-and-walk-away UX demand them - not now.

## The three risks that decide whether this works

1. **The LLM CTO is confidently wrong and the user cannot catch it.** This is the
   load-bearing risk (the review's sharpest point). The premise itself - a user
   who "doesn't know there's authentication" - means the human-approval gate is
   weak: you cannot approve what you cannot judge. Mitigation is *positioning*,
   not a prompt (see "Honest positioning").
2. **Scope explosion.** A CTO that proposes auth + payments + multi-tenant + i18n
   for "a mini store" wastes more money than under-building. The clarify
   questions scope it; the spec records explicit out-of-scope; the completeness
   critic is pointed at the **approved scope**, never "what else could we add?"
3. **Termination.** "Complete" has no objective done. v1 termination = the LLM
   review verdict + `maxIterations` + human approval (the existing mechanism).
   It is NOT machine-checked - see the honesty note below.

## Honest positioning (what v1 actually is)

Shape v1 is an **educated draft + a scope-decision tool**, not a novice
autopilot. Its first job is to make the user an *informed* decision-maker: it
**explains the tradeoffs** ("you need auth because customers store payment data;
here are 3 options, costs differ") so a non-expert can decide *scope and
direction* - which they genuinely can judge. Technical *correctness* is not
guarded by the human's approval; it is guarded downstream by execution-time
review and validation (Phase 1), not by a user nodding at an architecture doc
they cannot assess. The spec agent's job is "be right enough, and make the user
smart enough to steer", not "be right".

## Composition: what exists vs what is new

| Need | Reality |
|---|---|
| Read-only safety | EXISTS - a no-diff flow is auto-clamped read-only (`run-launcher.ts:279`). |
| Card dependencies / DAG | EXISTS - `Task.dependencies`, `dependency-graph.ts` (cycle detection), dependency-ordered accept (`proposal-service.ts:331`). |
| Multi-step shaping | EXISTS - flows + seats + loops + approval-gates. |
| Artifact re-seeding between runs | EXISTS - Rewind / `resumeFrom` forks a new run seeded from a prior run's artifacts. |
| Spec/arch into the build | EXISTS - contextSources. |
| **Durable pause/resume** | **DOES NOT EXIST.** Approval gates are an in-memory `while(true)` poll loop on a live process (`approval-service.ts:161-198`); `run-entry.ts` is one-shot -> `process.exit`; resuming writes a file, re-spawns nothing. A paused run = a held-open process; reboot orphans it. |
| Editable roadmap UI | DOES NOT EXIST - the board shows blocked-by/unlocks as counts only, no dependency edit, no manual ordering (DnD deliberately omitted). Net-new per UI<->CLI parity. |
| Card `acceptanceCriteria` / `est` fields | DO NOT EXIST - 0 hits; new fields. |

## The interaction: a chain of short runs, NOT one paused run

Because durable pause does not exist, the Shape phase is a **chain of short,
terminating runs** connected by Rewind/`resumeFrom`. No held-open process, no
new `step.kind`, survives reboots.

1. **Run 1 (intake):** read brief -> classify -> emit a structured `questions`
   artifact. Terminates.
2. *UI: the questions render as a form; the user answers.*
3. **Run 2 (shape):** `resumeFrom(run 1)` + the answers injected as context ->
   scope -> spec -> architecture (+ provisioning checklist) -> risks ->
   shape-review (completeness loop). Terminates with the draft artifacts.
4. *UI: the user reviews / edits / approves the spec + architecture.*
5. **Run 3 (roadmap):** `resumeFrom(run 2)` -> synthesize the approved spec into
   ordered, dependency-aware board cards. Terminates.

Each run produces no diff, so each is auto-clamped read-only. The one mechanism
to verify before building (the scout): that `resumeFrom` can carry the new
*answers* forward as context (Rewind re-seeds prior artifacts; passing fresh
user input alongside is the wiring question).

### The shape flow (run 2), corrected

Reuses existing seats (`planner` as shaper, `architect`, `reviewer`); no new crew
seats. Loop direction fixed.

| # | step | kind | seat |
|---|---|---|---|
| 1 | scope | agent-turn | planner |
| 2 | spec | agent-turn | planner |
| 3 | architecture | agent-turn | architect |
| 4 | risks | agent-turn | planner |
| 5 | shape-review | review-turn | reviewer |

Loop: `{ from: scope, to: shape-review, decisionStep: shape-review,
maxIterations: N }` (`from` precedes `to`, as the schema requires; loop XOR dag;
decisionStep is a review-turn). The critic checks coverage of the **approved
scope**, not an ideal system.

## Persona as director (the "CTO")

Today persona = metadata. For Shape it drives the agent prompts: the persona's
shaping posture is injected into intake/scope/spec/architecture ("You are the
CTO; prioritize scale, cost, maintainability, security; surface unstated
requirements"). v1 = a `shapingPosture` field + prompt injection; no deeper
schema change. The supervisor chooser (moved to the run summary) selects it.

## Termination, honestly

v1 does not have machine-checkable acceptance criteria. Criteria are
LLM-authored prose; the loop terminates on the LLM review verdict + maxIterations
+ human approval - the same mechanism every flow uses today. Do not imply they
hook into the validation runner (that only runs shell commands). Turning
acceptance criteria into executable gates is a **Phase 1** goal (when cards
build and validate), not a v1 guarantee.

## Safety model

Local-only, never phones home - but the CLI providers transmit prompts
externally. So the real invariant is **secret values never enter an agent prompt
or artifact**: the provisioning checklist tells the user to put keys in a
gitignored `.env`; agents reference env var *names*, never values; the future
deploy phase runs `wrangler deploy` as a local shell command that reads `.env`
directly. Under that line, gated config-generation + local-command deploy does
not violate the no-secrets invariant. Autonomous deploy is out of scope.

## Specialists (named bindings, no RAG)

A **specialist** = a named binding of `{ persona posture + skill bundle +
recommended model + concern tags }` over the existing personas/skills/profiles -
not a new subsystem. The supervisor **proposes** specialists per task (a
concern-scan step in Shape); the user can override. Cross-cutting concerns
(security, scale, cost, a11y, data-privacy, compliance) run as a **default
review checklist**; a concern that dominates is elevated to a dedicated
specialist seat in the architecture/review steps.

**No RAG layer.** Domain expertise is curated **skills** + the model's latent
knowledge, not retrieval. Rationale: (1) models already hold general
best-practices - the specialist focuses that, it does not retrieve it; (2) a
hand-authored skill is higher-signal than chunks from a generic corpus, and bad
retrieval poisons a plan; (3) RAG is a subsystem that fights the local-only /
minimal-deps posture. The one place retrieval could later earn its keep is the
user's OWN large codebase - already handled by `contextSources` + codebase-watch
(injection), and a separate concern from specialist knowledge.

## Supervisor Consult / Choose (the human channel)

Every human-in-the-loop moment - clarify questions, specialist choice, spec
decisions, ad-hoc "what do you think?" - surfaces through ONE channel: the
existing consult primitive (the sanctioned "Ask the supervisor" orb + consult
surface), made contextual wherever a decision is needed.

The consult keeps its **free-form** mode (talk to the supervisor about the
project, ask anything) AND gains a **structured + run-bound** mode - render
questions with choices, and submitting **advances the work** (launches the next
run-chain link). Both modes, one surface. That structured extension is the
keystone: it is the I/O for the whole Shape phase, it removes the need for a
bespoke clarify form, and because the consult is the human step *between*
run-chain links (not a mid-run block), it keeps the design off durable pause.

## Phased roadmap

- Phase 0 - Shape (this doc, v1): run-chain producing spec/arch/risks + a
  reviewable, dependency-aware roadmap. No execution/deploy.
- Phase 1 - Execute: run the approved cards, spec/arch as context, supervisor
  monitoring, loops per card. Acceptance criteria become executable here.
- Phase 2 - Provision (assisted local setup).
- Phase 3 - Deploy (gated, config-gen + local-run, Tier-2 security review).

## Build milestones (v1, re-scoped)

- M0 (scout) - verify `resumeFrom` can carry forward fresh user answers as
  context; confirm the run-chain mechanics before any build.
- M1 - the run-chain + answer-form UI: intake-run emits questions -> UI form ->
  launches the shape-run via `resumeFrom` + answers-as-context. (Replaces the
  draft's "durable pause" - which was the fatal flaw.)
- M2 - the shape flow + reuse seats + a CTO persona shaping-posture.
- M3 - structured artifacts (spec/arch/risks/provisioning) + reviewable UI.
- M4 - card fields (`acceptanceCriteria` prose, `est`) + a dependency view/edit
  UI (net-new).
- M5 - wire "Plan" in the run-control to launch the Shape chain; absorb
  `plan-only`.

## Future capability (tracked, not v1)

**Durable pause/resume** - the orchestrator's first real checkpoint + re-spawn
from persisted state. Would let Shape be one continuous "brief it and come back"
run instead of a chain, and would make *every* pause (approval gates included)
survive process death. Bigger build; benefits the whole product. Decide
separately once the run-chain Shape proves the value.

## Open decisions (non-blocking)

- artifact format: markdown (human, diffable) + structured roadmap (machine).
- where artifacts live: run dir vs also saved to repo (`.vibestrate/shape/`).
- clarify rounds: one (v1) vs the shape-run routing back to a second intake-run
  when it surfaces a blocking unknown (bounded).

## Review trail

- Adversarial review (2026-06-19) found the durable-pause fatal flaw + issues
  2-7 above, cited to `approval-service.ts:161`, `run-entry.ts:46`,
  `validation-runner.ts:130`, `review-parser.ts:38`, `flow-schema.ts:564`,
  `init-template.ts:225`, `dependency-graph.ts`, `proposal-service.ts:331`,
  `orchestrator.ts:1226`.
- Related: `assist-primitive.md`, `orchestrator-personas.md`,
  `pickup-execution.md`.
