# Task run modes: retire "saga", unify on one Task with steps

Status: design approved (2026-06-30), pending spec review. Brings the "saga"
concept into the Task model as a **run mode**, not a separate kind.

This is **Piece 1** of a two-piece effort. Piece 2 (the Board redesign + a
create-from-UI flow + the Conductor visual) is a separate spec that builds on the
model this one establishes.

## 1. Context - the real goal

Today a Task is one of two `kind`s: `"single"` or `"saga"`. The owner's
observation, grounded in the code, is that this is a false taxonomy:

- "Saga-ness" is **not** "has multiple items." A plain `"single"` task can also
  carry a checklist. The real difference is a bundle of *execution behaviors*
  gated on `sagaMode`/`kind==="saga"`/the `saga` flow (see §3).
- So a saga and a multi-step task are the **same data** (a Task with steps),
  differing only in **how they are run**: a **supervised sequence** (the
  Conductor bundle) vs a **plain holistic pass**.

The goal: collapse the two kinds into **one Task that has steps**, and make the
former saga behavior an explicit, visible, configurable **run mode**. No new
nouns - "saga" disappears as a term; the only new user-facing word is the mode
label, **"Supervised"**. The engine that runs a supervised task keeps its
existing name, **the Conductor** (so `ConductorPanel` stays).

Out of scope for this spec: the Board card redesign, the create-from-UI wizard,
and any Conductor-panel visual work (Piece 2).

## 2. The model

One `Task`:

- **`steps[]`** - the former checklist items, now uniformly "steps". Each is
  `text` + optional `objective` / `acceptanceCheck` / `fileHints` + `status` +
  `provenance` (Phase 3). Single-item = one step; an instant task = zero or one
  step. (The executor already treats an instant task as the degenerate
  synthetic-1-step case - this is a rename, not new runtime behavior.)
- **`runMode: "plain" | "supervised"`** - replaces `kind`. `"plain"` runs the
  default flow (one worktree, holistic review at the end). `"supervised"` flips
  the Conductor bundle (§3).
- **`supervised?: { state, halt, invariants, pendingRevision }`** - the
  supervised-run lifecycle, grouped into one nested object (was four flat
  `saga*` fields). `null` until the task is first run supervised.

"Single vs multi" is no longer a field - it is just `steps.length`.

## 3. What "Supervised" flips (the bundle), grounded in code

These behaviors are gated today on `sagaMode` / the `saga` flow; under unify they
are gated on `runMode === "supervised"`:

| Behavior | Gate today |
|---|---|
| The per-step-review flow (plan -> implement -> review-item + self-heal per step) | `flowId:"saga"` (`cli/commands/saga.ts:245`) |
| Per-step fresh context + curated packet (goal, prior outcomes, diff, fresh file read) | `orchestrator.ts:3586` |
| Between-steps supervisor (PROCEED/ENHANCE/ESCALATE) + invariants ledger + Enhance | `orchestrator.ts:4064` |
| Per-task budget (`maxSteps`/`maxSpendUsd`) + run lock + clean-halt-with-reset | `orchestrator.ts:4018` |
| Per-step `runId`/`outcomeSummary` stamping | `orchestrator.ts:3762` |
| Lifecycle state + `status\|pause\|resume` controls | `saga-status.ts`, `cli/commands/saga.ts` |

`"plain"` mode has none of these - it is the existing non-saga task run.

## 4. Config grain - one mode toggle + advanced knobs

Per the owner's decision: a single visible property picks the mode, with the
pieces tunable underneath for power users.

- **Primary:** `task.runMode` = `"plain" | "supervised"` - the one toggle that
  flips the whole bundle. Visible + editable in UI, CLI, and TUI.
- **Advanced (per-task overrides, optional):** a small `task.runOptions?`
  object (renamed/absorbing today's `task.sagaBudget`): `budget` (maxSteps /
  maxSpendUsd), `supervisor` (on/off), `enhance` (on/off). Absent fields inherit
  the project defaults.
- **Project defaults:** `config.saga.*` -> `config.supervised.*`
  (`{ maxSteps, maxSpendUsd, supervisor:{...} }`).

Incoherent combinations are prevented by construction: the advanced knobs only
*subtract* from the supervised bundle (turn supervisor or enhance off, tighten
budget); they cannot turn on a supervised-only behavior while in plain mode
(plain has no knobs).

## 5. Rename map

Field / type / surface renames (the inventory: ~26 `saga*` identifiers across 25
`src` files, 25 test files, 3 doc files). The plan enumerates each site; the
direction:

| Today | Becomes |
|---|---|
| `Task.kind: "single"\|"saga"`, `taskKindSchema` | `Task.runMode: "plain"\|"supervised"`, `runModeSchema` |
| `task.sagaState / sagaHalt / sagaInvariants / sagaPendingRevision` | nested `task.supervised: { state, halt, invariants, pendingRevision }` |
| `task.sagaBudget` | `task.runOptions.budget` (under the advanced knobs object) |
| `sagaState/Halt/PendingRevision` schemas + types | `supervised*` equivalents |
| `config.saga.*`, `sagaConfigSchema`, `sagaSupervisorConfigSchema` | `config.supervised.*`, `supervisedConfigSchema`, `supervisorConfigSchema` |
| `sagaMode` (orchestrator input/field) | `supervisedMode` |
| `saga` flow id | `supervised` flow id |
| `saga.supervisor` / `saga.enhance` / `saga.halted` events | `supervised.supervisor` / `.enhance` / `.halted` |
| `getSagaStatus`, `SagaStatus`, `NotASagaError` | `getTaskRunStatus`, `TaskRunStatus`, `NotSupervisedError` |
| `roleId: "saga-supervisor" / "saga-enhance"` | `supervised-supervisor` / `supervised-enhance` |
| CLI `vibe saga create\|add-step\|edit-step\|reorder\|list\|show\|sequence\|status\|pause\|resume` | fold into `vibe task …` (§6) |
| `getSagaStatus` route `GET /api/sagas/:taskId/status` | `GET /api/tasks/:taskId/run-status` |
| `ConductorPanel`, "the Conductor" | **unchanged** (the engine keeps its name) |

The word "Conductor" stays for the live-run engine/panel; "Supervised" is the
mode. They coexist: you set a task to run **Supervised**, the **Conductor** runs
it.

## 6. CLI surface

`vibe saga *` folds into the task command namespace. The unit is now just a Task:

- `vibe task run <id>` - runs the task, respecting `runMode` (supervised => the
  Conductor bundle; plain => default flow). Replaces `vibe saga sequence` and the
  plain-task run path with one verb.
- `--supervised` / `--plain` on create or a `vibe task set-mode <id> <mode>` to
  flip the toggle.
- Step authoring unified under `vibe task` (`add-step` / `edit-step` / `reorder`
  / `list` / `show`) - the same commands serve plain and supervised tasks.
- `vibe task status | pause | resume <id>` - the supervised lifecycle controls;
  on a plain task they report "plain task, nothing to supervise" rather than
  erroring on a wrong kind.

The scheduler's launch-arg branch (`scheduler-service.ts:99`, currently
`kind==="saga"`) branches on `runMode==="supervised"`. No new HTTP->shell
surface; the audited launch path is unchanged.

## 7. Migration (safety-critical)

Existing local data (`.vibestrate/roadmap.json`) must not be lost - never
auto-purge. A **one-time, read-time migration** (not a permanent compat shim):

- On task load, detect the legacy shape (`kind` present, or any `saga*` field)
  and rewrite it: `kind:"saga"` -> `runMode:"supervised"`, `kind:"single"` ->
  `runMode:"plain"`; the four `saga*` fields -> the nested `supervised` object;
  `sagaBudget` -> `runOptions.budget`. Persist the rewritten task.
- This is a one-shot rewrite of the owner's own data, distinct from the
  "no permanent fallbacks/aliases" rule. After migration the legacy keys are
  gone; the migration code can be removed in a later cleanup once no legacy
  stores remain (single-user, so effectively after the first load).
- Config files (`project.yml` `saga:` block) get the same one-time read
  migration to `supervised:`.

Failure mode to avoid: a task that fails to parse and is silently dropped. The
migration runs *before* strict parse, and a task that cannot be migrated is
surfaced loudly (logged + kept as-is), never discarded.

## 8. Build sequencing (dependency-ordered)

- **M0 - scout.** Confirm the full rename inventory (grep the 26 identifiers) and
  that the migration covers every persisted shape (task store + config). Read-only.
- **M1 - schema + migration.** `runMode`, nested `supervised`, `runOptions`; the
  one-time read migration for the task store + config; lossless-upgrade tests
  (legacy `kind:"saga"` task loads as `runMode:"supervised"` with state intact).
- **M2 - core rename.** `sagaMode`->`supervisedMode`, flow id, events, status
  service, orchestrator gates, scheduler branch. Behavior-preserving.
- **M3 - config + CLI.** `config.supervised`, the `vibe task` verb fold + the
  per-task advanced knobs.
- **M4 - docs + surfaces.** Rename `saga.*` docs to the new model; CHANGELOG;
  version; `docs:generate`. (UI strings that say "Saga" get updated; the Board
  *redesign* is Piece 2.)
- **M5 - verification.** Full suite green; a temp-store smoke proving a legacy
  saga task migrates and still sequences supervised end to end.

## 9. Testing strategy

- Migration: a legacy `kind:"saga"` task (with `sagaState`/`sagaInvariants`/etc.)
  loads as a `runMode:"supervised"` task with `supervised{}` populated; a
  `kind:"single"` loads as `runMode:"plain"`; a legacy `config.saga` block loads
  as `config.supervised`. No task is dropped.
- Behavior preservation: the existing saga e2e suite (supervisor, enhance, halt,
  budget, run lock) passes unchanged after the rename, just re-pointed at the new
  identifiers.
- CLI: `vibe task run` respects `runMode`; `status/pause/resume` on a plain task
  is a graceful no-op, not an error.

## 10. Open decisions (finalize in the plan)

- Exact per-task advanced-knob field name (`runOptions` vs `supervisedOptions`)
  and whether `supervisor`/`enhance` toggles live there or only at project level.
- Exact `vibe task` verb shape (one `run` vs separate `sequence`; `set-mode` vs
  a flag).
- Whether the migration is purely read-time-lazy or also offered as an explicit
  `vibe migrate` command for the config file.

## 11. Review trail

This rename is a schema migration + public-interface (CLI/config) change -
high-blast-radius. It will get an **independent adversarial review before merge**
(Tier-2), focused on the migration (silent task/data loss is the failure mode)
and on any behavior drift in the saga->supervised gate rename.
