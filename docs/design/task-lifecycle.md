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
| Supervisor routing (execute vs gather-specs) | EXISTS | `select-workflow.ts:346-366` `chooseRunFlow`/`needsShaping`; `flow-sizing.ts:112-144` `classifyPlanWorthy`; `run-launcher.ts:280-291` `willShape` |
| Routing recorded for the UI | EXISTS | `orchestrator.ts:970-992` writes `selection.json` + `workflow.selected` event |
| Spec-gathering loop bound (termination) | EXISTS | `ROUND_CAP = 4`, server-enforced `shape-chain.ts:57,115-124` |
| Shape phase is resumable (artifact-driven; each round terminal, submit -> new run) | EXISTS | `shape-chain.ts:352-414`; `shape-deep-loop-e2e.test.ts:72-94` |
| Durable run state on disk (state.json, events, flow.json, artifacts) | EXISTS | persisted, but see below |
| Terminal/non-terminal status model + transition matrix | EXISTS | `state-machine.ts:236-391`; `workflow-types.ts:21-47` |
| pause/resume | EXISTS but IN-MEMORY (dies on process death) | `pause-service.ts:128-229` poll loop |
| A first-class "awaiting input" status | **PROPOSED** | none today; awaiting-answers shape-intake lands `merge_ready` (`merge-readiness.ts:44-53`) |
| Honest detection of "awaiting answers" (has pending questions, not status===blocked) | **PROPOSED** | run-list carries no such flag; `isShapingRun` keys on `blocked` and is wrong both ways |
| Rename "Shape" | **PROPOSED** | pervasive vocab (`shape-*` flows, `vibe shape`, UI) |
| **Resume a RUN's execution after process death** | **FOUNDATION** | `orchestrator.ts:804-844` always creates fresh state, never reloads; SIGKILL orphans (`run-entry.ts:43-44` can't catch SIGKILL); `--resume-from` forks a NEW run (`run-launcher.ts:103-180`) |

## The risks that decide success

1. **Execution-resume is a foundation, not reuse.** The single most expensive
   item. It needs: orchestrator startup check (reload non-terminal state.json),
   fast-forward already-completed steps, graceful-shutdown hooks (catch
   SIGTERM/SIGINT to mark a clean "interrupted" state; SIGKILL is uncatchable),
   and acceptance that mid-step agent context is lost (phase-restart only).
   Bundling it with the lifecycle relabel hides a quarter of work.
2. **The awaiting state is mislabeled as terminal success.** Fixing the label
   (`isShapingRun`) without introducing a real state just relocates the lie.
3. **Termination of the spec loop** is already solved (`ROUND_CAP=4`); the
   "supervisor may ask for more later" must inherit that bound, not open a new
   unbounded loop.
4. **Scope explosion**: this is three projects (state model, durable resume,
   rename). The scoping mechanism is the phasing below.

## The design

A new first-class lifecycle state, "**awaiting input**" (name TBD with the
rename), that is:

- Non-terminal, resumable. Entered when a run pauses for human data (today: the
  shape-intake emitting questions; later: any flow that asks mid-run).
- Detected honestly by "has parseable pending questions / a pending prompt",
  exposed as a server-computed `awaitingInput` (today `awaitingShape`) flag on
  the run-list object, NOT inferred from `blocked`/`merge_ready`.
- Rendered with a calm "waiting on you - open to answer" treatment, distinct
  from both Live execution and terminal failure.

Execution resume-after-death stays a SEPARATE foundation (Phase 3), built only
if/when we decide the cost is worth it. Shape resumability already works.

## Build sequencing (dependency-ordered)

- **M0 (scout, cheapest, decisive):** server exposes `awaitingInput` on the run
  list (true iff the run has parseable pending questions). Re-key `isShapingRun`
  on that flag. This *immediately* fixes the reported mislabel (dead blocked
  runs stop reading "Shaping"; real awaiting runs - which are `merge_ready` -
  start reading correctly) and proves the detection model on the smallest slice.
  No state-machine change yet.
- **Phase 1:** introduce the first-class `awaiting_input` status (RunStatus
  union + transitions + setters where shape-intake currently lands `merge_ready`)
  and the honest UI lifecycle (finalize / abort / awaiting / resumable). Tier-2
  (touches the core union + broker + every status consumer) - adversarial review
  + phased gates required.
- **Phase 2:** rename "Shape" to the chosen term across flows/CLI/UI/docs (pure
  vocab, mechanical but wide).
- **Phase 3 (FOUNDATION, optional/deferred):** execution resume-after-death
  (graceful shutdown + orchestrator reload + phase-restart). Largest; only the
  shape phase needs resume today and it already has it.

## Open decisions

- The new name for "Shape" (candidates: Intake, Scoping, Discovery, Brief,
  Spec-up). Owner: user.
- Should `awaiting_input` be a real status (Phase 1) or stay a derived flag over
  `merge_ready` (M0 only)? The derived flag is far cheaper and fixes the bug;
  the real status is more honest but Tier-2.
- How far to take Phase 3 (or whether to at all), given shape already resumes.

## Review trail

(to be filled by the adversarial pass)
