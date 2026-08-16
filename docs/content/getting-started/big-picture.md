---
title: The big picture
description: Vibestrate is the frame your AI coding agents work in - one shared plan, rules the run enforces, and your call at the end. Task, Flow, and Crew, explained once.
slug: getting-started/big-picture
---

Vibestrate runs the AI coding tools you already have. You write the job once, and a team of AI workers carries it out under rules you set.

Running several models on one job by hand is where the time goes: pasting the same context into a tool that has never seen the project, carrying the plan from one chat to the next, watching each one for drift. Vibestrate is the frame that work happens inside. Every worker starts from the same plan and the same [project instructions](/docs/concepts/configuration), which you write once.

Six words carry the whole product.

<div class="docs-glossary">

**Task.** The job you want done, in plain language. One sentence is a complete Task.

**Flow.** The routine a Task runs through. The built-in `default` flow plans, architects, implements, validates, reviews and verifies, looping back to fix when review asks for changes.

**Seat.** A labelled spot in a Flow, like `reviewer` or `implementer`. A Flow names seats, never models. If two of your roles fill one seat, or none do, the run stops and names the seat rather than guessing; `--seat-role reviewer=senior-reviewer` pins the choice.

**Crew.** Your team of AI workers. Each worker is a **Role**: a name, a brief, the seats it may fill, and the Profile it runs at.

**Profile.** How strong a worker runs. It picks the provider, the model, and the effort level.

**Provider.** The thing behind the model. A coding CLI on your machine, a model API you hold the key for, or a model server on `localhost`.

</div>

```text
  Task ─▶ Flow ─▶ Seat ─▶ Role ─▶ Profile ─▶ Provider
   job     steps   which   your    model +    the tool
                   worker  Crew    effort     or API
```

Each Task works in an isolated copy of your project (a [worktree](/docs/concepts/worktree)), runs your own checks, and ends at one of four outcomes: `merge_ready`, `blocked`, `failed`, or `aborted`. It never pushes and never merges. The diff is yours to land. See [the safety guarantees](/docs/concepts/safety).

## Task - the job you want done

A **Task** is what you ask for, written the way you would brief a capable colleague:

```bash
vibe run "Add structured logging to the settings save handler"
```

You say *what* you want, not *how* to do it step by step. A Task that names the thing you mean - a file, a feature, a rule to respect - gets a better result than a vague one. It is the only thing you have to provide. Everything else has a default.

## Flow - the routine the Task runs through

A **Flow** is the ordered steps a Task moves through. The built-in `default` flow has eight steps; [Workflow](/docs/concepts/workflow) walks through each one and the status it produces.

A plain `vibe run` does not always take that Flow. With no `--flow` and no project default, Vibestrate sizes the task and can route a short, low-risk one to a leaner Flow. [Flow](/docs/concepts/flow) covers what gets picked, and when.

The part that matters here: a Flow never names an AI model. It says "this step needs *an implementer*" and leaves a labelled empty chair. That chair is a Seat.

## Seat - a labelled chair in the routine

A **Seat** is a spot in the Flow that needs filling, named for what it is for: an `implementer` seat, a `reviewer` seat, a `planner` seat. The Flow reserves the seats and says nothing about who sits in them.

That is what makes a Flow shareable. A Flow someone else wrote only asks for a planner and a reviewer - nothing about your models or your keys. Take one off the [hub](/docs/concepts/flow), drop it in, and it works with your own team.

When a Task starts, Vibestrate matches the Flow's seats to your Crew's roles. It never guesses. If nobody fills a seat, or if more than one role does, the run stops before any work starts and names the seat:

```text
Crew "default" has more than one role filling the "reviewer" seat
(reviewer, senior-reviewer). Pick one with a role override.
```

Pin the seat for that run and go again:

```bash
vibe run "Tighten the auth checks" --seat-role reviewer=senior-reviewer
```

An unfilled seat reads the same way and points at the fix:

```text
This Flow needs the "architect" seat, but crew "default" has no role
that fills it. Open Crew and add "architect" to a role's Seats.
```

## Crew - your team of AI workers

A **Crew** is the team that fills those seats. Each member is a **Role**: a name, a short brief ("you are the Reviewer; you critique the change"), the seats it is allowed to sit in, the permissions it runs with, and the Profile it runs at.

`vibe init` writes one Crew called `default` with six roles:

<div class="docs-chips"><span>Planner</span><span>Architect</span><span>Backend Implementer</span><span>Fixer</span><span>Reviewer</span><span>Verifier</span></div>

A Role can fill more than one seat. The Reviewer covers `reviewer` and `challenger`; the Backend Implementer covers `implementer`, `executor` and `builder`. Only the Backend Implementer and the Fixer can write files. The other four run read-only.

You can keep more than one Crew and pick which one a Task uses with `--crew`.

## Profile - how strong each worker runs

A **Profile** is how much power you give a worker: which provider, which model, how hard it thinks, and a cap on output tokens. The same Role is cheap or premium depending on the Profile it points at.

This is the cost lever. Give the implementer seat your best model, since it writes the real code. Give a read-only seat something small and fast. You change a Profile without touching the Flow or the Crew.

## Provider - the tool or API behind the model

A **Provider** is what actually runs the model. Vibestrate ships no model of its own. A provider is one of three things:

<div class="docs-cards">

**A coding CLI on your machine** - Claude Code, Codex, Gemini, Aider, Ollama, OpenCode and others. Each handles its own authentication.

**A model API you hold the key for** - `http-api`, over `https` only. The key lives in an environment variable, never in a file Vibestrate writes.

**A model server on your own machine** - `localhost-proxy`, for Ollama, LM Studio or vLLM. Loopback addresses only, so nothing leaves your computer.

</div>

[Set up a provider](/docs/getting-started/providers) covers all three.

## You do not have to set any of this up

The defaults work. Fresh out of `vibe init` you get a Crew with all six roles, one Profile, and the built-in Flows. You can run your first Task without configuring a seat.

One thing is worth changing early. `vibe init` points all six roles at the same Profile, so the reviewer starts out as the same model as the builder. [Why a human stays in the loop](/docs/getting-started/why-a-human) explains what that costs you and the two steps that fix it.

## Going deeper

- [Task](/docs/concepts/task), [Flow](/docs/concepts/flow), [Seat](/docs/concepts/seat), [Crew](/docs/concepts/crew) - a full page for each word.
- [Install Vibestrate](/docs/getting-started/installation), then [run your first Task](/docs/getting-started/first-run).
