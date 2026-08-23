---
title: Supervised tasks
description: A task with ordered steps, sequenced one at a time by the Conductor instead of run in one pass.
slug: concepts/supervised-tasks
---

## In simple words

There is no separate "saga" kind of task. A [[task]] has an ordered set of **steps** and a **run mode** deciding how they run:

<div class="docs-cards">

**plain**
The default. The flow runs the whole task in one holistic pass.

**supervised**
The **Conductor** sequences the steps one at a time, each with its own review.

</div>

Supervised is for work that is genuinely several changes wearing one title: a migration with four stages, a feature with a backend half and a frontend half.

<div class="docs-callout tip">

**Tip.** Reach for supervised when a single diff would be too big to review honestly. The point is not more automation, it is smaller units of work that a human can actually check one at a time.

</div>

<div class="docs-callout">

**Did you know?** Between steps the supervisor returns one of three verdicts: proceed, and the next step starts; re-plan, and the remaining steps are rewritten against what the last one actually did; or stop. That middle one is why a supervised task can survive a step turning out differently than planned, instead of marching the rest of the sequence into a stale assumption.

</div>


## Going deeper

### Plain vs supervised

A plain task with a checklist is a lightweight to-do list, run in one pass.

A **supervised** task uses the objective and the acceptance check as structured
fields: the Conductor briefs each step's run from them, and verifies the step
before the next one starts. The file hints narrow each step's context.

Use supervised when the steps are distinct enough to run independently - each
with its own executor turn, its own review, and its own verdict.

Flipping a task to supervised turns on the whole bundle: per-step review, the
supervisor, Enhance, the per-task budget, the run lock, and clean-halt.

### Authoring a supervised task

Create the task as supervised, then add each step with its objective, acceptance
check, and file hints.

The same authoring is available in Mission Control. A supervised task renders as
a container card on the Board, and the task detail view lets you add, edit, and
reorder steps.

```bash
vibe tasks add "Add audit logging" --supervised
vibe tasks checklist add <id> "Write the writer" \
  --objective "..." --acceptance "..." \
  --files "src/audit/*.ts"

vibe tasks sequence <id>   # run the steps in order
vibe tasks status <id>     # steps, invariants, halt
vibe tasks pause <id>      # between steps
vibe tasks resume <id>     # clear the pause
```

`vibe tasks run <id>` works too - it delegates to `sequence` for a supervised
task. Full command reference and a worked example:
[vibe tasks](/docs/cli/supervised-tasks).

### How a sequence goes

The steps run in order, through a per-item-review flow, in one worktree:

- each step is planned, implemented, and reviewed - with a bounded self-heal loop -
  before the next step starts, so a later step never builds on a broken earlier one,
- each step starts a **fresh model context** grounded by a **curated packet**: the
  feature goal, a compact ledger of prior-step outcomes, the accumulated diff so
  far, and a fresh read of the step's file hints,
- the supervised task commits one step at a time to a single feature branch,
- it is bounded by the supervised task's own budget (`maxSteps`, `maxSpendUsd`),
  checked between steps, and protected by a per-task run lock.

A new supervised task inherits a default step ceiling (`maxSteps: 20`), so a
runaway always halts. Set project-wide defaults under `supervised` in
`project.yml`; the per-task budget overrides them where set.

If a step cannot pass its review after self-heal, the supervised task **halts
cleanly**: the failed step's work is discarded (the branch stays reviewable), the
step is left pending, and the run ends blocked with a reason.

Fix the cause and re-sequence - finished steps are skipped, so it picks up from
the clean tip.

### The supervisor and the invariants ledger

Between steps, after each one commits cleanly, a cheap **supervisor** turn judges
whether the supervised task is still on track. It returns one of three verdicts:

<svg viewBox="0 0 560 132" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Between steps the supervisor returns one of three verdicts: proceed, and the next step starts; enhance, and the pending plan is re-grounded first; or escalate, which halts the task and keeps the committed work.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="46" width="122" height="40" rx="8"/>
    <rect x="196" y="4" width="362" height="36" rx="8"/>
    <rect x="196" y="48" width="362" height="36" rx="8"/>
    <rect x="196" y="92" width="362" height="36" rx="8"/>
    <path d="M124 66 H158 M158 22 V110 M158 22 H188 M158 66 H188 M158 110 H188"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M194 22 L187 18.5 L187 25.5 Z"/>
    <path d="M194 66 L187 62.5 L187 69.5 Z"/>
    <path d="M194 110 L187 106.5 L187 113.5 Z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="20" y="71">supervisor</text>
    <text x="212" y="27">PROCEED</text>
    <text x="212" y="71">ENHANCE</text>
    <text x="212" y="115">ESCALATE</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="300" y="27">carry on to the next step</text>
    <text x="300" y="71">re-ground the pending plan first</text>
    <text x="300" y="115">halt, and keep the committed work</text>
  </g>
</svg>

ENHANCE re-grounds the pending plan before the next step, which the section below covers. ESCALATE is for work that has drifted off the feature goal, or an earlier step that is irrecoverably wrong.

An ESCALATE halt keeps the committed work, unlike a failed-step halt, which
resets. The completed steps are sound; it is the *direction* that went wrong.

The supervisor is advisory on top of the per-step review, which already gates
correctness, so a failed or unparseable supervisor turn never halts a healthy
supervised task.

The supervisor turn runs read-only on a cheap profile. Its cost counts toward the
supervised task budget and the daily spend cap like any other turn.

The supervisor also maintains the **invariants ledger**: a small, append-only list
of cross-cutting decisions ("all API responses use snake_case") that is
re-injected into *every* later step's packet.

This is the fix for convention drift. The compact outcome ledger folds details
away over many steps, but an invariant set in step 2 still holds in step 9. The
ledger is redacted and bounded like every packet section.

The supervisor is on by default. Configure it under `supervised.supervisor` in
`project.yml`: point `profile` at a cheap model, or set `enabled: false` to turn
it off.

### Re-grounding the plan (Enhance)

A supervised task's steps are authored *before* the code exists. The deeper a long
supervised task runs, the more its early plan was a guess about a codebase that
has since changed under it.

When the supervisor judges the pending plan has diverged from reality, it returns
**ENHANCE** and the Conductor runs a **plan-only** re-ground pass before the next
step. That pass re-reads the current code and revises the *pending* steps:
sharpening a step's objective, dropping one that is no longer needed, or
resequencing them.

It never writes code, and it never touches steps already done - those are
immutable history.

Enhance is deliberately bounded in what it may do on its own. The autonomous pass
may **refine**, **reorder**, or **remove** pending steps.

It may **not add a new step**, and it may **not remove a step you authored**.
Either is a structural change to the plan's scope, so the supervised task
**escalates** it to you - a clean halt that keeps the committed work - rather than
deciding it itself. Adding steps stays an owner decision.

The revised plan is held in a supervised-run overlay and applied atomically, so it
survives a halt-and-re-sequence: the Conductor continues the revised plan without
disturbing how a supervised task resumes. On clean completion the revisions are
folded back into the supervised task's steps.

The Enhance turn runs read-only on the same cheap profile as the supervisor, and
is spend-accounted the same way.

### Driving a supervised task from the dashboard

Mission Control's task detail view shows a live **Conductor** panel for a
supervised task. The panel carries:

- its lifecycle, and step progress with per-step outcomes,
- the supervisor's decisions and the Enhance re-ground events,
- the invariants ledger,
- an escalation banner when it halts.

The controls reach full parity with the CLI: **Sequence** to launch, or
**Re-sequence** to resume a halted supervised task from the clean tip, and
**Pause** / **Resume** while a run is live.

A dashboard launch goes through the same audited path as the CLI, so it inherits
the supervised flow, budget, supervisor, run lock, and clean-halt semantics.

### What it does not do yet

Enhance runs only when the supervisor calls for it, between steps. There is no way
to trigger a re-ground pass on demand between sequences, and no dry-run diff of a
proposed revision before it applies.

Adding a step is a change the autonomous pass escalates rather than making, so it
stays a manual edit to the checklist.

### Related

- [vibe tasks](/docs/cli/supervised-tasks) - the CLI reference for all supervised-task commands.
- [Task](/docs/concepts/task) - the base task concept, including plain checklists.
- [Spec-up](/docs/concepts/spec-up) - the planning surface that can produce a roadmap of tasks (including Supervised tasks).
