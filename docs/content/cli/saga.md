---
title: vibe tasks (supervised runs)
description: Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.
section: cli
slug: cli/saga
---

`vibe tasks` manages tasks, including **supervised** ones (`runMode: "supervised"`). A supervised task holds an ordered set of steps, each with a scoped objective, a done-when check, and optional file hints. Author the steps, then sequence them through a flow with `vibe tasks run` (the **Conductor**).

See [supervised tasks](/docs/concepts/saga) for the concept.

## Commands

### `vibe tasks add --supervised <title>`

Create a new supervised task.

```bash
vibe tasks add --supervised "Migrate settings handler to the new schema"
vibe tasks add --supervised "Migrate settings handler to the new schema" -d "Covers the three affected tables."
vibe tasks add --supervised "Migrate settings handler to the new schema" --json
```

Options:

- `-d, --description <text>` - longer description attached to the supervised task card.
- `--json` - emit the created task as JSON instead of the human-readable summary.

### `vibe tasks checklist add <taskId> <text>`

Add a step to an existing supervised task.

```bash
vibe tasks checklist add saga-abc123 "Update the settings model"
vibe tasks checklist add saga-abc123 "Update the settings model" \
  --objective "Replace the old SettingsV1 type with SettingsV2 in src/models/settings.ts" \
  --acceptance "TS compiles with zero errors on the model file" \
  --files "src/models/settings.ts,src/types/settings.ts"
```

Options:

- `--objective <text>` - the scoped goal for this step. This is what the Conductor will hand to an executor as its brief.
- `--acceptance <text>` - a plain-language done-when check. Describes what "complete" looks like for this step.
- `--files <list>` - comma-separated file paths or globs the Conductor should treat as primary context for this step.
- `--json` - emit the created step as JSON.

### Editing and reordering steps

Edit a step's display text with `vibe tasks checklist edit <taskId> <itemId> <text>`, and reorder steps one at a time with `vibe tasks checklist move <taskId> <itemId> <position>`. To revise a step's structured fields (objective / acceptance check / file hints) from the CLI, re-add the step with the flags above, or edit them inline in the task detail view in Mission Control.

### `vibe tasks list` / `vibe tasks show <id>`

`vibe tasks list` lists the project's tasks (each row shows id, title, and a `[done/total steps]` count); `vibe tasks show <id>` prints one task with each step in order - its status, objective, acceptance check, and file hints. Both accept `--json`.

### `vibe tasks run <id>`

Run a supervised task: execute its steps in order through a per-item-review flow, in one worktree, committing one step at a time.

```bash
vibe tasks run saga-abc123
```

Each step is planned, implemented, and reviewed (with a bounded self-heal loop) before the next begins, and starts with a fresh model context grounded by a curated packet (the feature goal, prior-step outcomes, the accumulated diff, and a fresh read of the step's file hints). The run is bounded by the supervised task's budget (`maxSteps`, `maxSpendUsd`) and protected by a per-task run lock.

Between steps, a cheap **supervisor** turn judges whether to PROCEED, ENHANCE, or ESCALATE (halt because the work drifted off-goal), and records cross-cutting **invariants** that are re-injected into every later step so conventions do not drift. It is on by default; configure it under `supervised.supervisor` in `project.yml`. See [supervised tasks](/docs/concepts/saga) for the full model.

If a step cannot pass review after self-heal, the supervised task halts cleanly: the failed step's work is discarded so the branch stays reviewable, the step is left pending, and the run ends blocked with a reason. Fix the cause and re-run `vibe tasks run` to resume - finished steps are skipped. A finished supervised task lands as one reviewable branch and is never auto-merged.

`maxSpendUsd` is checked **between** steps, not mid-step; for an unattended supervised task, set the project daily spend cap as the mid-step backstop.

### `vibe tasks status <taskId>`

Show a supervised task's live run state: its lifecycle (`idle` / `sequencing` / `paused` / `halted` / `done`), step progress with per-step outcomes, the run sequencing it right now (if any), the halt record, and the invariants ledger.

```bash
vibe tasks status saga-abc123
vibe tasks status saga-abc123 --json
```

Options:

- `--json` - emit the full status object (the same shape the dashboard's Conductor view reads).

### `vibe tasks pause <taskId>` / `vibe tasks resume <taskId>`

Pause or resume the run currently sequencing a supervised task. `pause` requests a halt at the next step boundary; `resume` clears it. Both act on the live run (resolved from the per-task run lock), so there is nothing to pause when no run is sequencing. If a supervised task is `halted`, there is no live run to resume - re-run `vibe tasks run` to re-attempt from the clean tip.

```bash
vibe tasks pause saga-abc123
vibe tasks resume saga-abc123
```

## Machine-readable output

Every command accepts `--json`. The format matches the internal task/checklist schema and is stable for scripting.

## Dashboard parity

Supervised tasks appear as compact container cards on the **Board** page in Mission Control. The task detail view is where you author step objectives, acceptance checks, and file hints - the same fields `vibe tasks checklist add` and `vibe tasks edit-step` write. Reordering is available by drag in the detail view.

The detail view also shows the live **Conductor** panel, which mirrors `vibe tasks status` and carries the controls: **Sequence** (or **Re-sequence** for a halted supervised task), and **Pause** / **Resume** while a run is live. A dashboard launch goes through the same audited path as `vibe tasks run`, so the two surfaces are at parity.

## What is coming next

The Conductor is complete, including the autonomous **Enhance** re-ground pass (the supervisor's third verdict, which revises the pending steps against the current code before continuing). Still to come is a *manual* Enhance trigger - running the re-ground on demand between runs, with a dry-run diff to review.

## Related

- [supervised tasks](/docs/concepts/saga) - what a supervised task is and how it differs from a plain task.
- [Task](/docs/concepts/task) - the base task concept.
- [CLI overview](/docs/cli/overview) - the shape of the `vibe` command.
