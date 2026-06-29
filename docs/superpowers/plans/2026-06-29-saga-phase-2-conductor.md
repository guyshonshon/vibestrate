# Saga Phase 2 (Conductor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. M0-M1 are step-level TDD; later milestones are specs (files, interfaces, tests, the verified seam, risk) expanded to step-level when reached.
>
> **Revised after a two-reviewer adversarial pass (2026-06-29).** See "Review trail" for the six changes the review forced. The phase is now **split into 2a (this branch) and 2b (a later branch)**.

**Goal:** Make a Saga *run on its own* - a `kind:"saga"` task whose steps execute in sequence, each in a fresh model context with a curated handoff, self-healing then halting **cleanly** on failure, bounded by a per-saga budget, landing as one reviewable feature branch (never auto-merged). The between-steps **supervisor judgment** and the operability/visibility surfaces land in 2b.

**Architecture:** A Saga is **one orchestrator run in checklist mode** pinned to the **`pickup-review` flow** - the per-item-review band (`checklistSegment {micro-plan..arbiter}`, `segTo` is a `review-turn` so `isReviewBand` and `bandIsGraph` are true). Its steps are the checklist items; each is verified by a per-item review panel + a fix loop **before** it commits. The Conductor logic is injected at the band's existing **graph** per-item exit seam (`dir === "repeat"`, `orchestrator.ts:3806-3814`), **not** a loop above `orchestrator.run()`. It inherits one-worktree accumulation, per-step commits, resume-by-status, and pause for free. New code lives in `src/feature/`.

> **Correction (during M1 grounding, supersedes the earlier "pin to linear pickup"):** plain `pickup` has NO per-item review (review is holistic/postlude, segTo=`implement` → `isReviewBand=false`), so it cannot verify a step before the next - violating design §4. The per-item review fix loop the design's self-heal needs only exists in the **graph** band, and the built-in flow that has it is **`pickup-review`** (segTo=`arbiter`). So sagas pin to `pickup-review` and inject at the **graph** seam 3806, not the linear seam 4310. This also moots Reviewer A's graph/linear-asymmetry concern (sagas use ONE flow → ONE seam). Cost note: `pickup-review` is `costClass:high` (per step: micro-plan + implement + 2 reviewers + arbiter, x fix iterations); a lighter single-reviewer saga flow is a future option and M1's halt logic is flow-agnostic (`sagaMode && isReviewBand`).

**Tech Stack:** TypeScript, zod, commander (CLI), fastify (HTTP), React (dashboard), vitest (tests, **fake CLI providers only** - never a real provider). `pnpm test` runs `vitest run`; single file: `pnpm exec vitest run tests/<file>.test.ts`.

## Global Constraints

- **Every new zod field MUST have `.default()`.** `getTask` parses inside `catch { return null }` (`roadmap-store.ts:100-111`); a non-defaulted field makes every pre-existing task vanish.
- **Pre-publish, single-user:** no back-compat shims, no aliases, no `.catch(()=>default)` swallows, fail fast - but never silently drop or auto-delete data.
- **House style:** no em dashes (use `-`), no emojis anywhere, "Provider" not "Engine".
- **UI (2b):** compose only from `src/ui/components/design/*`; never bare `<button>`; no pill labels, eyebrow slugs, `chalk-400`/`fog-400` primary labels, or pulse animation; dense cards. Per `docs/design/primitives-contract.md`.
- **Safety invariants:** no auto-push, no auto-merge; worktree-bounded reads/writes; every new model-prose path through `redactSecretsInText`; no HTTP-to-shell (the dashboard launches sagas through the audited `POST /api/runs` path).
- **`maxSpendUsd` is a BETWEEN-STEPS checkpoint, not a hard wall** (review finding B-#2): a single step is bounded only by the optional global daily cap. Say so wherever the knob appears.
- **Verification gates:** `pnpm typecheck`, `pnpm test`, `pnpm build` before the phase is done. Do not run `build`/`docs:generate` concurrently with `vitest` (contention flakes).

---

## Foundation: seams verified against current code (2026-06-29)

Grounded by four read-only explorations + a two-reviewer adversarial pass on `feat/saga-conductor` @ 58b93bcc. `orchestrator.ts` is 6824 lines.

| Claim the design rests on | Holds? | Current location |
|---|---|---|
| Band loop `runFlowSequence` | yes | `orchestrator.ts:3082` |
| `bandIsGraph` routing (decides which seam is live, once per run) | yes | `orchestrator.ts:3291` (true iff a band step has `needs`) |
| **Linear** per-item exit seam `dir === "repeat"` (saga inject point) | yes | `orchestrator.ts:4310-4317` |
| Graph per-item exit seam (dead for sagas - pickup is linear) | yes | `orchestrator.ts:3806-3814` |
| `commitChecklistItem` -> one branch/worktree, `Vibestrate-Checklist-Item` trailer | yes | `orchestrator.ts:3506-3598` (commit `3563-3565`) |
| Green-but-broken commit: `status:"done"` hardcoded, verdict demoted | yes | `orchestrator.ts:3548` + `3553` |
| Persisted item-status writes mid-run (the resume hazard) | yes | `enterChecklistItem` `3482` (`in_progress`), commit `3563` (`done`), catch `4652` (`blocked`) |
| Cap-and-continue after `maxReviewLoops` (today: still commits) | yes | `orchestrator.ts:3766-3769`; clamp `:886` |
| One run = one unique worktree/branch | yes | `makeUniqueRunId` `:847`; `prepareWorktree` `git/worktree.ts:18` |
| Resume guard hard-throws if checklist **ids** changed (status not checked) | yes | `orchestrator.ts:3215-3218`; `resume-checklist.ts:58-65` |
| Resume selects items by `status !== "done"` | yes | `orchestrator.ts:3199`; `resume-checklist.ts:29` |
| Per-participant session reuse (fresh-session hook = null `participant.sessionId`) | yes | `orchestrator.ts:3150-3160`; `flow-participant-ledger.ts:146-182` |
| Holistic postlude after last item | yes | `orchestrator.ts:3582-3597` |
| Saga flow = **pickup**, linear | yes | `builtin-flows.ts:272-340`; schema `flow-schema.ts:308-314` |
| Audited launch: `POST /api/runs` -> `startDetachedRun` -> detached child -> `runFromSpec` | yes | `runs.ts:339`; `detached-run.ts:50`; `run-launcher.ts:212` |
| CLI launch bypasses `runFromSpec` (direct `new Orchestrator().run()`) | yes | `cli/commands/run.ts:573,632` |
| Per-run cost summable by runId | yes | `recomputeRunTotals` `runtime-metrics.ts:160-175`; `RoleMetrics.totalCostUsd` `:43` |
| Only global ceiling = daily cap, read pre-turn; no per-turn/wall-clock cap | yes | `spend-cap-service.ts:21-35`; `enforceSpendCap` pre-turn |
| No real run mutex; advisory `currentRunId` only | yes | set/clear `roadmap-service.ts:319,437`; read `tasks.ts:444` |
| Existing outcome-summary written **unredacted** to disk | yes | `item-N-summary.md` via `renderItemSummaryArtifact` `orchestrator.ts:3561`; carry `buildPriorItemsContext` `3468,3584` |
| `redactSecretsInText` (8 token regexes) | yes | `diff-service.ts:77-89` |
| Phase-2 data fields absent | yes | no `sagaState`/`runId`/`outcomeSummary` in `roadmap-types.ts` |
| Fake-provider test harness | yes | `checklist-shape-b-band.test.ts`, `pickup-step-mode.test.ts`, `orchestrator-spend-cap.test.ts` |

---

## PHASE 2a (this branch: feat/saga-conductor) - bounded autonomous execution

### M0: Data model + config + sagaMode wire (full TDD)

No behavior change. **Files:** `roadmap-types.ts` (Task ~151-219; `checklistItemSchema` ~131-145), `roadmap-service.ts`, `run-launcher.ts` (`RunSpec`), `runs.ts` (`spawnRunBody`), `orchestrator.ts` (`OrchestratorInput` + run state), the config schema.

**Interfaces / fields (note the two dropped fields):**
- `sagaStateSchema = z.enum(["idle","sequencing","paused","halted","done"])`; `Task.sagaState` (default `"idle"`).
- `Task.sagaHalt: { reason: string; atStepId: string | null; summary: string } | null` (default `null`) - **the single home for halt state** (review A-F1: do not put halt on the item status).
- `Task.sagaBudget: { maxSpendUsd: number | null; maxSteps: number | null }` (defaulted from config). **No `maxConsecutiveFailures`** (review B-#1: dead under "blocked halts immediately").
- `Step` gains `runId: string | null` (default `null`), `outcomeSummary: string` (default `""`). **No `dependsOn`** (review B-#4: false DAG capability in a linear band).
- `RunSpec.sagaMode?: boolean` threaded to `Orchestrator` and run state, mirroring `checklistMode`.
- Derived, not stored: per-saga spend (`computeRunSpendUsd`, M4), current step index (checklist statuses).

- [ ] Step 1: failing test `tests/saga-schema-phase2.test.ts` (pre-Phase-2 saga parses with `sagaState:"idle"`, `sagaHalt:null`, `sagaBudget` from config defaults; step parses with `runId:null`, `outcomeSummary:""`; round-trip a `halted` saga preserves `sagaHalt`).
- [ ] Step 2: run -> fails.
- [ ] Step 3: add `sagaStateSchema` + Task/Step fields (all `.default()`).
- [ ] Step 4: run -> passes.
- [ ] Step 5: `config.saga` defaults (`maxSpendUsd:null`, `maxSteps:20`); `addTask` resolves `sagaBudget` from config; test resolution.
- [ ] Step 6: thread `sagaMode` (RunSpec -> spawnRunBody -> OrchestratorInput -> run state); a `kind:"saga"` run sets it; unit-test the flag arrives. No band behavior yet.
- [ ] Step 7: commit `feat(saga): phase-2 data model, per-saga budget config, sagaMode wire`.

### M1: Clean halt + fresh session per step (full TDD) - the corrected core

Both gated on `sagaMode`; non-saga runs byte-for-byte unchanged.

**Files:** `orchestrator.ts` (commit closure 3506-3598; cap-and-continue 3766-3769; item entry `enterChecklistItem`/`segFrom`; the linear seam 4310-4317). **Test:** `tests/saga-halt-clean.test.ts`, `tests/saga-fresh-session.test.ts`.

**Corrected behavior (review A-F1):** a step that exhausts self-heal does **not** commit and does **not** get `status:"blocked"`. Instead: **reset the worktree to the last clean item boundary** (so the failed step leaves zero commits and a clean tree), record `Task.sagaHalt = {reason, atStepId, summary}`, set `Task.sagaState:"halted"`, and stop. The item's persisted `status` stays `pending`, so resume re-attempts it from a clean tip and the id-only resume guard (3215) stays satisfied. No rollback-of-committed-step machinery needed because the step never commits.

- [ ] Step 1 (**verify first**): read the commit/fix-loop region to confirm whether intra-item commits exist (reviewers disagreed). Determine the reset target: last `Vibestrate-Checklist-Item` commit if intra-item commits exist, else `git reset --hard HEAD` + clean untracked. Write it down in the test.
- [ ] Step 2 (clean halt): failing test - fake provider whose reviewer always returns CHANGES_REQUESTED; in saga mode assert (a) the failed step has **no** commit, (b) the worktree is clean at the last good boundary, (c) `task.sagaHalt.atStepId` names the step, (d) `task.sagaState:"halted"`, (e) the failed item's persisted `status` is still `pending`.
- [ ] Step 3: run -> fails (today commits `done`).
- [ ] Step 4: implement at the cap-and-continue point + commit closure + seam: in saga mode, skip the green commit, reset to the clean boundary, set `sagaHalt`/`sagaState`, raise the halt signal consumed at 4310-4317.
- [ ] Step 5: run -> passes. Add a non-saga regression proving the green-but-broken path is unchanged when `sagaMode` is false.
- [ ] Step 6 (fresh session): failing test over a 2-step saga - assert step 2 entry gets a fresh session (new id) and the session is NOT reset inside a single step's fix loop.
- [ ] Step 7: run -> fails.
- [ ] Step 8: implement - in `enterChecklistItem`, guard `stepIndex === segFrom` and `sagaMode`, null the band seats' `participant.sessionId`. (Fires for every step that runs, including a resumed re-attempt, since done steps aren't re-entered.)
- [ ] Step 9: run -> passes; commit `feat(saga): clean halt-with-reset + fresh session per step (saga mode)`.

### M2: Curated packet + non-folding invariants ledger + redaction retrofit

**Files:** create `src/feature/packet.ts`; modify the per-item context build in `orchestrator.ts` (saga mode); reuse `pickup/item-summary.ts`. **Test:** `tests/saga-packet.test.ts`.
**Interfaces:** `buildStepPacket({goal, invariants, priorOutcomes, diffSoFar, fileReads, step}): string` (§5.2's six sections in priority order); `InvariantsLedger` - append-only, non-folding, persisted run-scoped.
**Redaction (review B-#3):** route the invariants ledger **at write**, the packet, and the outcome summary through `redactSecretsInText`, **and retrofit it onto the existing unredacted `item-N-summary.md` write (`orchestrator.ts:3561`) + `buildPriorItemsContext` carry** that this builds on.
**Tests:** section ordering; invariants never fold (outcome ledger may); redaction applied at the ledger write and the retrofit sites; fresh code read reflects the worktree, not memory.
**Risk:** the fidelity bet (spec §11) - mitigated by invariants ledger + diff-so-far, backstopped by the holistic postlude; provable only post-ship.

### M4: Budget envelope + stop-conditions (between-steps)

**Files:** create `src/feature/budget.ts`; check at the linear seam 4310-4317. **Test:** `tests/saga-budget.test.ts`.
**Interfaces:** `computeRunSpendUsd(metricsStore, runId): number` (one `MetricsStore.read()`, sums `roles[].totalCostUsd`); `checkSagaStopConditions({spentUsd, budget, stepCount}): {halt:boolean; reason?:string}`. On breach -> `sagaState:"halted"`, honest `sagaHalt.summary`, stop. **No consecutive-failure counter** (dropped).
**Honesty (review B-#2):** `maxSpendUsd` is checked **between steps**; a single step is bounded only by the daily cap. Tests: a saga halts at `maxSpendUsd` (between steps) and at `maxSteps`; **and a test proving the daily cap halts a saga mid-step** (the only real mid-step wall); under caps it completes. Docs/CLI/Security-Notes state the between-steps semantics and recommend setting the daily cap for unattended sagas.

### M5: Run lock - atomic per-task claim (review A-F2 / B-#4 reframe)

**Files:** extend `roadmap-service.ts` (promote `currentRunId`) + check at both launch entrypoints (`cli/commands/run.ts:573` and the `runFromSpec`/`run-entry` path). **Test:** `tests/saga-run-lock.test.ts`.
**Interfaces:** an **atomic claim** on `Task.currentRunId` (compare-and-set: refuse if a *live* run holds it; reclaim if the holder is in a terminal state or its pid is dead), checked in **both** launch paths before the run mutates the task. Keyed by **taskId** (the corruption surface is the shared persisted checklist; worktrees are unique per runId). Released on every terminal state (done/halted/failed/aborted).
**Why not a worktree-prep lockfile:** two runs on one task have different runIds -> different worktrees, so they never collide there; they collide on the task's checklist. Task-keyed claim is the correct unit and reuses existing state.
**Tests:** a second launch on a claimed task is refused with a clear error; the claim releases on completion, halt, and failure; a stale claim (dead pid) is reclaimable.

### M6 (2a slice): `vibe saga sequence` (launch only)

**Files:** `cli/commands/saga.ts` (+ reuse `POST /api/runs`). **Test:** `tests/cli-saga-sequence.test.ts`.
**Interface:** `vibe saga sequence <id>` constructs a `RunSpec` for the task in `sagaMode` pinned to the pickup flow and calls the audited launch (never raw spawn). Pause/resume/status are **2b**.
**Tests:** command wiring; a route-level check that launch goes through the audited path.

### M8a: Integration + temp-git smoke (2a)

**Test:** `tests/saga-e2e.test.ts` (fake providers): a saga end-to-end 1->2->3; the self-heal-then-clean-halt path; a temp-git smoke proving per-step commits accumulate on one branch and the branch is **clean and reviewable after a mid-saga halt** (the property A-F1 was about); budget caps halt-and-report; the run-lock refuses a concurrent launch. Close 2a with green gates, a CHANGELOG entry + `npm version minor --no-git-tag-version`, a TODO tick, and an Implementation Report (CLAUDE.md §4) with the honest secret-leakage residual in Security Notes. **Pause for review before 2b.**

---

## PHASE 2b (fresh branch, after 2a review) - supervision + operability

- **M3: the supervisor turn** (`src/feature/supervisor.ts`) at the linear seam, on a cheap profile: `runSupervisorTurn(...) -> {decision:"PROCEED"|"ESCALATE"; newInvariants; note}` (reuses review-decision parse; appends to the invariants ledger; `ENHANCE` reserved for Phase 3 -> PROCEED+log). Runs only on a cleanly committed step (after M1's halt gate). Risk (review riskiest-2): run-scoped `reviewDecision` coupling (`orchestrator.ts:3750-3753`) - integration-test the real executor, do not rely on parse-machinery reuse blind.
- **M6 rest:** `vibe saga pause | resume | status` (reuse `pause-service`; status reads `sagaState`/`sagaHalt`; resume re-attempts from the clean tip, with an explicit `--retry-step` consideration for the halted step).
- **M7: dashboard** live Conductor view (current step, phases, supervisor decisions) fed by `run-audit` + ~2s poll (mirror `RunTree.tsx`); Sequence/Pause/Resume controls; an escalation banner on `halted`. Both themes; verify on the **built** bundle (`pnpm build`), not just HMR.
- **M8b:** docs (`concepts/saga.md`, `cli/saga.md`, `design/saga-conductor.md`), `pnpm docs:generate`, CHANGELOG, README.

---

## Security notes

Worktree-bounded per step; `redactSecretsInText` wired into every new ledger/packet/outcome path **and retrofitted onto the existing unredacted summary path**. **Honest residual:** token-shaped redaction cannot catch a model *paraphrase* of a secret; the non-folding invariants ledger is persisted and re-injected every step, so a paraphrased secret captured once is durably on disk and re-fed N times - sagas widen this existing exposure; not claimed solved. `maxSpendUsd` is a between-steps checkpoint, not a mid-step wall - the daily cap is the only mid-step backstop. No auto-push/auto-merge. First real per-task run claim. No new HTTP-to-shell surface.

## Open decisions

1. A dedicated linear `saga` flow cloned from pickup (cleaner stage labels) vs reuse pickup as-is. (Plan: reuse pickup; low cost to change.)
2. Supervisor profile (2b).
3. Whether resume of a halted step is automatic or gated behind `--retry-step` (2b).

## Review trail

- Design spec adversarially reviewed pre-Phase-1 (spec §4.1).
- Phase-2 plan grounded by four explorations (table) and **two independent Opus 4.8 adversarial reviewers** (2026-06-29). Six required changes, all folded in:
  1. **A-F1 (fatal):** blocked-status + resume stranded/double-committed the branch -> clean halt-with-reset; halt lives in `sagaHalt`; item status stays `pending`.
  2. **A-F2 (fatal):** no CLI/dashboard lock chokepoint -> atomic per-task `currentRunId` claim checked in both paths; fixed the `run-startup.ts` mis-cite.
  3. **A-riskiest:** graph/linear seam asymmetry -> pin sagas to the linear pickup flow, inject at the linear seam only.
  4. **B-#1:** `maxConsecutiveFailures` unreachable -> dropped (deviates from spec §6.1, with reason).
  5. **B-#2:** `maxSpendUsd` overshoot -> reframed as a between-steps checkpoint; daily-cap backstop + mid-step test.
  6. **B-#3 / B-#4:** existing unredacted summary path -> redaction retrofit in M2; `Step.dependsOn` false capability -> dropped (deviates from spec §5.1, with reason).
- **B-scope:** split into 2a (execution core, this branch) + 2b (supervisor + surfaces, later branch).

## Self-Review

Spec coverage: locked decisions 1 (fresh+curated) -> M1+M2; 2 (card) -> Phase 1; 3 (supervised) -> **2b/M3**; 4 (self-heal then escalate **cleanly**) -> M1+M4; 5 (Enhance) -> Phase 3; 6 (merge human) -> M8a; 7 (names) -> throughout. Guards §6: budget/stop -> M4; secrets -> M2; run lock -> M5; resume/crash -> M1's clean-halt; merge -> no auto-merge. Surfaces §7: launch -> M6(2a); pause/resume/status + dashboard -> 2b.
Placeholder scan: M0-M1 step-level; later milestones are interface-level specs with cited seams, expanded at execution (stated). Type names (`sagaMode`, `sagaState`, `sagaHalt`, `sagaBudget`, `runId`, `outcomeSummary`, `buildStepPacket`, `computeRunSpendUsd`, `checkSagaStopConditions`) are consistent across producing/consuming milestones.
