---
title: The big picture
description: How Vibestrate runs a coding job, and what Task, Flow, Seat, Crew, Profile and Provider each mean.
slug: getting-started/big-picture
---

## In simple words

Vibestrate runs the AI coding tools you already have. You write the job down once, and a team of AI workers carries it out under rules you set.

Running several models on one job by hand is where the time goes: you paste the same context into a tool that has never seen your project, carry the plan from one chat to the next, and watch each one for drift. Vibestrate is the frame that work happens inside, so every worker starts from the same plan and the same project instructions, which you write once.

![The header of a finished run. A green panel reads Run, merge ready. Beside it the task, the flow it followed with its eight steps listed in order, and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.](/media/docs/scoped/run-header.png)

That is the whole idea in one picture: one task, one recipe, one team, one verdict.

<div class="docs-callout tip">

**Tip.** Read this page once for the vocabulary, then go and start a run. The words below make far more sense after you have watched one happen than before.

</div>

<div class="docs-callout">

**Did you know?** Nothing here is a model wrapper. Vibestrate spawns the CLIs you already installed and already logged into, so your keys stay where they are and your bills come from the vendors directly. There is no Vibestrate account to make.

</div>

## The words you will meet

## Task - the job you want done

A **Task** is what you ask for, written the way you'd brief a capable colleague:

```bash
vibe run "Add structured logging to the \
settings save handler"
```

Say what you want done and leave the how to the workers. A Task that names a file or a rule to respect gets a better result than a vague one. It's the only thing you have to provide; everything else has a default.

## Flow - the routine the Task runs through

A **Flow** is the ordered steps a Task moves through. The built-in `default` flow has eight steps, and [Workflow](/docs/concepts/workflow) walks through each one and the status it produces.

A plain `vibe run` doesn't always take that Flow. With no `--flow` and no project default, Vibestrate sizes up the task and can route a short, low-risk one to a leaner Flow. [Flow](/docs/concepts/flow) covers what gets picked, and when.

A Flow never names an AI model. Where a step needs a worker it names the kind, like an implementer, and leaves a labelled empty chair. That chair is a Seat. Some steps, like the ones that only run your tests, need no chair at all.

## Seat - a labelled chair in the routine

A **Seat** is a spot in the Flow that needs filling, named for the work: an `implementer` seat, a `reviewer` seat. The Flow reserves the seats and says nothing about who sits in them.

That's what makes a Flow shareable. One that someone else wrote asks for a planner and a reviewer, and says nothing about your models or your keys. Take one off the [hub](/docs/concepts/flow), drop it into your project, and it works with your own team.

At the start of a run, Vibestrate matches the Flow's seats to your Crew's roles. If nobody fills a seat, or if more than one role does, Vibestrate stops the run before any work starts and names the seat:

```text
Crew "default" has more than one role filling
the "reviewer" seat (reviewer, senior-reviewer).
Pick one with a role override.
```

Pin the seat for that run and go again:

```bash
vibe run "Tighten the auth checks" \
  --seat-role reviewer=senior-reviewer
```

An empty seat reads the same way and tells you the fix:

```text
This Flow needs the "architect" seat, but crew
"default" has no role that fills it. Open Crew
and add "architect" to a role's Seats.
```

## Crew - your team of AI workers

A **Crew** is the team that fills those seats. Each member is a **Role**: a name, a short brief ("you are the Reviewer; you critique the change"), the seats it's allowed to sit in, the permissions it runs with, and the Profile it runs at.

`vibe init` writes one Crew called `default` with six roles:

<div class="docs-chips"><span>Planner</span><span>Architect</span><span>Backend Implementer</span><span>Fixer</span><span>Reviewer</span><span>Verifier</span></div>

A Role can fill more than one seat. The Reviewer sits in both the `reviewer` and `challenger` seats, and the Backend Implementer covers `implementer`, `executor` and `builder`. Only the Backend Implementer and the Fixer can write files; the other four run read-only.

You can keep more than one Crew and pick which one a Task uses with `--crew`.

## Profile - how strong each worker runs

A **Profile** is how much power you give a worker: which provider, which model, how hard it thinks, and a cap on output tokens. The same Role is cheap or premium depending on the Profile it points at.

This is where you control cost. Give the implementer seat your best model, since it writes the real code, and give a read-only seat something small and fast. Changing a Profile leaves the Flow and the Crew alone.

## Provider - the tool or API behind the model

A **Provider** is the thing that runs the model. Vibestrate ships no model of its own. A provider is one of three things:

<div class="docs-cards">

**A coding CLI on your machine** - Claude Code, Codex, Gemini, Aider, Ollama, OpenCode and others. Each one handles its own login.

**A model API you hold the key for** - `http-api`, over https only. The key lives in an environment variable, never in a file Vibestrate writes.

**A model server on your own machine** - `localhost-proxy`, for Ollama, LM Studio or vLLM. Loopback addresses only, so nothing leaves your computer.

</div>

[Set up a provider](/docs/getting-started/providers) covers all three.

## You don't have to set any of this up

The defaults work. Straight out of `vibe init` you get a Crew with all six roles, one Profile, and the built-in Flows, so you can run your first Task without configuring a seat.

One thing is worth changing early. `vibe init` points all six roles at the same Profile, so your reviewer starts out as the same model as your builder. See [why a human stays in the loop](/docs/getting-started/why-a-human) for what that costs you and the two steps that fix it.

## Going deeper

- [Task](/docs/concepts/task), [Flow](/docs/concepts/flow), [Seat](/docs/concepts/seat), [Crew](/docs/concepts/crew) - a full page for each word.
- [Install Vibestrate](/docs/getting-started/installation), then [run your first Task](/docs/getting-started/first-run).
