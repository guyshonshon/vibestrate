# Task Lifecycle: honest states, resumability, legible routing

Status: proposed (2026-06-21), pre adversarial-review

## Context (the real goal, not the literal ask)

A run/task must have an honest, legible lifecycle:

- Terminal: **finalized** (done) or **aborted** (stopped, gone).
- A first-class **"awaiting your input"** state that is *recognizable and
  resumable*, and is NOT confused with `blocked` (dead) or `merge_ready` (done).
- You can stop the `vibe` process and pick a task back up later (re-running the
  current phase is acceptable, agent in-memory context can't be restored).
- The supervisor's routing, execute the flow now vs gather specifications first,
  and "I may ask for more later", is visible.
- "Shape" gets a clearer name.

Underlying goal: **"we paused to ask you something" must never look like "this
failed / is gone".**

## What exists vs proposed vs foundation (grounded)

| Capability | Class | Evidence |
|---|---|---|
| Supervisor routing (execute vs gather-specs) | EXISTS | `select-workflow.ts:346-366` `chooseRunFlow`/`needsSpecUp`; `flow-sizing.ts:112-144` `classifyPlanWorthy`; `run-launcher.ts:280-291` `willSpecUp` |
| Routing recorded for the UI | EXISTS | `orchestrator.ts:970-992` writes `selection.json` + `workflow.selected` event |
| Spec-gathering loop bound (termination) | EXISTS | `ROUND_CAP = 4`, server-enforced `spec-up-chain.ts:57,115-124` |
| Spec-up phase is resumable (artifact-driven; each round terminal, submit -> new run) | EXISTS | `spec-up-chain.ts:352-414`; `spec-up-deep-loop-e2e.test.ts:72-94` |
| Durable run state on disk (state.json, events, flow.json, artifacts) | EXISTS | persisted, but see below |
| Terminal/non-terminal status model + transition matrix | EXISTS | `state-machine.ts:236-391`; `workflow-types.ts:21-47` |
| pause/resume | EXISTS but IN-MEMORY (dies on process death) | `pause-service.ts:128-229` poll loop |
| A first-class "awaiting input" status | **PROPOSED** | none today; awaiting-answers spec-up-intake lands `merge_ready` (`merge-readiness.ts:44-53`) |
| Honest detection of "awaiting answers" (has pending questions, not status===blocked) | **PROPOSED** | run-list carries no such flag; `isSpecUpRun` keys on `blocked` and is wrong both ways |
| Rename "Shape" -> "Spec-up" | **SHIPPED** | full concept rename across flows/routes/CLI/UI/persisted state/docs |
| **Resume a RUN's execution after process death** | **FOUNDATION** | `orchestrator.ts:804-844` always creates fresh state, never reloads; SIGKILL orphans (`run-entry.ts:43-44` can't catch SIGKILL); `--resume-from` forks a NEW run (`run-launcher.ts:103-180`) |

## The risks that decide success

1. **Execution-resume is a foundation, not reuse.** The single most expensive
   item. It needs: orchestrator startup check (reload non-terminal state.json),
   fast-forward already-completed steps, graceful-shutdown hooks (catch
   SIGTERM/SIGINT to mark a clean "interrupted" state; SIGKILL is uncatchable),
   and acceptance that mid-step agent context is lost (phase-restart only).
   Bundling it with the lifecycle relabel hides a quarter of work.
2. **The awaiting state is mislabeled as terminal success.** Fixing the label
   (`isSpecUpRun`) without introducing a real state just relocates the lie.
3. **Termination of the spec loop** is already solved (`ROUND_CAP=4`); the
   "supervisor may ask for more later" must inherit that bound, not open a new
   unbounded loop.
4. **Scope explosion**: this is three projects (state model, durable resume,
   rename). The scoping mechanism is the phasing below.

## The design

A new first-class lifecycle state, "**awaiting input**" (name TBD with the
rename), that is:

- Non-terminal, resumable. Entered when a run pauses for human data (today: the
  spec-up-intake emitting questions; later: any flow that asks mid-run).
- Detected honestly by "has parseable pending questions / a pending prompt",
  exposed as a server-computed `awaitingInput` (today `awaitingShape`) flag on
  the run-list object, NOT inferred from `blocked`/`merge_ready`.
- Rendered with a calm "waiting on you - open to answer" treatment, distinct
  from both Live execution and terminal failure.

Execution resume-after-death stays a SEPARATE foundation (Phase 3), built only
if/when we decide the cost is worth it. Shape resumability already works.

## Build sequencing (dependency-ordered)

- **M0 (scout, cheapest, decisive):** server exposes `awaitingInput` on the run
  list (true iff the run has parseable pending questions). Re-key `isSpecUpRun`
  on that flag. This *immediately* fixes the reported mislabel (dead blocked
  runs stop reading "Shaping"; real awaiting runs - which are `merge_ready` -
  start reading correctly) and proves the detection model on the smallest slice.
  No state-machine change yet.
- **Phase 1:** introduce the first-class `awaiting_input` status (RunStatus
  union + transitions + setters where spec-up-intake currently lands `merge_ready`)
  and the honest UI lifecycle (finalize / abort / awaiting / resumable). Tier-2
  (touches the core union + broker + every status consumer) - adversarial review
  + phased gates required.
- **Phase 2:** rename "Shape" to the chosen term across flows/CLI/UI/docs (pure
  vocab, mechanical but wide).
- **Phase 3 (FOUNDATION, optional/deferred):** execution resume-after-death
  (graceful shutdown + orchestrator reload + phase-restart). Largest; only the
  spec-up phase needs resume today and it already has it.

## Decisions (settled with user, 2026-06-21)

- **New name: "Spec-up"** (replaces "Shape").
- **Scope: M0 + P1 + rename.** Ship the derived `awaitingInput` correctness
  slice (M0), the first-class `awaiting_input` status + honest finalize / abort /
  awaiting UI (P1), and the rename to Spec-up.
- **P3 (execution-resume-after-death) is OUT for now** - the Spec-up phase
  already resumes (artifact-driven); a mid-build resume foundation isn't worth it
  yet.

Still open (pending the adversarial-review verdict):
- M0 false-positive risk: a finalized chain whose `questions.json` persists could
  still read "awaiting" - the detection must distinguish "awaiting" from "was a
  spec run, now done".
- Whether `awaiting_input` as a real status ripples too far (broker `run.complete`
  downgrade, the transition matrix, merge-advisor / mission consumers of
  `merge_ready`).

## Review trail (adversarial pass, 2026-06-21)

Reviewer: independent Opus, read-only, code-grounded. Verdict: diagnosis correct,
but M0 had a fatal false-positive and a live bug was understated.

- FATAL (accepted): `awaitingInput` = "questions.json parses" is permanently TRUE
  for every intake run ever, including answered/finalized ones - nothing deletes
  or marks `questions.json` answered (`spec-up-chain.ts:198-233`; submit writes a
  separate `spec-up-answers.md`). Reopening a finalized run would offer a Submit
  that spawns a DUPLICATE run. Fix: the flag needs a TERMINATOR - "awaiting" iff
  questions exist AND not yet answered/superseded (a marker at submit, or "no
  downstream run carries this run as `specUpRootRunId`").
- LIVE BUG (accepted): an awaiting intake run lands `merge_ready` WITH a branch
  (`prepareWorktree` unconditional), so it leaks into the merge-candidate list
  (`integration-service.ts:90`) and inflates provider success-rate
  (`overview-aggregator.ts:379,741` count every merge_ready as success, no
  readOnly filter). Independent of the redesign.
- FINDABILITY (accepted): the real broken half - `isSpecUpRun` keys on
  `blocked`, real awaiting runs are `merge_ready`, so it's dead for the happy
  path. Reopen-by-URL works (`RunDetailPage.tsx:230-233` keys on flow+questions,
  not status); find-in-list is broken.
- P1 (accepted): a new `awaiting_input` RunStatus ripples to ~40 sites; the
  corrected derived flag + the two guards cover shape at a fraction of the cost.
  P1 only earns its keep when a SECOND pauses-for-input source exists.

## Revised plan (post-review) - status

- **M0.5 - SHIPPED** (`d4ff6bf2`): read-only runs excluded from merge candidates
  + the success-rate metric (`integration-service.ts:90`,
  `overview-aggregator.ts`). Fixed the live leak.
- **M0 - SHIPPED** (`1aa1cfca`): a terminator marker (`flows/intake/answered.json`)
  written when an intake run is consumed; `readSpecUpQuestions` returns null once it
  exists; the server computes a per-run `awaitingInput` flag; `isSpecUpRun` keys
  on it, not status. + a terminator regression test.
- **P1 (real `awaiting_input` status): DEFERRED** until a second pauses-for-input
  source appears. The corrected flag is the mechanism for now.
- **Rename "Shape" -> "Spec-up" (full, incl. internals): SHIPPED.** A ~150-file
  concept rename + the persisted `shaped` -> `specUpPhase` schema migration (plus
  the `WorkflowSelectionSource` enum `"shaped"` -> `"spec-up"`), done surface by
  surface with `typecheck`/`test` gating per commit. Plan + naming map:
  `docs/design/spec-up-rename-plan.md`.
