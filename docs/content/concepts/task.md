---
title: Task
description: The thing you ask Vibestrate to do - a plain-language brief that kicks off a full plan, build, review, verify run.
section: concepts
slug: concepts/task
---

# Task

A **Task** is the thing you ask Vibestrate to do, written in plain language - the
way you'd brief a capable colleague. You say *what* you want; Vibestrate works out
the steps.

```bash
vibe run "Add structured logging to the settings save handler"
```

That one line is a complete Task. You don't tell it which files to open or in what
order to work - that's the [Flow](/docs/concepts/flow)'s job, and your **Crew**
does the actual work (see [the big picture](/docs/getting-started/big-picture) for
how Flow and Crew fit together). The Task is just the brief.

## What the orchestrator does with it

The moment you submit a Task, the **orchestrator** turns it into a *run* - a
single supervised process you can watch and audit. In order, it:

1. **Reads your project** - language, package manager, and the validation commands
   it will trust later.
2. **Picks the recipe and the team** - resolves the [Flow](/docs/concepts/flow)
   (the default one unless you choose another) and matches its seats to the Roles
   on your Crew.
3. **Opens an isolated workspace** - a fresh git
   [worktree](/docs/concepts/worktree), so nothing it does touches your real
   project until you say so.
4. **Drives the stages** - plan, build, validate, review, fix, verify - handing
   each step's output to the next, and looping back through *fix* when the review
   asks for changes, up to a set limit.
5. **Stops at a clear verdict** - `merge_ready`, `blocked`, or `failed`. It never
   pushes and never merges. You decide what happens to the diff.

Everything it does along the way is written under `.vibestrate/runs/<runId>/` -
every prompt, output, metric, and decision - so a finished run is something you
can read back, not a black box. (The full status list is in
[Run state](/docs/concepts/state); the stage-by-stage path is in
[Workflow](/docs/concepts/workflow).)

The point worth holding onto: **you commit one thing - the Task - and the
orchestrator commits it to a whole flow.** The clearer that one thing is, the
cleaner everything downstream.

## How far the Task reaches

A Task shapes the run far more than one line of text suggests. Its description is
**injected into every agent's prompt, at every stage**. The planner reads it to
plan. The executor reads it to build. The reviewer reads it to judge whether the
result actually matches what you asked for. The same sentence is the yardstick the
whole run measures itself against.

So a vague Task doesn't just produce a vague plan - it produces a vague plan that
the reviewer then dutifully *approves*, because the reviewer is checking against
the same vague brief. Plausible brief in, plausible-but-wrong diff out. Tighten
the Task and the entire chain sharpens with it.

What a Task **does not** do is pick your model or decide how hard it thinks. That
is not the Task's job - it belongs to your **Crew** and its **Profiles**. A Task
says *what to build*; the Crew decides *who builds it, and how much horsepower they
get*. (Older versions had an "effort" field on the Task. It only ever nudged a
planning heuristic and never actually set the model, so it was removed - the
Profile is the real knob.) Keeping these two ideas apart is what makes the system
predictable: **change the Task to change the goal; change the Crew to change the
muscle.**

## A good Task description

```bash
vibe run "Add structured logging to the settings save handler in src/server/routes/settings.ts. Use the existing logger from src/lib/logger.ts. Include the user id and the changed keys, but never the values."
```

It names the file, names the library to use, and states the safety constraint up
front - so the planner has something concrete to anchor on, and the reviewer has a
real bar to check the result against.

## A weak Task description

```bash
vibe run "Improve logging"
```

The planner guesses what you meant. The reviewer critiques its own guess. You get
a diff that's plausible but probably not what you wanted.

## Checklist - breaking a card into items

A Task (a planning-board card) can hold an ordered **checklist** of **items** - the
concrete breakdown of what the card entails. Items live *inside* the card on
purpose, so the context stays in one place instead of scattering across many small
cards.

```bash
vibe tasks checklist add  <taskId> "/health returns json"
vibe tasks checklist add  <taskId> "test the endpoint"
vibe tasks checklist list <taskId>
vibe tasks checklist check <taskId> <itemId>      # mark done
vibe tasks checklist status <taskId> <itemId> in_progress
vibe tasks checklist move <taskId> <itemId> 1     # reorder (1-based)
```

The same actions are available in the task detail page of
[Mission Control](/docs/cli/dashboard) (add, check off, edit, drag-reorder,
remove). Each item carries a status - `pending`, `in_progress`, `done`, or
`blocked`.

**Enhance** - instead of writing the checklist by hand, let an AI assist propose
one:

```bash
vibe tasks enhance <taskId>            # read-only: prints a proposed checklist
vibe tasks enhance <taskId> --apply    # append the proposed items
```

Enhance is a one-shot, read-only [assist](/docs/glossary#assist) run - it
*proposes* an ordered breakdown of the card; you decide whether to add the items
(the "Enhance" button on a task previews them, then "Add all" appends). The model
never writes to the board on its own.

## Pick-up execution - run the whole checklist

Once a card has a checklist, **pick it up** to execute every item in one run, in
one worktree:

```bash
vibe tasks pickup <taskId>          # continuous: items back-to-back
vibe tasks pickup <taskId> --step   # pause between items for review
```

The dashboard's "Run checklist" button on the task does the same. Under the hood
this runs the built-in `pickup` [flow](/docs/concepts/flow): a holistic **plan**
once, then a per-item band (**micro-plan, implement**) repeated for each item, then
a holistic **review**. Each item is committed on its own (stamped with the item id,
so a single item can be reverted), and a *compact summary* of each finished item is
carried forward so later items have context without re-reading every diff. Item
status and the commit sha are written back onto the checklist as the run
progresses. Execution is linear and stops on the first failing item.

## "Needs testing" - when a human should look

A reviewer or verifier can finish a run with a non-blocking advisory: the change is
fine to ship, but a human should *eyeball* something the model can't perceive
(visual layout, animation, 3D, UX feel). The run still reaches its normal verdict -
it is **not** stuck waiting like an [approval gate](/docs/glossary#approval-gate) -
but the card is flagged **Needs testing** with a one-line reason. You resolve it
with a verdict: "Looks good" marks the task **Done**, "Needs work" **reopens** it.
The flag shows as a banner on the task and a badge on the board card.

A checklist item is **not** a Flow [Step](/docs/concepts/workflow): a Step is a
phase of the workflow (plan / implement / review); a checklist item is a piece of
*what to build*. Don't conflate them.

## Practical tips

- **One outcome per Task.** Two unrelated changes in one run make the review noisy
  and the diff harder to ship.
- **Name the surface.** A file path, a module name, a feature flag - give the
  planner something concrete to anchor on.
- **State the constraint.** If "don't touch X" matters, say so in the Task itself,
  not after the diff lands.
- **Use skills for context that's stable.** Conventions, security rules, domain
  language belong in [skills](/docs/concepts/skill), not in every Task prompt.

## Related

- [Flow](/docs/concepts/flow) - the recipe a Task runs through.
- [Workflow](/docs/concepts/workflow) - the stages a Task moves through.
- [Run state](/docs/concepts/state) - the formal statuses a Task accumulates.
- [Worktree](/docs/concepts/worktree) - where a Task's edits live before you merge.
