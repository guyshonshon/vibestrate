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

A plain task can have a checklist (via `vibe tasks checklist`). Those items are lightweight: a text label and a status. Saga steps go further: the objective and acceptance check are structured fields the **Conductor** uses to brief each step's run and verify it finished correctly. The file hints narrow the scope so later steps get focused context, not the whole codebase.

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

The Saga can run. `vibe saga sequence <id>` sequences the steps in order through a per-item-review flow in one worktree:

- each step is planned, implemented, and reviewed - with a bounded self-heal loop - before the next step starts, so a later step never builds on a broken earlier one,
- each step starts a **fresh model context** grounded by a **curated packet**: the feature goal, a compact ledger of prior-step outcomes, the accumulated diff so far, and a fresh read of the step's file hints,
- the Saga commits one step at a time to a single feature branch,
- it is bounded by a per-Saga budget (`maxSteps`, `maxSpendUsd`), checked between steps, and protected by a per-task run lock. A new Saga inherits a default step ceiling (`maxSteps: 20`) so a runaway always halts; set project-wide defaults under `saga` in `project.yml` (the per-task budget overrides them where set).

If a step cannot pass its review after self-heal, the Saga **halts cleanly**: the failed step's work is discarded (the branch stays reviewable), the step is left pending, and the run ends blocked with a reason. Fix the cause and re-run `vibe saga sequence` - finished steps are skipped, so it resumes from the clean tip. A finished Saga lands as one reviewable branch; it is never auto-merged.

## What is coming next

The execution core is in. Still to come: a between-steps **supervisor** turn (a cheap model judging proceed / escalate and maintaining a non-folding invariants ledger that prevents convention drift across steps), a live **Conductor view** in the dashboard (current step, its phases, an escalation banner) with launch / pause / resume controls, and the plan-only **Enhance** re-ground pass.

## Related

- [vibe saga](/docs/cli/saga) - the CLI reference for all saga commands.
- [Task](/docs/concepts/task) - the base task concept, including plain checklists.
- [Spec-up](/docs/concepts/spec-up) - the planning surface that can produce a roadmap of tasks (including Sagas).
