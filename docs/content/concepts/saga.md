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

## The supervisor and the invariants ledger

Between steps, after each one commits cleanly, a cheap **supervisor** turn judges whether the Saga is still on track. It returns one of three verdicts: **PROCEED** to continue, **ENHANCE** to re-ground the pending plan first (see below), or **ESCALATE** to halt - used when the work has drifted off the feature goal or an earlier step is irrecoverably wrong. An ESCALATE halt keeps the committed work (unlike a failed-step halt, which resets), because the completed steps are sound; it is the *direction* that went wrong. The supervisor is advisory on top of the per-step review, which already gates correctness, so a failed or unparseable supervisor turn never halts a healthy Saga. It runs read-only on a cheap profile, and its cost counts toward the Saga budget and the daily spend cap like any other turn.

The supervisor also maintains the **invariants ledger**: a small, append-only list of cross-cutting decisions ("all API responses use snake_case") that is re-injected into *every* later step's packet. This is the fix for convention drift - the compact outcome ledger folds details away over many steps, but an invariant set in step 2 still holds in step 9. The ledger is redacted and bounded like every packet section.

The supervisor is on by default. Configure it under `saga.supervisor` in `project.yml`: point `profile` at a cheap model, or set `enabled: false` to turn it off.

## Re-grounding the plan (Enhance)

A Saga's steps are authored *before* the code exists, so the deeper a long Saga runs, the more its early plan was a guess about a codebase that has since changed under it. When the supervisor judges the pending plan has diverged from reality, it returns **ENHANCE** and the Conductor runs a **plan-only** re-ground pass before the next step: it re-reads the current code and revises the *pending* steps - sharpening a step's objective, dropping one that is no longer needed, or resequencing them. It never writes code and never touches steps already done (those are immutable history).

Enhance is deliberately bounded in what it may do on its own. The autonomous pass may **refine**, **reorder**, or **remove** pending steps, but it may **not add a new step** and may **not remove a step you authored** - either is a structural change to the plan's scope, so the Saga **escalates** that to you (a clean halt that keeps the committed work) rather than deciding it itself. Adding steps stays an owner decision.

The revised plan is held in a saga-scoped overlay and applied atomically, so it survives a halt-and-re-sequence (the Conductor continues the revised plan) without disturbing how a Saga resumes. On clean completion the revisions are folded back into the Saga's steps. The Enhance turn runs read-only on the same cheap profile as the supervisor and is spend-accounted the same way.

## Driving a Saga from the dashboard

Mission Control's task detail view shows a live **Conductor** panel for a Saga: its lifecycle, step progress with per-step outcomes, the supervisor's decisions, the Enhance re-ground events, the invariants ledger, and an escalation banner when it halts. The controls reach full parity with the CLI - **Sequence** to launch (or **Re-sequence** to resume a halted Saga from the clean tip), and **Pause** / **Resume** while a run is live. A dashboard launch goes through the same audited path as the CLI, so it inherits the saga flow, budget, supervisor, run lock, and clean-halt semantics.

## What is coming next

The Conductor and its autonomous Enhance pass are complete. Still to come is a **manual** Enhance trigger - a way to run the re-ground pass on demand between sequences (and add a step the autonomous pass would escalate), with a dry-run diff to review before it applies.

## Related

- [vibe saga](/docs/cli/saga) - the CLI reference for all saga commands.
- [Task](/docs/concepts/task) - the base task concept, including plain checklists.
- [Spec-up](/docs/concepts/spec-up) - the planning surface that can produce a roadmap of tasks (including Sagas).
