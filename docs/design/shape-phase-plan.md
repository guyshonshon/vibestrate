# Shape phase - implementation plan

Status: **v1 IMPLEMENTED (2026-06-19), branch `feat/shape-phase`** (uncommitted
pending review/merge). The **what/why** lives in [`shape-phase.md`](./shape-phase.md);
this is the **how/when** - a sequenced, dependency-ordered build plan. Produced
with the `architecture-design` methodology (ground in code, exists/proposed/
foundation, adversarial review, phase by dependency).

## Implementation status (v1)

Landed green (typecheck + build + 11 new tests + full suite): M0 (scout
verified the keystone), M1 (chain wiring: `planning` added to the HTTP
`fromStage` enum + `contextSources` on `spawnRunBody`; the keystone
`src/shape/shape-chain.ts` + `src/server/routes/shape.ts` + `vibe shape` CLI),
M2 (the `shape-intake`/`shape`/`shape-roadmap` flows + a `questions` structured
contract; the CTO posture rides each step's `instructions`), M3 (spec/
architecture/risks/provisioning are the steps' markdown `output.md`, reviewable
via the existing artifact viewer), M4 (card fields `acceptanceCriteria` + `est`
threaded through the proposal parser/service; the synthesis -> proposal bridge),
M5 (a "Plan" nav tab -> a functional `/shape` page: start + answer the gap form;
3 run-control UI proposals in a gallery).

Deliberate v1 deltas from the plan (Tier-2 review, 2026-06-19):
- **Completeness loop dropped** (single-pass `shape-review`). The adaptive loop
  is hard-gated on `!readOnly`; the narrow `loopBodyWriteFree` fix was shelved
  because it amplifies the "reviewer judges its own prose" risk for little v1
  value. Human approval between chain links is the iterate path.
- **`shapingPosture` persona field deferred.** The CTO director is delivered via
  per-step `instructions` (reaches the prompt today) instead of net-new persona
  prompt-injection wiring.
- **Artifact edit/approve + the dependency-edge graph editor are partial.**
  Artifacts are reviewable (read-only viewer); inline edit/approve and a DAG
  edge editor remain net-new UI (the plan + reviewer both defer the editor).
- **intake -> shape uses a fresh launch with the answers as a `file`
  contextSource**, not `resumeFrom`, to avoid the single-step seeding coupling;
  `resumeFrom` is used only for shape -> roadmap (seeded at stage `executing`),
  guarded by a chain-integrity test.

## Scoreboard (the honest cost)

| Component | State | Evidence |
|---|---|---|
| Read-only clamp for no-write flows | EXISTS (shipped) | `run-launcher.ts:279` + test, on `feat/mc-rebuild` (`3795c668`) |
| `plan-only` flow (substrate) | EXISTS (shipped) | `builtin-flows.ts`, `feat/mc-rebuild` |
| Roadmap card DAG + deps | EXISTS | `roadmap/dependency-graph.ts`, `proposal-service.ts:331` |
| Personas / roles / crews / skills | EXISTS | persona schema, `role-schema.ts`, skills/`runtimeSkills` |
| Rewind (`resumeFrom`, human-vouched) | EXISTS | `orchestrator.ts:1779` `seedResumedSteps` |
| Consult / assist primitive (free-form) | EXISTS | `assist-primitive.md`, ConsultPage, the orb |
| contextSources (inject spec/arch) | EXISTS | run spec |
| Shape run-chain + clarify-via-consult | PROPOSED | this plan |
| Specialists (named persona+skill binding) | PROPOSED | M5 |
| Roadmap synthesis + dependency-edit UI | PROPOSED | M4 (DAG backend exists; UI net-new) |
| Durable suspend/resume | FOUNDATION | no atomic writes, in-memory control state |
| Runtime nested runs (recursion) | FOUNDATION | runs are flat; no `parentRunId` |
| Machine-checkable acceptance criteria | FOUNDATION | validation runs shell commands only |

**Build dependency:** the Shape build assumes the `mc-rebuild` substrate (the
read-only clamp + `plan-only` flow) is merged to `main` first. Rebase the build
onto a base that contains it.

## The two killers (gate every milestone on these)

- **Scope explosion** - the clarify round + an explicit out-of-scope list in the
  spec + the persona's ambition posture scope the work; the completeness critic
  checks coverage of the *approved scope*, never "what else could we add".
- **Termination** - v1 done = LLM review verdict + `maxIterations` + human
  approval (honest: NOT machine-checked; that is foundation F3). No acceptance
  criteria, no roadmap card.

## Build sequence

### M0 - Scout (no code; verify the keystone assumption)
The whole plan rests on one unproven thing: that a consult's answers can seed the
next run. Verify before building.
- Confirm `seedResumedSteps`/`resumeFrom` (`orchestrator.ts:1779`) can fork a run
  from a prior run's artifacts AND accept fresh user answers as context
  (`contextSources` or brief).
- Confirm the consult/assist primitive can be made structured + run-bound.
- **Gate:** if answers can't be carried forward, redesign the chain handoff
  before M1. Output: a written finding.

### M1 - Consult keystone: structured + run-bound (the one new primitive)
- Extend consult from free-form chat to ALSO render structured questions
  (`[{id, question, kind, options?, why}]` -> `answers`) bound to a run, where
  **submit advances the work** (launches the next run-chain link). Keep free-form.
- Touchpoints: consult payload + API route + UI form; the orb/ConsultPage surface.
- Acceptance: a run emits questions -> user answers in the consult surface ->
  submitting launches a follow-up run seeded with the answers; free-form still works.
- **Tier-2 review** (new primitive that launches runs).

### M2 - The Shape run-chain + seats + CTO persona posture
- Three links glued by `resumeFrom`: **intake** (emits questions) -> *consult* ->
  **shape** (scope -> spec[+acceptance criteria] -> architecture[+provisioning
  checklist] -> risks -> shape-review loop) -> *approve* -> **roadmap**.
- Reuse seats `planner`/`architect`/`reviewer` (no new crew seats). Add
  `shapingPosture` to the persona; inject it into the shape agents' prompts so
  the "CTO" actually drives. Loop `{from: scope, to: shape-review}` (schema-valid).
- Acceptance: a thorough brief -> read-only spec+arch+risks draft with a clarify
  round and a bounded completeness loop.

### M3 - Structured artifacts + reviewable UI
- `spec.md` / `architecture.md` / `risks.md` / `provisioning.md` as first-class
  outputs, surfaced as reviewable docs; user reviews/edits/approves; approval
  gates the roadmap link.

### M4 - Roadmap synthesis + card fields + dependency UI
- The roadmap link synthesizes the approved spec into board cards (the
  decomposition tree - adaptive depth lives in this artifact, not in nested runs).
- New card fields: `acceptanceCriteria` (prose), `est`. **Dependency view/edit
  UI** is net-new (the DAG backend exists; today the board shows counts only, no
  edit, no ordering - per UI<->CLI parity this needs a real surface).
- Touchpoints: `roadmap-types.ts`, the synthesis agent, BoardPage/TaskDetailPage.

### M5 - Specialists + adaptive-depth trigger + wire "Plan"
- **Specialist** = named binding `{persona + skill bundle + model + concern tags}`
  over existing personas/skills/profiles (no new subsystem, no RAG). A
  concern-scan step proposes specialists (user overrides); cross-cutting concerns
  (security/scale/cost/...) run as a default review checklist; a dominant concern
  elevates to a dedicated specialist seat.
- **Adaptive-depth trigger:** the supervisor judges leaf-vs-shape at entry - a
  trivial brief executes directly (today's behavior), a complex one routes to
  Shape. Wire the run-control "Plan" affordance to launch the Shape chain;
  absorb the minimal `plan-only` flow.
- **Tier-2 review** (specialist selection touches run config + model choice).

**Sequence:** M0 -> M1 -> M2 -> (M3, M4 may overlap after M2) -> M5.

## Foundations track (deferred; not on the v1 critical path)

Each is a separate epic with a mandatory Tier-2 systems/security review.

- **F1 - Durable suspend/resume.** Atomic-write layer (`utils/fs`, `json`,
  `state-machine`) + ordered last-completed-phase marker + checkpoint the
  in-memory control state (`loopIteration` `orchestrator.ts:2765`, budget acks) +
  re-entrant run-walk. Unlocks brief-and-walk-away (one paused run vs the chain).
- **F2 - Runtime nested runs.** Parent/child run relationship +
  orchestrator-of-orchestrators + tree-scoped budget. Unlocks per-node runtime
  recursion for huge trees.
- **F3 - Machine-checkable acceptance criteria.** Tie criteria to the validation
  runner so "done" is a real gate, not an LLM verdict (lands with Phase-1 Execute).

## Open decisions (settle during the relevant milestone)

- Artifact format: markdown (human) + structured roadmap (machine) - probably both.
- Where artifacts live: run dir vs also saved to repo (`.vibestrate/shape/`).
- Clarify rounds: one (v1) vs bounded re-clarify when the spec surfaces a blocker.
- Specialist registry shape: config file vs derived from personas+skills tags.

## Review trail

Two adversarial Opus-4.8 reviews (2026-06-19) shaped this:
1. Found the durable-pause fatal flaw (the in-memory poll loop) + a read-only
   safety hole in the shipped `plan-only` flow (since fixed by the clamp).
2. Confirmed runs are flat (no nested runs) and control state is not checkpointed
   - so recursion is artifact-shaped (one run emits the tree), not runtime; and
   durable resume is a foundation, not a quick win.

Beyond v1: Execute (run the cards) -> Provision (assisted local setup) -> Deploy
(gated config-gen + local-secret run). See `shape-phase.md` for those phases.
