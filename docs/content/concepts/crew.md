---
title: Crew
description: The team of AI workers you cast, and which model each one runs on.
slug: concepts/crew
---

## In simple words

A [[flow]] says which *kinds* of worker a job needs: someone to plan it, someone to build it, someone to check it. It does not say who.

A **Crew** is who shows up. It is your roster: a list of workers, each one pointed at a model. One crew might be all Claude. Another might have Codex build and Claude review. The flow does not change either way.

Each worker on the roster is called a **Role**, and a role answers two questions: which kinds of step can it take, and which model does it run on.

Open it with `vibe ui` and pick **Crew** in the sidebar. Here is the crew `vibe init` gives you:

![The Default crew card. A green stripe on the left reads Crew default, runs by default. The card names the crew Default, counts 6 roles and reads all seats filled, with Configure and Edit roles buttons.](/media/docs/scoped/crew-card.png)

Six workers, every [[seat]] the flow asks for covered, and it runs unless you name another.

<div class="docs-callout tip">

**Tip.** You do not need a second crew to change how a run behaves. Most of the time you want a different *model*, and that lives on the role's [[profile]]. Reach for a second crew when you want a genuinely different team, like an all-local one.

</div>

## When you would use one

<div class="docs-cards">

**Have one model check another**
Put Codex on the role that builds and Claude on the role that reviews. The reviewer reads the diff cold, so it is not marking its own homework.

**Keep a cheap team and a careful team**
A `fast` crew for a typo or a rename, a `thorough` crew for a migration. Same flows, different roster, chosen per run.

**Work entirely offline**
A `local` crew points every role at a provider on your own machine, so no code leaves it.

**Match the model to the job**
A strong model on planning, a cheap one on the mechanical edits, a different strong one on review. You are casting, not settling.

</div>

A task uses exactly one crew. The New run composer draws the flow's seats against the crew's roles before it starts, so you see the wiring rather than guessing at it.

<div class="docs-callout">

**Did you know?** One role can cover several kinds of step, which is why six workers can staff a flow with more steps than that. The `executor` role in the scaffold takes `implementer`, `executor` and `builder`, and its card lists all three.

</div>

## Ready-made crews

Presets save you writing a roster by hand. They use the same workers as your default crew, so a flow's seats stay covered. A preset changes *how* the team runs, not *who* is on it.

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

They sit further down the Crew page, one card each with **Add to crews**. Installing one adds a crew and the profile it runs on. Nothing runs until you pick it.

A preset refuses rather than quietly copy your default crew. `fast` and `thorough` need a provider with effort control (claude, codex), `cheap` needs a provider with a designated cheap model, and `local` needs a local provider separate from your default. A card that cannot fit says which case it hit and offers the route forward.

## Going deeper

### How a seat gets filled

Matching reads names, not order. A flow step names a seat; the crew's roles declare which seats they take; the run pairs them up.

Two ways that fails, both loudly and before any model is spawned:

<div class="docs-outcomes">
<div class="docs-outcome stop">

**No role takes the seat**
The run refuses to resolve and tells you to open Crew and add that seat to a role.

</div>
<div class="docs-outcome stop">

**Two roles claim it**
The run refuses the same way and asks you to name one, from the composer or with a run override.

</div>
</div>

Refusing up front is deliberate. A half-staffed run that discovers the gap three steps in has already spent tokens and written code.

### Editing

**Edit roles** opens the Crew Editor; **New crew** opens it on a blank one. One screen holds every role's parameters (seats, profile, permissions, skills) beside its instructions, with a panel showing which of your flows the crew as edited can still run.

Two kinds of change live there, kept apart on purpose:

- **Saved from the page.** A role's instructions, and its parameters on a crew that already exists. These write the role's file and update the crew in place.
- **Pasted by hand.** Adding, removing or renaming a role, changing the crew's label or its review loops, and everything about a crew you are creating from scratch. The editor gives you the exact bytes for `.vibestrate/project.yml` and for each role file; you save them yourself.

The split is not friction for its own sake. Structural edits change what every future run does, so they go through a diff you read.

### Where it lives

A crew is a row under `crews` in `.vibestrate/project.yml`, and each role points at a prompt file under `.vibestrate/roles/`. Both are committed, so a teammate who clones the repo gets your roster, and a flow someone else wrote still runs with your own people.

Next: [[role]] goes through one worker in detail.
