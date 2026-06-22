---
title: Task
description: The plain-language brief you hand Vibestrate. One sentence kicks off a full plan, build, review, verify run.
section: concepts
slug: concepts/task
---

A Task is what you want done, written in plain language, the way you would brief a capable colleague. You say what you want. Vibestrate works out the steps.

```bash
vibe run "Add structured logging to the settings save handler"
```

That one line is a complete Task. You don't list files or set an order. The [Flow](/docs/concepts/flow) decides the steps and your [Crew](/docs/concepts/crew) does the work. The Task is just the brief.

## What happens when you submit one

A Task becomes a *run*: one supervised process you can watch and audit. In order, the orchestrator:

<div class="docs-flow">
<div><b>Reads your project</b><span>Language, package manager, and the validation commands it will trust later.</span></div>
<div><b>Picks Flow and Crew</b><span>The default Flow unless you choose another, with its seats matched to your Crew's roles.</span></div>
<div><b>Opens a clean workspace</b><span>A fresh git worktree, so nothing touches your real project until you say so.</span></div>
<div><b>Drives the stages</b><span>Plan, build, validate, review, fix, verify, looping back through fix when the review asks, up to a limit.</span></div>
<div><b>Stops at a verdict</b><span>It never pushes and never merges. The diff is yours to land.</span></div>
</div>

That ends at one of three outcomes:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is ready for you to keep.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>It needs a decision from you.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something went wrong mid-run.</span></div>
</div>

Every prompt, output, metric, and decision is written under `.vibestrate/runs/<runId>/`, so a finished run reads back as a record, not a black box. See [Run state](/docs/concepts/state) for the status list and [Workflow](/docs/concepts/workflow) for the stage-by-stage path.

You commit one thing, the Task. The orchestrator commits it to the whole flow. The clearer the Task, the cleaner everything downstream.

## The Task is the yardstick

The description goes into every agent's prompt, at every stage. The planner plans from it. The executor builds from it. The reviewer checks the result against it. One sentence is what the run measures itself against.

<div class="docs-callout">

**Plausible in, plausible-but-wrong out.** A vague Task does not just plan vaguely. The reviewer then approves that vague plan, because it is checking against the same vague brief. Tighten the Task and the whole chain sharpens.

</div>

A Task does not pick your model or set how hard it thinks. That belongs to your [Crew](/docs/concepts/crew) and its [Profiles](/docs/concepts/profile). A Task says what to build. The Crew decides who builds it and how much horsepower they get. Change the Task to change the goal; change the Crew to change the muscle.

## A good Task vs a weak one

The contrast is the whole lesson. Same goal, two briefs.

<div class="docs-cards">

**A good Task**
Names the file, names the library, states the constraint up front. The planner gets a concrete anchor, and the reviewer gets a real bar to check against.

**A weak Task**
The planner guesses. The reviewer critiques its own guess. You get a diff that is plausible and probably wrong.

</div>

A good Task:

```bash
vibe run "Add structured logging to the settings save handler in src/server/routes/settings.ts. Use the existing logger from src/lib/logger.ts. Include the user id and the changed keys, but never the values."
```

A weak Task:

```bash
vibe run "Improve logging"
```

## Checklists: break a Task into items

A Task can hold an ordered checklist of items, the concrete breakdown of the work. Items live inside the card, so the context stays in one place instead of scattering across small cards.

```bash
vibe tasks checklist add  <taskId> "/health returns json"
vibe tasks checklist add  <taskId> "test the endpoint"
vibe tasks checklist list <taskId>
vibe tasks checklist check <taskId> <itemId>      # mark done
vibe tasks checklist status <taskId> <itemId> in_progress
vibe tasks checklist move <taskId> <itemId> 1     # reorder (1-based)
```

The same actions live on the task detail page in [Mission Control](/docs/cli/dashboard): add, check off, edit, drag-reorder, remove. Each item carries a status: `pending`, `in_progress`, `done`, or `blocked`.

To draft a checklist instead of writing one by hand, let an assist propose it:

```bash
vibe tasks enhance <taskId>            # read-only: prints a proposed checklist
vibe tasks enhance <taskId> --apply    # append the proposed items
```

Enhance is a one-shot, read-only [assist](/docs/glossary#assist). It proposes an ordered breakdown; you decide whether to add it. The model never writes to the board on its own.

## Pick up: run the whole checklist

Once a Task has a checklist, pick it up to run every item in one worktree:

```bash
vibe tasks pickup <taskId>          # continuous: items back-to-back
vibe tasks pickup <taskId> --step   # pause between items for review
```

"Run checklist" on the task does the same. Under the hood this runs the built-in `pickup` [flow](/docs/concepts/flow): one holistic plan, then a micro-plan and implement band per item, then one holistic review. Each item commits on its own, stamped with the item id so it can be reverted alone. A compact summary of each finished item carries forward, so later items have context without re-reading every diff. Status and commit sha are written back as the run goes. Execution is linear and stops on the first failing item.

### Per-item review: the `pickup-review` flow

For higher-stakes checklists, use `pickup-review` instead of the default `pickup`:

```bash
vibe tasks pickup <taskId> --flow pickup-review
```

`pickup-review` adds a review panel and an arbiter inside the per-item band - after the implementer writes each item, the panel reviews that item's diff, and a bounded per-item fix loop runs before the item commits. This means each item is reviewed in isolation, with full context of only that item's change.

**Default lenses.** The panel runs two lenses by default: `correctness` (logic, type-safety, edge cases) and `security-risk` (injection, auth gaps, data exposure). Both are aimed at the active persona if one is set. You can override lenses project-wide or per-run via `checklistReview.lenses` in your project config.

**Cost.** Each item runs the panel independently: two reviewer turns and one arbiter turn per item, on top of the normal implement band. For a 10-item checklist that is 30 extra turns. Use `pickup-review` when correctness per item matters more than speed.

**Cap-and-continue.** If an item's fix loop ends with findings still open, the run continues (it never hard-aborts a checklist mid-stream), but that item is flagged as not merge-ready. The gap is surfaced item by item in `vibe assurance`, `vibe audit`, and the dashboard verdict panel. A run that ends with any open-findings item cannot reach `merge_ready` until the gap is resolved. Nothing passes silently.

Each item keeps its own arbitration ledger, so findings from item 3 never bleed into item 7.

## "Needs testing": when a human should look

A reviewer or verifier can end a run with a non-blocking advisory: the change is fine to ship, but a human should eyeball something a model cannot perceive, like layout, animation, or UX feel. The run still reaches a normal verdict; it is not stuck like an [approval gate](/docs/glossary#approval-gate). The card is flagged Needs testing with a one-line reason. Resolve it with a verdict: "Looks good" marks the Task Done, "Needs work" reopens it. The flag shows as a banner on the task and a badge on the board.

A checklist item is not a Flow [Step](/docs/concepts/workflow). A Step is a phase of the workflow (plan, implement, review). An item is a piece of what to build. Don't conflate them.

## Practical tips

- **One outcome per Task.** Two unrelated changes make the review noisy and the diff hard to ship.
- **Name the surface.** A file path, a module, a feature flag. Give the planner an anchor.
- **State the constraint.** If "don't touch X" matters, say so in the Task, not after the diff lands.
- **Put stable context in skills.** Conventions, security rules, and domain language belong in [skills](/docs/concepts/skill), not in every prompt.

## Related

- [Flow](/docs/concepts/flow) - the recipe a Task runs through.
- [Workflow](/docs/concepts/workflow) - the stages a Task moves through.
- [Run state](/docs/concepts/state) - the statuses a Task accumulates.
- [Worktree](/docs/concepts/worktree) - where a Task's edits live before you merge.
