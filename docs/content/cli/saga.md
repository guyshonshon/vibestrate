---
title: vibe saga
description: Author Saga tasks - a task kind that holds coordinated, ordered steps you define once and sequence later.
section: cli
slug: cli/saga
---

`vibe saga` is the authoring surface for **Saga tasks** (`kind: "saga"`). A Saga is a task that holds an ordered set of steps, each with a scoped objective, a done-when check, and optional file hints. Author the steps now; sequencing them through a flow is handled by the **Conductor** (coming in a later release).

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

## Machine-readable output

Every command accepts `--json`. The format matches the internal task/checklist schema and is stable for scripting.

## Dashboard parity

Sagas appear as compact container cards on the **Board** page in Mission Control. The task detail view is where you author step objectives, acceptance checks, and file hints - the same fields `vibe saga add-step` and `vibe saga edit-step` write. Reordering is available by drag in the detail view.

## What is not here yet

Sequencing - running a Saga's steps as an autonomous, context-carrying flow - is the **Conductor**, a planned next phase. The authoring surface (`vibe saga`) is complete; the execution surface is not. Do not use `vibe tasks pickup` with a Saga and expect Conductor behavior; pickup runs the checklist items as independent flow runs without the cross-step context that the Conductor is designed to carry.

## Related

- [Saga tasks](/docs/concepts/saga) - what a Saga is and how it differs from a plain task.
- [Task](/docs/concepts/task) - the base task concept.
- [CLI overview](/docs/cli/overview) - the shape of the `vibe` command.
