# Saga Conductor (as-built decision record)

Status: Phase 2a (execution core) merged to `main` (v0.38.0). Phase 2b part 1
(the between-steps supervisor turn + non-folding invariants ledger + `vibe saga
status | pause | resume`) merged to `main` (v0.39.0). Phase 2b part 2 (the live
dashboard Conductor view + `GET /api/sagas/:taskId/status` + Sequence/Pause/Resume
controls + the dashboard saga-launch path through the scheduler + prose docs) built
on `feat/saga-conductor-2b-dashboard` (v0.40.0). The Conductor is complete. ENHANCE
(re-ground the pending plan) stays Phase 3; the resume-re-seeds-prose fidelity item
remains deferred (the packet's diff + fresh-read carry continuity).

## Phase 2b part 2 (shipped, v0.40.0)

`getSagaStatus` (src/feature/saga-status.ts) is the ONE source for a saga's live
conductor status, read by both `vibe saga status` and `GET /api/sagas/:taskId/status`
(UI<->CLI parity, no drift). It resolves the LIVE run via the run-lock holder
(stale-checked), not `task.currentRunId`. The dashboard's `ConductorPanel` polls it
(~2s) + the live run's engagement feed (where `saga.supervisor`/`saga.halted` now map).
Dashboard LAUNCH reuses the audited queue->scheduler path: the scheduler spawns
`vibe saga sequence <id>` for `kind:"saga"` tasks (was `vibe run --task`), inheriting
the whole saga lifecycle from `cmdSequence` by construction - NOT a parallel
implementation in `runFromSpec` (an independent review caught that the queue button
drives the scheduler, not `runFromSpec`, so the first design was dead code there).
A lock-rejected concurrent launch no longer mislabels the live task `failed`
(scheduler re-checks the live lock holder before mirroring the child exit code).

This is a short decision record. The full design and the implementation plan with
the complete review trail live in:

- Spec: [`docs/superpowers/specs/2026-06-29-saga-tasks-conductor-design.md`](../superpowers/specs/2026-06-29-saga-tasks-conductor-design.md)
- Plan + review trail: [`docs/superpowers/plans/2026-06-29-saga-phase-2-conductor.md`](../superpowers/plans/2026-06-29-saga-phase-2-conductor.md)

It records the decisions that differ from the spec's first draft - each forced by
grounding the design against the real executor (four read-only explorations) and
two independent adversarial reviews.

## Key as-built decisions

1. **A Saga is one orchestrator run in checklist mode, injected at the band's
   per-item seam - not a loop above `orchestrator.run()`.** N runs would mint N
   worktrees on N branches; the checklist band already accumulates in one worktree
   on one branch. The Conductor logic lives at the graph per-item exit seam
   (`orchestrator.ts`, the `dir === "repeat"` point).

2. **Sagas run a dedicated lighter `saga` flow, not plain `pickup`.** Plain pickup
   has no per-item review (review is holistic), so it cannot verify a step before
   the next - violating "never build on a broken step". The `saga` flow is a
   per-item-review band (`segTo` is a single `review-turn`, so `isReviewBand` and
   `bandIsGraph`), a deliberately lighter cousin of `pickup-review` (one reviewer
   per step, not a 2-reviewer + arbiter panel).

3. **Clean halt-with-reset, not a blocked checklist status.** On exhausted
   self-heal, the failed step's uncommitted work is discarded (`git reset --hard` +
   clean), the halt is recorded on the task (`sagaState: "halted"` + `sagaHalt`),
   and the step's checklist status is left `pending`. The band filters
   `status != "done"` on every run, so re-running `vibe saga sequence` resumes from
   the clean tip with finished steps skipped. (An earlier "mark the step blocked"
   design stranded/double-committed the branch on resume - caught in review.)

4. **Budget is a between-steps checkpoint.** Per-run cost is only summable after a
   step, so the per-Saga `maxSpendUsd` (and `maxSteps`) are checked at the per-item
   seam, never mid-step. A single step is bounded only by the existing global daily
   spend cap - documented honestly, not papered over. (`maxConsecutiveFailures` was
   dropped: unreachable once a blocked step halts immediately.)

5. **First per-task run lock.** An atomic claim on `Task.currentRunId` (lockfile
   via the repo's `file-mutex` exclusive-create, stale-reclaim by dead-pid or
   terminal run-state, never stealing a live holder's lock), checked in BOTH launch
   paths (CLI + the detached dashboard child - there is no single chokepoint). An
   independent review caught a stale-reclaim double-acquire race; fixed with a
   re-stat guard before unlink + an N-racer regression test.

6. **Fresh context = stateless band turns + a curated packet.** The graph-frontier
   band turns are already stateless (no session resume), so the real per-step
   continuity is the curated packet (feature goal, prior-step outcomes, accumulated
   diff, fresh read of the step's file hints), redacted and bounded. `Step.dependsOn`
   was dropped (the band is strictly linear; a DAG field with no consumer is a false
   capability). The non-folding invariants ledger is deferred to 2b with its
   producer (the supervisor).

## Safety

Worktree-bounded per step; `redactSecretsInText` retrofitted onto the existing
unredacted per-item summary path and applied to every new packet/prose path, with
the honest residual that lexical redaction cannot catch a model's paraphrase of a
secret; no auto-push, no auto-merge (a finished Saga is one reviewable branch);
the run lock prevents concurrent-saga checklist corruption.

## Phase 2b part 1 (shipped, v0.39.0)

The between-steps **supervisor turn** lands at the same graph seam as the budget
check (`orchestrator.ts`, `dir === "repeat"`, after a clean commit). It is an
out-of-band, READ-ONLY `runProvider` call (no write grant; all context - goal,
accumulated diff, remaining steps, current invariants - is in the prompt), NOT a
`runRole`/flow step, so it cannot touch the run-scoped `reviewDecision` (the
review-decision coupling the plan's reviewer flagged). It parses its own
PROCEED/ESCALATE vocabulary (`src/feature/supervisor.ts`), distinct from the
review `DECISION:` line. ESCALATE halts cleanly **keeping** committed work
(unlike the M1 self-heal halt, which resets a broken step). Every failure mode -
unresolved provider/role, provider error, unparseable output - folds to PROCEED +
a logged `saga.supervisor` event: the turn is advisory on top of the per-step
review, which already fail-closes correctness. It is spend-accounted like any
turn: `enforceSpendCap` gates it (a blown daily cap halts the run), and its cost
is recorded as a `saga-supervisor` role metric so the per-Saga budget counts it. The **invariants ledger** lives on
`task.sagaInvariants` (durable across resume), redacted + deduped + capped on
write, re-injected into every step's packet. CLI: `vibe saga status | pause |
resume` (pause/resume reuse `pause-service` against the run-lock holder's run).

## Deferred to Phase 2b part 2

The live dashboard Conductor view + launch/pause/resume controls (CLI is the only
control surface so far), the handwritten `concepts/saga.md` + `cli/saga.md` prose
for the supervisor/ledger/CLI, and a fidelity item: a fresh re-`sequence` resumes
from the clean tip but does not re-seed prior-step *prose* (the packet's diff +
fresh-read still carry continuity). The supervisor's third verdict, ENHANCE
(re-ground the pending plan), stays Phase 3 - it currently folds to PROCEED+log.
