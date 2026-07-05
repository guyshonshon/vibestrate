# Supervisor Judgment v2 - measured complexity -> crew + flow, minimalism, learning

Status: proposed 2026-07-05. Grounded in code; tags [evidence]/[inference]/[guess].

## Context - the real goal

Today the supervisor already auto-picks the **flow** for a task, but by a shallow
signal: `classifyTaskRisk` [evidence: `personas.ts:179`] substring-matches the
task TEXT against a persona's `riskSignals`, and `selectWorkflow` upgrades a light
flow to the persona's `prefersFlows[0]` when a signal hits, upgrade-only
[evidence: `select-workflow.ts:173,344,465`]. It never sizes the run to the actual
**project** (its design, open work, existing code), and it never picks the
**crew** - every run uses `defaultCrew` [evidence: `types.ts:133` "null =
project.defaultCrew"; no per-task crew selector exists].

The owner wants the supervisor to: (1) **measure** how complex a task is relative
to this project, (2) auto-select **both crew and flow** proportional to that,
(3) prefer the **minimal** solution (the "ponytail" YAGNI ruleset), and
(4) eventually **learn** from outcomes. The honest reframe: (1)-(3) are a
deterministic enrichment of machinery that already exists; (4) is a new
subsystem, not a heuristic.

## What exists vs proposed vs foundation

| Component | State | Evidence / note |
|---|---|---|
| Flow auto-select (risk-signal -> prefersFlows, upgrade-only) | **EXISTS** | `select-workflow.ts:173,385` |
| Task-text risk classifier (substring keywords) | **EXISTS** | `classifyTaskRisk` `personas.ts:179` |
| Flow weight class (low/medium/high) + rank | **EXISTS** | `flow-complexity.ts:23`, `select-workflow.ts:289` |
| Personas: `riskSignals`, `prefersFlows`, `prefersPosture` | **EXISTS** | `personas.ts` |
| Deterministic effort band from task text | **EXISTS - reconcile, don't reinvent** | `classifyEffort` `effort-heuristic.ts` (word-count buckets + keyword lists; the M0 precedent) |
| Crew auto-select (LLM picks `crewId`, validated, consumed by launchers) | **EXISTS behind `--select`** | `select-workflow.ts:102-111,243`; `run-launcher.ts:338`; `run.ts:279`. What is missing: a *deterministic band* driving it, and it on the *plain* path |
| Project-state digest | **EXISTS but does NOT expose the wanted signals** | `project-state-digest.ts:32` renders a *ledger* brief (shipped/intents/residuals/mentions/decisions/flags) from `project-ledger.ts`; reads no TODO.md, no design dirs, no provider/skill counts |
| Crew presets (Fast/Thorough/Cheap/Local) | **EXISTS but opt-in installs** | a fresh project has only `defaultCrew` (`config-schema.ts:605`); `planPreset` returns `ok:false` when the provider can't back a tier - so a band->preset map often has nothing to map to |
| `measureTaskComplexity()` band from task-text + project-state | **PARTLY FOUNDATION** | reconciles with `classifyEffort` AND needs a NEW structured project-signal reader (TODO/design/ledger) - not "a pure fn" |
| Band-driven crew auto-select | **PROPOSED (behind `--select` only)** | never silent on plain runs - a crew switch changes provider/model/cost |
| Minimalism posture (ponytail YAGNI) as a default skill / reviewer lens | **PROPOSED** | see ponytail note below |
| "Why Auto picked this crew+flow" surfaced in the composer | **PROPOSED** | transparency |
| **Learning from run outcomes** (persisted outcome signal + store + tuning loop) | **FOUNDATION (missing)** | needs an outcome-capture subsystem + data; NOT a score |

## The risks that decide success

- **Scope explosion.** Do NOT build an ML complexity model. A deterministic,
  explainable band (low/medium/high, reusing the existing `FlowComplexity` rank)
  from a handful of signals is the whole of phases M0-M1.
- **Termination.** "Supervisor learns until optimal" has no exit condition. Bound
  it: the learner only nudges the band->crew/flow mapping WITHIN the existing
  upgrade-only rails; the owner override always wins; and a run always resolves a
  valid crew+flow with zero history. Learning is a bounded nudge, not a search.
- **Signal quality [riskiest unknown, inference].** A bad complexity signal
  mis-sizes every run. The pre-run signal is weak by nature - before any code is
  written, all we have is the task text + project state, not the real diff.
  Failure mode: the picker keys off noise (task-string length) and under-sizes a
  genuinely hard task. Mitigations: keep it **upgrade-only** (never downsize a
  risk-tagged task), owner override, and **surface the measured band + reason** so
  a wrong pick is visible and correctable - which is exactly why M0 ships the
  measure as informational-only first.

## The design

- **`measureTaskComplexity(task, projectState)` -> { band: low|medium|high, reasons: string[] }`**,
  pure and explainable. Signals: task-text risk hits (reuse `classifyTaskRisk`);
  scope words (refactor/migrate/rewrite/across); project-state signals from the
  existing digest (open roadmap/TODO count, whether the task names a design-doc or
  a broad area, provider/skill/crew counts); target-file breadth when the task
  names files. Each signal contributes a reason string; the band is a bounded
  combination. Never a black box - every band comes with its reasons.
- **Proportional selection.** Extend the existing selection path so the band maps
  to a crew preset (low -> Fast/Cheap, high/risky -> Thorough/panel) AND informs
  the flow pick, still upgrade-only and owner-overridable. Flow selection already
  exists; this adds the crew axis and the project-state input.
- **Minimalism posture (ponytail).** A built-in default skill injecting the YAGNI
  decision-ladder into builder agents, plus (phase M2) a `minimalism` reviewer
  lens so the reviewer asks "could this be smaller / already exist?" Adopt the
  approach (a public principle); credit ponytail; do not vendor its plugin.
- **Transparency.** The run composer's "Auto" shows the measured band + the
  reasons + the resulting crew+flow, so the owner sees WHY and can override.

## Build sequencing (dependency-ordered, revised after review)

- **M2 FIRST - minimalism (ponytail), decoupled.** The review's key sequencing
  point: minimalism is INDEPENDENT of the complexity work and the most shippable,
  lowest-risk, highest-value piece - it is the "utilize ponytail" ask. Ship a
  built-in default skill injecting the YAGNI decision-ladder into builder agents;
  then optionally a `minimalism` reviewer lens (touches the closed lens vocab).
  Does not depend on M0/M1. Do this first.
- **M0 (scout - the un-proven assumption).** Ship `measureTaskComplexity()`
  INFORMATIONAL-ONLY (surface the band + reasons in the composer, drive nothing).
  Honest cost: (a) reconcile with the existing `classifyEffort`, do NOT duplicate
  it; (b) build a new structured project-signal reader (TODO/design/ledger counts)
  - the digest does not expose these; (c) the composer surface. Proves the signal
  correlates with reality before it changes any run.
- **M1 (only if M0's signal proves useful).** Let the band drive crew/flow
  selection **behind the existing `--select` opt-in, never on the plain path** - a
  crew switch changes provider/model/cost silently, so it must stay opt-in.
  Guard the band->preset map to installed crews only (fall back to default, like
  `--select` already does). Define explicit PRECEDENCE across the four existing
  mechanisms: `forced` flow > `--select` LLM pick > persona risk-upgrade >
  band-upgrade > `maybeSizeToExpress` downsize. This reconciliation is the real
  M1 cost, not "add a crew axis."
- **M3 - "learning": likely INFEASIBLE at single-user volume; do not build on
  spec.** The outcome label (rejected / N loops / reverted) is confounded (bad
  task vs bad pick, no counterfactual), and (band x crew x flow) is ~30-60 cells
  against single-digit runs/day - statistically dead on arrival. Revisit ONLY if
  run volume or a shared/global outcome store changes the math. Upgrade-only +
  an upward-only nudge also converges to max spend, so a naive learner is a cost
  leak. Treat as research, not roadmap.

## Open decisions

1. Signal weighting (task-text vs project-state) - deliberately deferred to the
   M0 informational scout, so we tune against real tasks not a guess.
2. Minimalism home: default skill only, or skill + reviewer lens (the ponytail
   A/B fork).
3. Learning scope: per-project vs global outcome store.

## Review trail

Adversarial review (Opus 4.8, fresh context, verified every cite against code),
2026-07-05. Findings accepted in full; this doc was revised from them:

- **Crew auto-select already EXISTS** behind `--select` (LLM picks `crewId`,
  validated `select-workflow.ts:243`, consumed by `run-launcher.ts:338` +
  `run.ts:279`). The v1 doc's "crew is never auto-selected" was false. Fixed.
- **The project-state digest does NOT expose** the open-TODO/design-doc/provider
  signals the design named - it's a rendered ledger brief. So M0's signals are a
  new extractor, not reuse. Fixed (mis-costing removed).
- **`classifyEffort` already is the deterministic-band precedent** - M0 must
  reconcile, not reinvent. Added.
- **Upgrade-only + upward-only learner converges to max spend** - a cost leak.
  M3 reframed.
- **Crew switch blast radius >> flow** (provider/model/cost) and presets are
  opt-in (nothing to map to on a default project) - M1 gated behind `--select`,
  never the plain path, with a precedence rule across the four existing selectors.
- **M3 learner statistically doomed at single-user volume** - reframed from
  "later foundation" to "likely infeasible; research not roadmap."
- **M2 (minimalism) is independent** - resequenced to FIRST.
