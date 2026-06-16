---
title: Crew
description: Your set of AI workers, and which AI model each one uses.
section: concepts
slug: concepts/crew
---

A **Crew** is your set of AI workers. Each Flow lists the *kinds* of worker it needs - a builder, a reviewer, and so on. Your Crew is who actually shows up to fill those spots.

<div class="docs-callout">

**Different AIs, one task.** A Crew lets you put a different model in each seat, so the one that builds the change is not the one that reviews it. They read the problem from their own angle and check each other's work, instead of a single model rubber-stamping its own. The disagreement is the point.

</div>

Think of a Flow as a recipe that says "you need a chef and a taster". The Crew is the people you hire for those jobs, and you decide whether the chef is a fast cook or a careful one. The same recipe works no matter who you hire, which is why a Flow someone else wrote still runs with your own people.

Each worker in a Crew is called a **Role**. A Role does two things: it says which steps it can cover, and it picks the actual AI model that does the work.

```yaml
crews:
  default:
    label: Default
    roles:
      backend-implementer:
        label: Backend Implementer
        seats: [implementer, executor, builder]
        profile: claude-sonnet-deep
        prompt: .vibestrate/roles/executor.md
        permissions: code_write
        skills: []
defaultCrew: default
```

This says: a Crew named `default` (set as `defaultCrew`, the one used when you do not pick another) has one Role, `backend-implementer`. The `seats` list is the kinds of step this Role can cover. The `profile` is the setting that names the actual model and provider, so a Role never points at a model directly. See [[profile]] for how that works.

## Picking who runs

A task uses one Crew, defaulting to `defaultCrew`. You can keep more than one - say a fast Crew and a careful Crew - and choose at run time:

```bash
vibe run "task" --crew default
```

If a Flow needs a kind of worker that no Role in your Crew covers, the run stops with a clear message telling you to add that step to a Role. If two Roles both cover the same step, it asks you to pick one.

## Ready-made Crews (presets)

Presets save you from writing a Crew by hand. They all use the same workers as your default Crew, so a Flow's steps stay covered. A preset changes *how* the team runs, not *who* is on it:

<div class="docs-cards">

**`fast`**
Lowest effort, fewer review passes. Quick, low-stakes work.

**`thorough`**
Highest effort, extra review passes. Risky or complex work.

**`cheap`**
The provider's cheapest model at low effort. Keeps spend down.

**`local`**
Runs on a provider on your own machine, off cloud APIs.

</div>

```bash
vibe crew presets           # list them and whether each fits your setup
vibe crew presets add cheap # install one into project.yml
vibe crew use cheap         # make it your default
```

A preset refuses rather than make a copy of your default Crew. `fast` and `thorough` need a provider with effort control (claude, codex), `cheap` needs a provider with a designated cheap model, and `local` needs a local provider separate from your default. The dashboard's Crew page shows the same presets with one-click **Add**.

## Going deeper

- [[role]] and [[seat]] - the workers in a Crew, and the steps they can cover.
- [[profile]] - how a Role names its actual model and provider.
- [[flow]] - the steps a Crew fills in.
- A Crew can also set `maxReviewLoops` (0 to 10), capping how many fix-and-review passes a run makes. It overrides `workflow.maxReviewLoops` for runs on this Crew. Roles can carry extra `permissions`, `skills`, and `mcpServers`. See [[configuration]] for the full set of keys. Related: [[provider]].
