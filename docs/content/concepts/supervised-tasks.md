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

You pick the mode when you make the card: on the dashboard's **Board** page, **New task** carries a dropdown with **Plain run** and **Supervised (steps)**.

Supervised is for work that is several changes wearing one title: a migration with four stages, a feature with a backend half and a frontend half.

<div class="docs-callout tip">

**Tip.** Reach for supervised when a single diff would be too big to review honestly. The point is not more automation, it is smaller units a human can actually check one at a time.

</div>

<div class="docs-callout">

**Did you know?** Between steps the supervisor asks one question: is this still on track? Proceed, and the next step starts. Escalate, and the task halts cleanly with the committed work kept. Rewriting the steps that have not run yet is a different pass with its own turn, which is how a supervised task survives a step turning out differently than planned instead of marching the rest into a stale assumption.

</div>


## On the Board and the task card

`vibe ui` opens the dashboard on `127.0.0.1:4317`. **Board** is in the sidebar.

A supervised card is drawn differently: a `supervised` chip, a done-over-total
step count, and a pip per step, so the shape of the sequence reads from the
column. The task page then carries two things a plain task does not.

The **Checklist** section is where the steps are authored, drag to reorder. **Add
a step manually** opens a form that, on a supervised task, asks for three fields
a plain checklist item has no use for: **Objective**, **Acceptance check** and
**File hints**. **Enhance** on the section header drafts a checklist for you,
read-only, with **Add all** or **Dismiss** - it shares a name with the
Conductor's ENHANCE verdict below but is a different thing: this one proposes
steps for a card, that one revises a pending plan mid-sequence.

The **Conductor** panel is the live view: the lifecycle word, tiles for **steps
done**, **invariants** and the **live run**, the step list with each outcome
summary, the supervisor's decisions, the invariants ledger, and a halt banner
with its reason. Controls are **Sequence** when nothing is running,
**Re-sequence** once it has halted, **Pause** / **Resume** while a run is live.

A dashboard launch takes the same audited queue and scheduler path the CLI uses,
inheriting the supervised flow, budget, supervisor, run lock and clean-halt
semantics.

## Leaving it running

Queueing work already starts it: `vibe queue add <taskId>` spawns a scheduler if none is listening, records the spawn and its exit, and derives whether it is alive rather than assuming. So a machine you leave on keeps working through the queue with nobody watching.

What it does not survive is a **reboot** - the scheduler is a child of whoever started it. `vibe queue service` prints a launchd (macOS) or systemd (Linux) unit that brings it back:

```bash
vibe queue service --out ~/Library/LaunchAgents/com.vibestrate.scheduler.myproject.plist
launchctl load -w ~/Library/LaunchAgents/com.vibestrate.scheduler.myproject.plist
```

The unit is per project, and the command prints the line that undoes it beside the line that enables it.

<div class="docs-callout warn">

**Vibestrate does not install it.** Writing into `~/Library/LaunchAgents` or `~/.config/systemd` changes how your machine boots, and that is your decision rather than a step in a setup script. The unit is printed; you save and load it.

It also deliberately does not respawn forever - launchd `KeepAlive` is unset and systemd uses `Restart=on-failure`. The scheduler already restarts itself when work is queued, and an unconditional respawn would turn one unparseable config into a machine busy-looping all night.

</div>

An unattended run with no budget ceiling and no confinement is warned about before it starts, because that combination has nothing to stop it automatically. See [Safety](/docs/concepts/safety).

## Plain vs supervised

A plain task with a checklist is a lightweight to-do list run in one pass. A
supervised one treats the objective and acceptance check as structured fields:
the Conductor briefs each step's run from them and verifies the step before the
next starts, with file hints narrowing its context. Use it when the steps are
distinct enough to run independently, each with its own executor turn, review
and verdict.

Choosing supervised turns on the whole bundle: per-step review, the supervisor,
Enhance, the per-task budget, the run lock, and clean-halt.

## How a sequence goes

The steps run in order, through a per-item-review flow, in one worktree:

- each step is planned, implemented, and reviewed - with a bounded self-heal loop -
  before the next step starts, so a later step never builds on a broken earlier one,
- each step starts a **fresh model context** grounded by a **curated packet**: the
  feature goal, a compact ledger of prior-step outcomes, the accumulated diff so
  far, and a fresh read of the step's file hints,
- the supervised task commits one step at a time to a single feature branch,
- it is bounded by the supervised task's own budget (`maxSteps`, `maxSpendUsd`),
  checked between steps, and protected by a per-task run lock.

A new supervised task inherits a step ceiling (`maxSteps: 20`), so a runaway
always halts. Project-wide defaults live under `supervised` in `project.yml`,
editable on the **Config** page under **Supervised runs**; the per-task budget
overrides them where set. The spend checkpoint is off by default.

A step that cannot pass its review after self-heal **halts the task cleanly**:
the failed step's work is discarded (the branch stays reviewable), the step is
left pending, and the run ends blocked with a reason. Fix the cause and press
**Re-sequence** - finished steps are skipped, so it picks up from the clean tip.

## The supervisor and the invariants ledger

Between steps, after each commits cleanly, a cheap **supervisor** turn judges
whether the task is still on track. Its prompt asks for one of two verdicts; the
Conductor understands a third and answers it by handing off:

<svg font-family="var(--font-sans)" viewBox="0 0 560 132" width="100%" style="max-width:720px;height:auto" role="img" aria-label="The verdicts the Conductor acts on: proceed, and the next step starts; enhance, which hands off to the separate re-ground pass; or escalate, which halts the task and keeps the committed work.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="46" width="122" height="40" rx="8"/>
    <rect fill="var(--bg-200)" x="196" y="4" width="362" height="36" rx="8"/>
    <rect fill="var(--bg-200)" x="196" y="48" width="362" height="36" rx="8"/>
    <rect fill="var(--bg-200)" x="196" y="92" width="362" height="36" rx="8"/>
    <path d="M124 66 H158 M158 22 V110 M158 22 H188 M158 66 H188 M158 110 H188"/>
  </g>
  <g fill="var(--fg-300)">
    <path d="M194 22 L187 18.5 L187 25.5 Z"/>
    <path d="M194 66 L187 62.5 L187 69.5 Z"/>
    <path d="M194 110 L187 106.5 L187 113.5 Z"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="20" y="71">supervisor</text>
    <text x="212" y="27">PROCEED</text>
    <text x="212" y="71">ENHANCE</text>
    <text x="212" y="115">ESCALATE</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11">
    <text x="300" y="27">carry on to the next step</text>
    <text x="300" y="71">hand off to the re-ground pass</text>
    <text x="300" y="115">halt, and keep the committed work</text>
  </g>
</svg>

ESCALATE is for work that has drifted off the feature goal, or an earlier step
that is irrecoverably wrong. Unlike a failed-step halt it keeps the committed
work: the completed steps are sound, the *direction* went wrong.

The supervisor never edits the plan. It returns a word, and ENHANCE is where it
stops and the re-ground pass below starts - a second turn with its own prompt,
authority rules and spend line.

It is advisory on top of the per-step review, which already gates correctness, so
a failed or unparseable supervisor turn never halts a healthy task. It runs on a
cheap profile with no write grant, judging from the prompt rather than from
editing - that withholds writing, it does not harden the CLI to read-only, and
the working directory is inside the worktree, so a tool-capable model can still
read from there. Its cost counts toward the task budget and the daily spend cap.

It also maintains the **invariants ledger**: a small, append-only list of
cross-cutting decisions ("all API responses use snake_case") re-injected into
*every* later step's packet. That is the fix for convention drift - the compact
outcome ledger folds details away over many steps, but an invariant set in step 2
still holds in step 9. Redacted and bounded like every packet section, and shown
in full on the Conductor panel.

On by default. Configure it under `supervised.supervisor`: point `profile` at a
cheap model, or set `enabled: false` to turn it off.

## Re-grounding the plan (Enhance)

A supervised task's steps are authored *before* the code exists, so the deeper a
long one runs, the more its early plan was a guess about a codebase that has
changed under it.

When the supervisor judges the pending plan has diverged from reality, it returns
**ENHANCE** and the Conductor runs a **plan-only** re-ground pass before the next
step: re-read the current code, then sharpen a pending step's objective, drop one
no longer needed, or resequence them. It never writes code, and never touches
steps already done - those are immutable history.

The autonomous pass may **refine**, **reorder** or **remove** pending steps. It
may **not add a new step**, and **not remove a step you authored**: either is a
structural change to the plan's scope, so the task **escalates** it to you - a
clean halt that keeps the committed work - rather than deciding it itself.

The revised plan is held in a supervised-run overlay and applied atomically, so it
survives a halt-and-re-sequence, and on clean completion folds back into the
task's steps. The Enhance turn runs on the same cheap profile as the supervisor
and under the same terms - no write grant, working directory inside the worktree
- and is spend-accounted the same way.

## From a terminal

The automation path. Every Conductor control has a command behind it:

```bash
vibe tasks add "Add audit logging" --supervised
vibe tasks checklist add <id> "Write the writer" \
  --objective "..." --acceptance "..." \
  --files "src/audit/*.ts"

vibe tasks sequence <id>   # Sequence
vibe tasks status <id>     # steps, invariants, halt
vibe tasks pause <id>      # between steps
vibe tasks resume <id>     # clear a pause, or re-sequence a halted task
```

`vibe tasks run <id>` works too, delegating to `sequence` for a supervised task.
Full reference and a worked example: [vibe tasks](/docs/cli/supervised-tasks).

`vibe shell`'s **Roadmap** page lists and runs tasks but has no Conductor view;
step-level state is the dashboard or `vibe tasks status`.

## What it does not do yet

Enhance runs only when the supervisor calls for it, between steps, and the
supervisor's own prompt asks for PROCEED or ESCALATE without naming ENHANCE - so
the pass is reached only when a model offers the word unprompted. There is no way
to trigger a re-ground on demand, and no dry-run diff of a revision before it
applies. Adding a step stays a manual edit to the checklist.

## Related

- [vibe tasks](/docs/cli/supervised-tasks) - the CLI reference for all supervised-task commands.
- [Task](/docs/concepts/task) - the base task concept, including plain checklists.
- [Spec-up](/docs/concepts/spec-up) - the planning surface that can produce a roadmap of tasks (including Supervised tasks).
