# Saga tasks + the Conductor - design spec

Status: draft (brainstormed 2026-06-29, pending owner review)
Branch: `feat/saga-tasks`
Supersedes nothing. Extends: the checklist band, the roadmap task model, the
default flow.

## 1. Problem

Vibestrate can plan a feature into a list of todos and run a single task
through a full flow. What it cannot do is *build a whole feature on its own*.
Today the loop is, in the owner's words:

```
for i in steps:
    do(i)
    start_new_session()   # forgets everything, then do it again
```

Three concrete pains fall out of that:

1. **No autonomy.** The agent does one item, then waits to be told "continue."
2. **No automated supervision.** The owner has to verify and review each item
   by hand.
3. **Context rot.** Doing it all in one growing session degrades quality and
   forces a manual context clear, which throws away continuity.

The fix is not "keep one giant session" - the `start_new_session()` instinct is
half right, because a fresh context per step is exactly how you beat rot. The
missing piece is a **curated handoff** between steps plus a **supervisor** that
decides go/no-go, so the owner can walk away and come back to a coherent,
reviewed feature on a branch.

## 2. Vocabulary

- **Saga** - the new task kind. A `Task` (`src/roadmap/roadmap-types.ts`) whose
  `kind` is `"saga"`, holding an ordered set of Steps. A `kind: "single"` task
  is today's behavior (run once through one flow).
- **Step** - the buildable unit, bonded inside a Saga. It is an enriched
  evolution of today's `ChecklistItem`, not a new entity and not a separate
  board card.
- **Conductor** - the supervisor strategy that drives a Saga: picks the next
  step, builds its context packet, runs its flow, distills the outcome, and
  decides proceed / enhance / escalate. It is a strategy injected into the
  existing checklist band, **not** a controller that calls `orchestrator.run()`
  once per step (see section 4).
- **Enhance** - a plan-only pass that re-grounds the pending steps against the
  *actual current code* and emits a step-list diff. It never writes feature
  code.

Hierarchy, with nothing renamed:

```
RoadmapItem (Epic)            macro grouping (unchanged)
  Task  kind: "single"        run directly through one flow (today)
  Task  kind: "saga"          holds Steps, run by the Conductor (new)
    Step                      enriched ChecklistItem, each runs a full flow
```

"Plan" is not a third kind. It is the generative flow (the existing planner,
`src/roadmap/roadmap-planner.ts`) whose output *populates* a Saga's steps. Plan
feeds Saga. Steps can also be hand-authored via an "add step" affordance inside
the task.

## 3. The seven locked decisions

These were settled with the owner during brainstorming and are the product
contract. Implementation must not quietly drift from them.

1. **Per-step context = fresh + curated handoff.** Each step starts a fresh
   model context. It receives a curated packet: the feature goal, a compact
   ledger of prior step outcomes, a non-folding decisions/invariants ledger, the
   accumulated diff so far, a fresh read of the actual current code for this
   step's file hints, and this step's objective + acceptance. Code accumulates
   in one worktree; the model context resets each step.
2. **Data model = one card, rich steps.** A Saga is one Task; its Steps live
   inside it as enriched checklist items. The board shows a Saga as a compact
   container card (a step strip + progress), lighter than a single-task card.
3. **Supervised conductor between steps.** Between steps a cheap supervisor turn
   reads goal + finished step + remaining steps + diff-so-far and returns
   `PROCEED` / `ENHANCE` / `ESCALATE`. This is "orchestrated, not a for-loop."
4. **Failure = self-heal, then escalate.** On a failed or blocked step, bounded
   auto-recovery first (another pass of the review/fix loop with the findings,
   or an Enhance to adjust the plan), up to a small cap; if still stuck, HALT the
   whole saga and escalate with a report. Never build a later step on a broken
   earlier one. Hard stop-conditions bound the total run: per-saga budget, max
   steps, N consecutive failures.
5. **Enhance is plan-only.** It reads real code, proposes a step-list diff for
   *pending* steps, and treats already-built steps as immutable history. It
   never writes feature code.
6. **Merge stays human.** The feature branch is never auto-merged to main. A
   saga lands as one reviewable branch, routed through the existing Git Tree
   merge surface. Autonomy lives inside the feature branch; the merge gate does
   not move.
7. **Names**: the task kind is **Saga**, its supervisor strategy is the
   **Conductor**, the re-ground pass is **Enhance**.

## 4. Architecture: extend the band, do not loop above `run()`

### 4.1 Why the obvious design is wrong

The intuitive design - a Conductor that calls `orchestrator.run()` once per step
inside one shared worktree - is impossible as written. `orchestrator.run()`
mints a unique run id (`makeUniqueRunId`, `orchestrator.ts:847`) and
unconditionally creates a fresh worktree on a fresh branch keyed by that id
(`backend.prepareRun` -> `prepareWorktree`, branch `${prefix}${runId}`,
`git/worktree.ts`). N step-runs would produce N worktrees on N branches, each
starting from `mainBranch`, so step 2 would not even see step 1's commits. The
"code accumulates across steps" premise breaks at the first boundary.

This was confirmed by an adversarial review against the real code and by three
independent code explorations.

### 4.2 The correct seam

A **Saga is one orchestrator run** whose flow declares a `checklistSegment`
(`src/flows/schemas/flow-schema.ts`). The existing checklist band already does
the hard part:

- It runs all items in **one worktree**, committing each item to the **one
  feature branch** (`commitChecklistItem`, `orchestrator.ts:3506-3565`, with
  `Vibestrate-Checklist-Item` trailers).
- It carries a compact ledger forward between items
  (`buildPriorItemsContext` / `src/pickup/item-summary.ts`).
- It resumes by item status (`reconstructDoneOutcomes`, `orchestrator.ts:3220`).
- It pauses at stage boundaries (`applyPauseIfRequested`,
  `src/core/pause-service.ts`).
- It runs a holistic whole-feature review/verify postlude after the last item
  (`orchestrator.ts:3581-3597`).

The Conductor is therefore a **strategy injected into the band**, living in a new
`src/feature/` module but *called from inside* `runFlowSequence`, at the band's
existing per-item exit (`orchestrator.ts:3806-3814`, the `dir === "repeat"`
point that already means "item done, more remain"). The Saga inherits worktree
accumulation, per-step commits, resume, pause, and the existing redaction call
sites for free.

What the band does **not** do today, and what the Conductor phase must add:

- **Fresh model context per item.** Today the band carries an accumulating
  brief. Force a fresh provider session at each item boundary (the band already
  tracks per-participant `sessionReuse`, `orchestrator.ts:3150-3160`) and replace
  the accumulating brief with the curated packet (section 5.2).
- **A real blocked state.** Today an item whose review never approves still
  commits with `status: "done"` and the verdict demoted to metadata
  (`orchestrator.ts:3548`, cap-and-continue at `3766-3771`). In saga mode an
  exhausted/blocked item must produce a real `blocked` outcome the supervisor can
  act on, instead of a green-but-broken commit.
- **A supervisor turn** between items (section 5.3).
- **A per-saga budget envelope** and total stop-conditions (section 6.1).
- **A run lock** (section 6.3).

## 5. Components

### 5.1 Data model (`src/roadmap/roadmap-types.ts`)

`Task` gains:

- `kind: "single" | "saga"` (default `"single"`).
- `sagaState: "idle" | "sequencing" | "paused" | "halted" | "done"` (saga only).
- Conductor bookkeeping: current step index, consecutive-failure count,
  per-saga budget spent. (Exact shape decided in the Phase 2 plan.)

`Step` is the enriched `ChecklistItem`. Today it is
`{ id, text, status, createdAt, updatedAt, commitSha, promotedTaskId }`
(`roadmap-types.ts:131-140`). It gains:

- `objective` - the scoped goal for this step (prose).
- `acceptanceCheck` - "done when..." for the step (prose and/or commands).
- `fileHints: string[]` - best-effort files this step touches, seeding the fresh
  re-read.
- `dependsOn: string[]` - optional ordering beyond linear (step ids).
- `runId`, and a curated `outcomeSummary` recorded after the step runs.

Pre-publish, single-user: restructure the type cleanly, no back-compat shim.
`promotedTaskId` is dropped unless a use survives.

### 5.2 The curated packet (`src/feature/packet.ts`, extends `item-summary.ts`)

Built fresh for each step. Contents, in priority order:

1. **Feature goal** - the saga's objective (stable, never folds).
2. **Decisions / invariants ledger** - a small, append-only, **non-folding**
   list of cross-cutting decisions made by prior steps (e.g. "all API responses
   use snake_case"). This is the fix for convention drift: the folding outcome
   ledger is not allowed to carry conventions, because it folds them away. The
   supervisor and the planner maintain this list explicitly.
3. **Compact outcome ledger** - the existing `buildPriorItemsContext` summaries
   (what each prior step changed, key files, follow-ups). May fold under budget.
4. **Accumulated diff so far** - a bounded view of the real diff on the feature
   branch, so the step (and the supervisor) have diff-level visibility, not just
   hinted files.
5. **Fresh code read** - the actual current contents of this step's `fileHints`,
   re-read from the worktree (not remembered).
6. **This step** - `objective` + `acceptanceCheck`.

All model-generated text in the packet (2, 3) passes through the existing
`redactSecretsInText` (`src/core/diff-service.ts`) at this new call site. See
section 6.2 for why that is necessary but not sufficient.

### 5.3 The supervisor turn (`src/feature/supervisor.ts`)

A cheap model turn (small profile) inserted at the band's per-item exit. Input:
feature goal, the just-finished step's outcome + its slice of the diff, the
remaining steps, the decisions ledger. Output, a structured decision:

- `PROCEED` - continue to the next step.
- `ENHANCE` - the plan has diverged from reality; run an Enhance pass on the
  pending steps before continuing.
- `ESCALATE` - halt the saga and surface a report (used on irrecoverable
  failure or when the supervisor judges the feature is off-goal).

Decision parsing reuses the review-turn decision machinery. The supervisor also
appends any new cross-cutting decision to the invariants ledger.

### 5.4 Self-heal (reuse the existing review/fix loop)

"Self-heal" is not a new retry layer. It is another bounded pass of the band's
existing per-item review/fix loop (`orchestrator.ts:3688-3772`) seeded with the
reviewer's findings, plus the option for the supervisor to call `ENHANCE`. The
cap is small and counts toward the saga's consecutive-failure stop-condition. If
the item is still blocked after the cap, it becomes a real `blocked` outcome and
the conductor escalates - it does not commit a broken item as done.

### 5.5 Enhance (`src/feature/enhance.ts`, reuses `roadmap-planner` + `proposal-parser`)

A plan-only pass. Input: feature goal + current step list + a real read of the
current code. Output: a step-list diff for **pending** steps only (add, refine,
reorder; done steps are immutable history). Two triggers:

- **Manual** - a button / CLI command; shows the diff for the owner to accept.
- **Conductor-triggered** - the supervisor returns `ENHANCE`; applied
  automatically to the pending steps and logged.

Critical resume constraint (section 6.4): Enhance mutates **run-scoped pending
state**, never the persisted `task.checklist`, so it does not trip the resume
guard at `orchestrator.ts:3215`. The persisted checklist is only reconciled on
clean saga completion.

## 6. Guards, failure, and safety

### 6.1 Budget and stop-conditions

The only existing global ceiling is a shared *daily* dollar cap across all runs
(`computeDailySpendUsd`, `src/core/spend-cap-service.ts:21-35`), or nothing if
unset. That is the wrong unit for a saga. The Conductor phase adds a **per-saga
budget envelope** plus two counters, all bounding the *total* saga, enforced in
the band loop:

- `maxSpendUsd` - per-saga dollar ceiling (distinct from the daily cap).
- `maxSteps` - hard ceiling on step count, including steps Enhance adds.
- `maxConsecutiveFailures` - halt after N steps fail in a row.

These exist because the per-step review loop is bounded (`maxReviewLoops`,
clamped at `flow-schema.ts:297`) but the *product* (steps x self-heal x
review-iterations, with Enhance able to grow `steps`) is not.

### 6.2 Secret handling - honest about the residual

Redaction today is 8 exact-token regexes applied at ~10 explicit call sites
(`src/core/diff-service.ts`). It catches a verbatim `AKIA...` / `sk-ant-...`. It
does **not** catch a model *paraphrase* of a secret (e.g. a step summary that
describes a hardcoded credential in prose). The saga amplifies this because the
ledger and packet are model prose that is carried forward, re-injected, and
persisted.

Mitigations, in order of strength:

1. Wire `redactSecretsInText` into every new ledger/packet/outcome path. This is
   necessary but lexical, so it is defeatable by paraphrase.
2. Prompt discipline: step outcome summaries describe *what changed structurally*
   and must not quote file contents or config values.
3. **Disclose the residual honestly** in docs and the Security Notes of any
   report: a model that paraphrases a secret into a summary can defeat
   token-shaped redaction. This is an existing residual in the product (run
   briefs, reports already carry model prose); sagas widen it. We do not claim
   to have solved semantic leakage.

### 6.3 Concurrency / run lock

There is no per-run mutex today; the only guard is an advisory `currentRunId`
check in a route handler (`src/server/routes/tasks.ts:422`), not consulted by the
CLI path. Sagas introduce the first real **per-task / per-worktree run lock** so
two sagas on one task (or a saga and a normal run) cannot corrupt the shared
checklist or the feature branch. The lock is acquired at saga start and released
on terminal state.

### 6.4 Resume and crash semantics

A saga is one process-bound run. If the process dies, the saga stops; it resumes
by item status via the existing `reconstructDoneOutcomes` path **as long as the
checklist is stable**. That is why Enhance must edit run-scoped pending state,
not the persisted checklist (section 5.5) - otherwise the resume guard
(`orchestrator.ts:3215`) hard-throws and the accumulated branch is stranded.
Limitation stated plainly: this is not a daemon. A dead process needs an explicit
resume; we do not claim background durability.

### 6.5 Merge policy

The feature branch is never auto-pushed or auto-merged to main. A finished saga
produces a report plus one reviewable branch, surfaced through the existing Git
Tree merge UI for the owner to review and land. This is distinct from the owner's
personal slice-merge workflow and preserves the product's no-auto-merge posture.

## 7. Surfaces (CLI and dashboard, full parity)

Every action is doable in both. Neither is the "real" interface.

- **CLI**: `vibe saga create | add-step | list | show | sequence | pause |
  resume | enhance | status`.
- **Dashboard**:
  - Board: a Saga renders as a compact container card - step strip + progress +
    state (sequencing / paused / halted), lighter than a single-task card.
  - Saga detail: a step editor (add / edit / reorder), a live Conductor view
    (current step, its flow phases, supervisor decisions), an Enhance button
    (shows the step diff), and an escalation banner when halted.
  - Reuses the FlowCard idiom, StatTiles, the Mission Control sidebar shell, and
    contained MC-matched headers; no pills, no eyebrow slugs, no faint grey
    labels, no pulse - per `docs/design/primitives-contract.md`.

## 8. Phasing

One phase per branch, per the agent protocol. Surface first, by owner decision.

- **Phase 1 - Surface.** Data model (`Task.kind`, enriched `Step`), step
  authoring (CLI + UI add/edit/reorder), the board container card, and the saga
  detail view. Execution is not wired - this de-risks the type and the UI before
  the Conductor. Thin alone (a richer checklist), but it makes the Saga concept real
  and reviewable.
- **Phase 2 - Conductor.** The execution layer: extend the band with fresh-session
  context, the curated packet, the supervisor turn, self-heal with the
  blocked-state fix, the per-saga budget + stop-conditions, and the run lock.
  This is the payoff.
- **Phase 3 - Enhance.** The plan-only re-ground pass: manual first, then
  conductor-triggered, with the run-scoped pending mutation.

## 9. Testing strategy

- Unit: packet builder (ordering, redaction wiring, non-folding invariants
  ledger), supervisor-decision parse, enhance step-list diff, the blocked-state
  transition.
- Integration with **fake providers** (never a real CLI in tests): a saga end to
  end over steps 1 -> 2 -> 3; the self-heal path; the escalate/HALT path;
  pause/resume mid-saga; an Enhance-then-resume to prove the resume guard is not
  tripped.
- Temp-git-repo smoke: one feature worktree, per-step commits accumulate on one
  branch, the branch is clean and reviewable after a mid-saga halt.
- Route-level checks for the saga APIs.
- Budget: a saga that hits `maxSteps` / `maxConsecutiveFailures` / `maxSpendUsd`
  halts and reports honestly.

## 10. Security notes

- Worktree-bounded: every step runs in the saga's worktree; existing path guards
  and secret-file refusal apply per step.
- Redaction wired into all new model-prose paths, with the honest residual of
  section 6.2 disclosed - not papered over.
- No auto-push, no auto-merge (section 6.5).
- First real run lock prevents concurrent-saga checklist corruption.
- No new HTTP-to-shell surface: the dashboard drives sagas through the same
  audited run-launch path as today, never by spawning arbitrary commands.

## 11. Open questions and known risks

- **Fidelity bet (riskiest).** Whether the curated packet - non-folding
  invariants ledger + diff-so-far + fresh code read - carries enough that step N
  does not contradict step 2. The invariants ledger and diff-so-far are the
  mitigations; the holistic postlude review is the backstop. This is the part
  most likely to need iteration after Phase 2 ships.
- **Supervisor cost.** One extra model turn per step. Must run on a cheap profile
  or it bloats long sagas. Measured in Phase 2.
- **Enhance authority.** Conductor-triggered Enhance can reorder/refine pending
  steps autonomously; destructive changes (dropping an owner-authored step,
  changing the feature goal) escalate rather than apply. Exact policy finalized
  in the Phase 3 plan.
- **Process-bound.** Not a daemon (section 6.4). A durable background runner is
  out of scope for v1.
