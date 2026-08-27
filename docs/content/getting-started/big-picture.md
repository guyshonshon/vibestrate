---
title: The big picture
description: How Vibestrate runs a coding job, and what Task, Flow, Seat, Crew, Profile and Provider each mean.
slug: getting-started/big-picture
---

## In simple words

Vibestrate runs the AI coding tools you already have. You write the job down once, and a team of AI workers carries it out under rules you set.

Running several models on one job by hand is where the time goes: pasting the same context into a tool that has never seen your project, carrying the plan from one chat to the next, watching each one for drift. Vibestrate is the frame that work happens inside, so every worker starts from the same plan and the same project instructions, written once.

<div class="docs-callout tip">

**Tip.** Every word below is a screen in the dashboard: **Flows**, **Crew**, **Profiles**, **Crew > Providers**. Read this once, then start a run - the words land better after you have watched one happen.

</div>

![The header of a finished run. A green panel reads Run, merge ready. Beside it the task, the flow it followed with its eight steps listed in order, and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.](/media/docs/scoped/run-header.png)

That is the whole idea in one picture: one task, one recipe, one team, one verdict.

<div class="docs-callout">

**Did you know?** Nothing here is a model wrapper. Vibestrate spawns the CLIs you already installed and logged into, so your keys stay where they are and your bills come from the vendors. There is no Vibestrate account to make.

</div>

## Task - the job you want done

A **Task** is what you ask for, written the way you'd brief a capable colleague. **New run** at the bottom of the sidebar opens one field for it; **Start run** begins:

> Add structured logging to the settings save handler

Say what you want and leave the how to the workers; naming a file or a rule to respect beats a vague brief. It is the only thing you must provide - everything else has a default.

## Flow - the routine the Task runs through

A **Flow** is the ordered steps a Task moves through. The **Flows** page lists this project's, built-in and your own. The built-in `default` flow has four steps; [Workflow](/docs/concepts/workflow) walks through each and the status it produces.

A run doesn't always take that Flow: with no flow pinned and no project default, Vibestrate sizes up the task and can route a short, low-risk one to a leaner Flow. [Flow](/docs/concepts/flow) covers what gets picked, and when.

A Flow never names an AI model. Where a step needs a worker it names the kind, like an implementer, and leaves a labelled empty chair: a Seat. Steps that only run your tests need no chair at all.

## Seat - a labelled chair in the routine

A **Seat** is a spot in the Flow that needs filling, named for the work: an `implementer` seat, a `reviewer` seat. The Flow reserves them and says nothing about who sits in them.

That is what makes a Flow shareable: one someone else wrote asks for a planner and a reviewer, naming none of your models or keys. Take one off the [hub](/docs/concepts/flow), drop it in, and it works with your team.

The **Crew** page settles this before a run does. **Flows this crew can run** marks each flow **Runs**, **Needs a pick** or **Cannot start**, and the seat map shows which seats are unassigned or have several takers.

Start on an unfilled seat anyway and Vibestrate stops before any work happens, naming the seat and the fix:

```text
This Flow needs the "architect" seat, but crew
"default" has no role that fills it. Open Crew
and add "architect" to a role's Seats.
```

Two roles filling one seat stops it the same way - the **Needs a pick** state:

```text
Crew "default" has more than one role filling the
"reviewer" seat (reviewer, senior-reviewer). Pick
one with a role override.
```

The override is `--seat-role reviewer=senior-reviewer` on `vibe run`, repeated per seat.

## Crew - your team of AI workers

A **Crew** is the team that fills those seats. Each member is a **Role**: a name, a short brief ("you are the Reviewer; you critique the change"), the seats it may sit in, the permissions it runs with, and the Profile it runs at. The **Crew** page holds all five, one card per role.

Setup writes one Crew called `default` with six roles:

<div class="docs-chips"><span>Planner</span><span>Architect</span><span>Backend Implementer</span><span>Fixer</span><span>Reviewer</span><span>Verifier</span></div>

A Role can fill more than one seat. The Reviewer sits in the `reviewer` and `challenger` seats, the Backend Implementer covers `implementer`, `executor` and `builder`. Only the Backend Implementer and the Fixer can write files; the Reviewer can run commands like your test suite but not edit, and the other three run read-only.

Keep more than one Crew and pick which a Task uses, from the compose page's **Crew** section or with `--crew`.

## Profile - how strong each worker runs

A **Profile** is how much power you give a worker: which provider, which model, how hard it thinks, and a cap on output tokens. The same Role is cheap or premium depending on the Profile it points at. The **Profiles** page lists them, and each role card on **Crew** picks one from its **Profile (runtime)** dropdown.

This is where you control cost: your best model on the implementer seat, since it writes the real code, something small and fast on a read-only one. Changing a Profile leaves the Flow and the Crew alone.

## Provider - the tool or API behind the model

A **Provider** is the thing that runs the model. **Crew > Providers** manages all three kinds:

<div class="docs-cards">

**A coding CLI on your machine** - Claude Code, Codex, Gemini, Aider, Ollama, OpenCode and others, each handling its own login.

**A model API you hold the key for** - `http-api`, over https only. The key lives in an environment variable, never in a file Vibestrate writes.

**A model server on your own machine** - `localhost-proxy`, for Ollama, LM Studio or vLLM. Loopback addresses only, so nothing leaves your computer.

</div>

[Set up a provider](/docs/getting-started/providers) covers all three.

## None of this needs setting up

The defaults work: out of the Setup page you get a Crew with all six roles, one Profile and the built-in Flows, so your first Task needs no seat configured.

One thing is worth changing early: Setup points all six roles at the same Profile, so your reviewer starts out as the same model as your builder. [Why you stay in the loop](/docs/getting-started/why-a-human) covers what that costs and the one dropdown that fixes it.

Each word has a page of its own: [Task](/docs/concepts/task), [Flow](/docs/concepts/flow), [Seat](/docs/concepts/seat), [Crew](/docs/concepts/crew).

## Next

[Your first run →](/docs/getting-started/first-run) - the same words, watched happening.
