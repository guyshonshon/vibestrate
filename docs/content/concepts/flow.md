---
title: Flow
description: The steps Vibestrate works through to finish your task - plan, build, check, fix.
section: concepts
slug: concepts/flow
---

A **Flow** is the list of steps Vibestrate works through to finish your task.

Think about hiring someone to remodel a kitchen. A good one doesn't just start swinging a hammer. They draw up a plan, do the work, walk through to check it, and fix anything that's off before they call it done. A Flow is that routine, written down, so every task gets the same care instead of depending on luck.

When you run a task without choosing a Flow, Vibestrate uses the one it ships with:

```bash
vibe run "Refactor provider permissions"
```

That default Flow goes Plan, then Build, then Check, then Fix:

<div class="docs-flow"><div><b>Plan</b><span>Work out what to change before touching anything.</span></div><div><b>Build</b><span>Write the code.</span></div><div><b>Check</b><span>Run your tests, then review the change.</span></div><div><b>Fix</b><span>If the check finds problems, loop back, fix, and check again.</span></div></div>

For most work, that is all you need.

## Picking a sturdier Flow

Some changes deserve more care. A change to login or payments might want a second reviewer to read the result with fresh eyes before it is blessed. For those, ask for a heavier Flow:

```bash
vibe run "Tighten the auth checks" --flow quality-arbitration
```

Vibestrate ships a handful of built-in Flows. You can install more from the shared **hub**, or write your own. [Browse the built-in Flows →](/docs/reference/flows)

## Why a Flow never names your AI

This is the part that makes a Flow shareable. A Flow describes the *steps*, and the *kind* of worker each step needs - "this one needs a builder", "this one needs a reviewer". It never says *which* AI model does the work.

<div class="docs-callout">

**The routine is shared, the workers are yours.** A Flow names the steps and the kind of worker each one needs, never the model. That is why you can lift someone else's Flow off the hub and run it with your own models and budget.

</div>

Your [Crew](/docs/concepts/crew) decides that. So you can take a Flow someone else wrote, off the hub, and run it with your own models and your own budget. The routine is shared; the workers are yours.

## When it's worth writing your own

Reach for a custom Flow when:

<div class="docs-cards">

**A routine keeps repeating**
The same review steps show up across your tasks, so you bottle them once.

**A change needs a gate**
A certain kind of change should always pause for your approval at a set point.

**A step is pinned to a model**
You want one step to always run on a specific model, like the reviewer on a different vendor.

</div>

If you only want to nudge the default a little, a clearer task description or a [skill](/docs/concepts/skill) usually does the job with less effort.

## Going deeper

- [Built-in Flows reference](/docs/reference/flows) - every shipped Flow, step by step, plus parallel review panels and parameters.
- [Add a Flow](/docs/extending/add-flow) - write, validate, and share your own.
- [Seat](/docs/concepts/seat) and [Crew](/docs/concepts/crew) - who fills a Flow's steps, and what they cost.
