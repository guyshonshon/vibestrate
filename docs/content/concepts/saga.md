---
title: Saga tasks
description: A task kind that holds coordinated, ordered steps - one card for a whole feature, with each step scoped and ready to be sequenced.
section: concepts
slug: concepts/saga
---

A **Saga** is a task with `kind: "saga"`. It holds an ordered set of steps, each with:

- a **text** label - what the step is called on the card,
- an **objective** - the scoped brief an executor will receive,
- an **acceptance check** - a plain-language done-when description,
- optional **file hints** - paths or globs that are primary context for that step.

A Saga is still a [Task](/docs/concepts/task): it lives on the board, can have a description, and uses the same id/status model. The difference is that a Saga is designed to hold the *full decomposition* of a feature in one place - not just a reminder, but enough context to eventually drive each step through a flow automatically.

## How it differs from a plain checklist

A plain task can have a checklist (via `vibe tasks checklist`). Those items are lightweight: a text label and a status. Saga steps go further: the objective and acceptance check are structured fields that the planned **Conductor** will use to brief each step's run and verify it finished correctly. The file hints narrow the scope so later steps get focused context, not the whole codebase.

If you just need a to-do list on a card, use a plain checklist. Use a Saga when the steps are distinct enough to eventually run independently - each with its own executor turn, its own review, and its own verdict.

## Authoring a Saga

Create the Saga, then add and refine its steps:

```bash
vibe saga create "Migrate settings handler to the new schema"
vibe saga add-step <sagaId> "Update the settings model" \
  --objective "Replace SettingsV1 with SettingsV2 in src/models/settings.ts" \
  --acceptance "TS compiles with zero errors on the model file" \
  --files "src/models/settings.ts"
vibe saga add-step <sagaId> "Update the settings routes"
vibe saga reorder <sagaId> "<step-id-1>,<step-id-2>"
```

The same authoring is available in Mission Control: Sagas render as container cards on the Board, and the task detail view lets you add, edit, and reorder steps.

Full command reference: [vibe saga](/docs/cli/saga).

## What is available now

The authoring surface - creating Sagas, adding and editing steps, reordering, listing, and showing - is complete as of v0.37.0. Steps are stored alongside the task in `.vibestrate/roadmap/tasks.json`.

## What is coming next - the Conductor

The autonomous **Conductor** is the planned next phase (not yet built). When it ships, it will:

- run each Saga step through a flow, in order,
- carry a bounded summary of each finished step forward as context for the next,
- use the step's objective as the executor's brief and the acceptance check as a verifier gate,
- surface step-by-step status and verdicts on the board.

Until the Conductor ships, a Saga is an authoring-only construct. You can see its steps and edit them; you cannot yet run the Saga as a coordinated sequence from the CLI or dashboard.

## Related

- [vibe saga](/docs/cli/saga) - the CLI reference for all saga commands.
- [Task](/docs/concepts/task) - the base task concept, including plain checklists.
- [Spec-up](/docs/concepts/spec-up) - the planning surface that can produce a roadmap of tasks (including Sagas).
