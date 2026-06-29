---
title: vibe saga
description: Author Saga tasks - a task kind that holds coordinated, ordered steps you define once and sequence later.
section: cli
slug: cli/saga
---

`vibe saga` is the surface for **Saga tasks** (`kind: "saga"`). A Saga is a task that holds an ordered set of steps, each with a scoped objective, a done-when check, and optional file hints. Author the steps, then sequence them through a flow with `vibe saga sequence` (the **Conductor**).

See [Saga tasks](/docs/concepts/saga) for the concept.

## Commands

### `vibe saga create <title>`

Create a new Saga task.

```bash
vibe saga create "Migrate settings handler to the new schema"
vibe saga create "Migrate settings handler to the new schema" -d "Covers the three affected tables."
vibe saga create "Migrate settings handler to the new schema" --json
```

Options:

- `-d, --description <text>` - longer description attached to the Saga card.
- `--json` - emit the created task as JSON instead of the human-readable summary.

### `vibe saga add-step <taskId> <text>`

Add a step to an existing Saga.

```bash
vibe saga add-step saga-abc123 "Update the settings model"
vibe saga add-step saga-abc123 "Update the settings model" \
  --objective "Replace the old SettingsV1 type with SettingsV2 in src/models/settings.ts" \
  --acceptance "TS compiles with zero errors on the model file" \
  --files "src/models/settings.ts,src/types/settings.ts"
```

Options:

- `--objective <text>` - the scoped goal for this step. This is what the Conductor will hand to an executor as its brief.
- `--acceptance <text>` - a plain-language done-when check. Describes what "complete" looks like for this step.
- `--files <list>` - comma-separated file paths or globs the Conductor should treat as primary context for this step.
- `--json` - emit the created step as JSON.

### `vibe saga edit-step <taskId> <itemId>`

Edit fields of an existing step. At least one of `--text`, `--objective`, `--acceptance`, or `--files` is required.

```bash
vibe saga edit-step saga-abc123 item-001 --text "Update the settings model and its tests"
vibe saga edit-step saga-abc123 item-001 \
  --acceptance "TS compiles and all settings tests pass"
vibe saga edit-step saga-abc123 item-001 \
  --files "src/models/settings.ts,src/models/__tests__/settings.test.ts"
```

Options:

- `--text <t>` - replace the step's display text.
- `--objective <t>` - replace the step's scoped goal.
- `--acceptance <t>` - replace the done-when check.
- `--files <list>` - replace the comma-separated file hints.
- `--json` - emit the updated step as JSON.

### `vibe saga reorder <taskId> <orderedIds>`

Reorder the steps of a Saga. Pass the complete ordered list of item ids as a comma-separated string.

```bash
vibe saga reorder saga-abc123 "item-003,item-001,item-002"
vibe saga reorder saga-abc123 "item-003,item-001,item-002" --json
```

Options:

- `--json` - emit the new order as a JSON array of ids.

### `vibe saga list`

List all Saga tasks in the project.

```bash
vibe saga list
vibe saga list --json
```

Each row shows the saga id, title, and a `[done/total steps]` count. `--json` emits the full task array.

### `vibe saga show <id>`

Show a Saga and all its steps.

```bash
vibe saga show saga-abc123
vibe saga show saga-abc123 --json
```

The human-readable output prints the title, description (if any), step count, and each step in order with its status, objective, acceptance check, and file hints.

### `vibe saga sequence <id>`

Run a Saga: execute its steps in order through a per-item-review flow, in one worktree, committing one step at a time.

```bash
vibe saga sequence saga-abc123
```

Each step is planned, implemented, and reviewed (with a bounded self-heal loop) before the next begins, and starts with a fresh model context grounded by a curated packet (the feature goal, prior-step outcomes, the accumulated diff, and a fresh read of the step's file hints). The run is bounded by the Saga's budget (`maxSteps`, `maxSpendUsd`) and protected by a per-task run lock.

Between steps, a cheap **supervisor** turn judges whether to PROCEED or ESCALATE (halt because the work drifted off-goal), and records cross-cutting **invariants** that are re-injected into every later step so conventions do not drift. It is on by default; configure it under `saga.supervisor` in `project.yml`. See [Saga tasks](/docs/concepts/saga) for the full model.

If a step cannot pass review after self-heal, the Saga halts cleanly: the failed step's work is discarded so the branch stays reviewable, the step is left pending, and the run ends blocked with a reason. Fix the cause and re-run `vibe saga sequence` to resume - finished steps are skipped. A finished Saga lands as one reviewable branch and is never auto-merged.

`maxSpendUsd` is checked **between** steps, not mid-step; for an unattended Saga, set the project daily spend cap as the mid-step backstop.

### `vibe saga status <taskId>`

Show a Saga's live run state: its lifecycle (`idle` / `sequencing` / `paused` / `halted` / `done`), step progress with per-step outcomes, the run sequencing it right now (if any), the halt record, and the invariants ledger.

```bash
vibe saga status saga-abc123
vibe saga status saga-abc123 --json
```

Options:

- `--json` - emit the full status object (the same shape the dashboard's Conductor view reads).

### `vibe saga pause <taskId>` / `vibe saga resume <taskId>`

Pause or resume the run currently sequencing a Saga. `pause` requests a halt at the next step boundary; `resume` clears it. Both act on the live run (resolved from the per-task run lock), so there is nothing to pause when no run is sequencing. If a Saga is `halted`, there is no live run to resume - re-run `vibe saga sequence` to re-attempt from the clean tip.

```bash
vibe saga pause saga-abc123
vibe saga resume saga-abc123
```

## Machine-readable output

Every command accepts `--json`. The format matches the internal task/checklist schema and is stable for scripting.

## Dashboard parity

Sagas appear as compact container cards on the **Board** page in Mission Control. The task detail view is where you author step objectives, acceptance checks, and file hints - the same fields `vibe saga add-step` and `vibe saga edit-step` write. Reordering is available by drag in the detail view.

The detail view also shows the live **Conductor** panel, which mirrors `vibe saga status` and carries the controls: **Sequence** (or **Re-sequence** for a halted Saga), and **Pause** / **Resume** while a run is live. A dashboard launch goes through the same audited path as `vibe saga sequence`, so the two surfaces are at parity.

## What is coming next

The Conductor is complete (sequence, status, pause, resume, and the dashboard view). Still to come is the plan-only **Enhance** re-ground pass - the supervisor's reserved third verdict, which revises the pending steps against the current code before continuing.

## Related

- [Saga tasks](/docs/concepts/saga) - what a Saga is and how it differs from a plain task.
- [Task](/docs/concepts/task) - the base task concept.
- [CLI overview](/docs/cli/overview) - the shape of the `vibe` command.
