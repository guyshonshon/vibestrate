---
title: Supervised tasks (run modes)
description: A task has steps and a run mode - plain (one pass) or supervised (the Conductor sequences each step with its own review). One card for a whole feature.
section: concepts
slug: concepts/supervised-tasks
---

There is no separate "saga" kind of task. A [Task](/docs/concepts/task) has an
ordered set of **steps**, and a **run mode** that decides how those steps run:

- **plain** - the default flow runs the task in one holistic pass.
- **supervised** - the **Conductor** sequences the steps one at a time, each with
  its own review (and the supervisor, invariants, Enhance, budget, and clean-halt
  described below). A single-step task is just the degenerate case.

Each step carries:

- a **text** label - what the step is called on the card,
- an **objective** - the scoped brief an executor will receive,
- an **acceptance check** - a plain-language done-when description,
- optional **file hints** - paths or globs that are primary context for that step.

## Plain vs supervised

A plain task with a checklist is a lightweight to-do list run in one pass.
A **supervised** task uses the objective + acceptance check as structured fields
the Conductor uses to brief each step's run and verify it before the next one
starts; the file hints narrow each step's context. Use supervised when the steps
are distinct enough to run independently - each with its own executor turn, its
own review, and its own verdict. Flipping a task to supervised turns on the whole
bundle (per-step review, the supervisor, Enhance, the per-task budget, the run
lock, clean-halt).

## Authoring a supervised task

Create the task as supervised, then add and refine its steps:

```bash
vibe tasks add "Migrate settings handler to the new schema" --supervised
vibe tasks checklist add <id> "Update the settings model" \
  --objective "Replace SettingsV1 with SettingsV2 in src/models/settings.ts" \
  --acceptance "TS compiles with zero errors on the model file" \
  --files "src/models/settings.ts"
vibe tasks checklist add <id> "Update the settings routes"
vibe tasks checklist move <id> "<step-id>" <position>
```

The same authoring is available in Mission Control: a supervised task renders as a
container card on the Board, and the task detail view lets you add, edit, and
reorder steps.

Full command reference: [vibe tasks](/docs/cli/supervised-tasks).

## What is available now

A supervised task runs with `vibe tasks run <id>` (or `vibe tasks sequence <id>`),
which sequences the steps in order through a per-item-review flow in one worktree:

- each step is planned, implemented, and reviewed - with a bounded self-heal loop - before the next step starts, so a later step never builds on a broken earlier one,
- each step starts a **fresh model context** grounded by a **curated packet**: the feature goal, a compact ledger of prior-step outcomes, the accumulated diff so far, and a fresh read of the step's file hints,
- the supervised task commits one step at a time to a single feature branch,
- it is bounded by a per-supervised task budget (`maxSteps`, `maxSpendUsd`), checked between steps, and protected by a per-task run lock. A new supervised task inherits a default step ceiling (`maxSteps: 20`) so a runaway always halts; set project-wide defaults under `supervised` in `project.yml` (the per-task budget overrides them where set).

If a step cannot pass its review after self-heal, the supervised task **halts cleanly**: the failed step's work is discarded (the branch stays reviewable), the step is left pending, and the run ends blocked with a reason. Fix the cause and re-run `vibe tasks run` - finished steps are skipped, so it resumes from the clean tip. A finished supervised task lands as one reviewable branch; it is never auto-merged.

## The supervisor and the invariants ledger

Between steps, after each one commits cleanly, a cheap **supervisor** turn judges whether the supervised task is still on track. It returns one of three verdicts: **PROCEED** to continue, **ENHANCE** to re-ground the pending plan first (see below), or **ESCALATE** to halt - used when the work has drifted off the feature goal or an earlier step is irrecoverably wrong. An ESCALATE halt keeps the committed work (unlike a failed-step halt, which resets), because the completed steps are sound; it is the *direction* that went wrong. The supervisor is advisory on top of the per-step review, which already gates correctness, so a failed or unparseable supervisor turn never halts a healthy supervised task. It runs read-only on a cheap profile, and its cost counts toward the supervised task budget and the daily spend cap like any other turn.

The supervisor also maintains the **invariants ledger**: a small, append-only list of cross-cutting decisions ("all API responses use snake_case") that is re-injected into *every* later step's packet. This is the fix for convention drift - the compact outcome ledger folds details away over many steps, but an invariant set in step 2 still holds in step 9. The ledger is redacted and bounded like every packet section.

The supervisor is on by default. Configure it under `supervised.supervisor` in `project.yml`: point `profile` at a cheap model, or set `enabled: false` to turn it off.

## Re-grounding the plan (Enhance)

A supervised task's steps are authored *before* the code exists, so the deeper a long supervised task runs, the more its early plan was a guess about a codebase that has since changed under it. When the supervisor judges the pending plan has diverged from reality, it returns **ENHANCE** and the Conductor runs a **plan-only** re-ground pass before the next step: it re-reads the current code and revises the *pending* steps - sharpening a step's objective, dropping one that is no longer needed, or resequencing them. It never writes code and never touches steps already done (those are immutable history).

Enhance is deliberately bounded in what it may do on its own. The autonomous pass may **refine**, **reorder**, or **remove** pending steps, but it may **not add a new step** and may **not remove a step you authored** - either is a structural change to the plan's scope, so the supervised task **escalates** that to you (a clean halt that keeps the committed work) rather than deciding it itself. Adding steps stays an owner decision.

The revised plan is held in a supervised-run overlay and applied atomically, so it survives a halt-and-re-sequence (the Conductor continues the revised plan) without disturbing how a supervised task resumes. On clean completion the revisions are folded back into the supervised task's steps. The Enhance turn runs read-only on the same cheap profile as the supervisor and is spend-accounted the same way.

## Driving a supervised task from the dashboard

Mission Control's task detail view shows a live **Conductor** panel for a supervised task: its lifecycle, step progress with per-step outcomes, the supervisor's decisions, the Enhance re-ground events, the invariants ledger, and an escalation banner when it halts. The controls reach full parity with the CLI - **Sequence** to launch (or **Re-sequence** to resume a halted supervised task from the clean tip), and **Pause** / **Resume** while a run is live. A dashboard launch goes through the same audited path as the CLI, so it inherits the supervised flow, budget, supervisor, run lock, and clean-halt semantics.

## What is coming next

The Conductor and its autonomous Enhance pass are complete. Still to come is a **manual** Enhance trigger - a way to run the re-ground pass on demand between sequences (and add a step the autonomous pass would escalate), with a dry-run diff to review before it applies.

## Related

- [vibe tasks](/docs/cli/supervised-tasks) - the CLI reference for all supervised-task commands.
- [Task](/docs/concepts/task) - the base task concept, including plain checklists.
- [Spec-up](/docs/concepts/spec-up) - the planning surface that can produce a roadmap of tasks (including Supervised tasks).
