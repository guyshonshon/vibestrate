---
title: The big picture
description: Vibestrate is a CTO for your AI coding - a crew of different models that check each other while you stay in control. Task, Flow, and Crew, explained once.
section: getting-started
slug: getting-started/big-picture
---

Spend three minutes here before any commands. This is the one short read that makes everything click.

Vibestrate is a CTO for your AI coding. You hand it a job, it follows a set routine to get it done, and that routine is carried out by a team of AI workers you put together. Job, routine, team. The rest is just the real names for those three things.

<div class="docs-callout">

**The disagreement is the feature.** A chat assistant agrees with you and hands back whatever you asked for. Vibestrate runs *several models* on one job and makes them check each other - one builds, a different one reviews it cold. They read the problem from different angles, and that friction catches what a single yes-man would wave through.

</div>

You stay in control the whole way. Each Task works in an isolated copy of your project, runs your checks, and stops at a clear outcome. It never pushes or merges for you. You look, you decide.

## Task - the job you want done

A **Task** is what you ask for, written in plain language, the way you'd brief a capable colleague:

```bash
vibe run "Add structured logging to the settings save handler"
```

You say *what* you want, not *how* to do it step by step. A Task that names the thing you mean (a file, a feature, a rule to respect) gets a better result than a vague one. It's the only thing you have to provide. Everything else has a sensible default.

## Flow - the routine the Task runs through

A **Flow** is the set of steps a Task moves through, from "let's go" to "ready for you to look at." The default Flow runs like this:

<div class="docs-flow">
<div><b>Plan</b><span>Break the Task into a real plan.</span></div>
<div><b>Build</b><span>Write the code in a safe copy of your project.</span></div>
<div><b>Check</b><span>Run your tests to see it works.</span></div>
<div><b>Review</b><span>Read the change with fresh eyes.</span></div>
<div><b>Sign-off</b><span>A final pass before it reaches you.</span></div>
</div>

If the review finds problems, it loops back to fix and check again, up to a limit, then stops and calls you over.

Here's the key part: a Flow never names a specific AI model. It just says "this step needs *a builder*." It leaves a labelled empty chair. That chair is a Seat.

## Seat - a labelled chair in the routine

A **Seat** is a spot in the Flow that needs filling, named for *what it's for*: a `builder` seat, a `reviewer` seat, a `planner` seat. The Flow reserves the seats but says nothing about who sits in them.

That's what makes a Flow shareable. A Flow someone else wrote only asks for "a builder and a reviewer" - nothing about your models or your keys. So you can take one off the [hub](/docs/concepts/flow), drop it in, and it works with your own team, because all it asked for was seats and you bring the people.

## Crew - your team of AI workers

A **Crew** is the team you assemble to fill those seats. Each member is a **Role**: one worker with a name, a short brief ("you are the Reviewer; you critique the change"), the seats they're allowed to sit in, and how much horsepower they run with (their Profile, next). You'll have a default Crew already set up - a Planner, an Executor, a Reviewer, a Verifier - and you can keep more than one and pick which to use per Task.

When a Task starts, Vibestrate matches the Flow's seats to your Crew's roles. If a Flow needs a seat nobody can fill, it stops and tells you in plain words. If two people could both take a seat, it asks you to pick. No silent guessing.

So the three big words fit together like this:

<div class="docs-cards">

**Task - the job**
What you ask for, in plain language. The only thing you have to provide.

**Flow - the routine**
The fixed set of steps the job runs through. It reserves Seats, but names no models.

**Crew - the team**
The AI workers (Roles) you put in those seats. Different models, checking each other.

</div>

## Profile - how strong (and pricey) each worker runs

A **Profile** is how much power you give a worker: which model, how hard it thinks (the effort level), how much you're willing to spend. The same Role can be cheap or premium just by pointing it at a different Profile.

This is where you save money. Give the builder seat your best model at max effort, since it writes the real code. Give the validator seat a small fast model, since it only has to run "does it pass?" You decide per seat, and you can change your mind any time without touching the Flow or the Crew.

## Provider - the actual tool behind each worker

A **Provider** is the real coding-agent tool a Profile runs on. These are the CLIs already on your machine - Vibestrate ships no model of its own; it drives the ones you already have:

<div class="docs-chips">
<span>Claude Code</span><span>Codex</span><span>Gemini</span><span>Aider</span><span>Ollama</span>
</div>

So the full chain reads: a **Seat** in the Flow is filled by a **Role** in your Crew, running at a **Profile** (model plus effort), on a **Provider** (the real tool). Every layer has one job, and you can swap any one without disturbing the others.

## You don't have to set any of this up

The defaults already work. Fresh out of `vibe init` you get a default Crew with all the usual roles, a sensible default Profile, and the built-in default Flow. You can run your first Task without configuring a single seat. Each Task does its work in an isolated copy of your project (a [worktree](/docs/concepts/worktree)) and never pushes or merges for you. It stops at one of three outcomes and leaves the call to you:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>ready to merge</b><span>The change is ready for you to keep.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>It needs a decision from you.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something went wrong mid-run.</span></div>
</div>

The vocabulary above is what lets you *tune* things later: hire a sharper Reviewer, swap in a downloaded Flow, send the cheap work to a cheap model.

## Going deeper

- [Task](/docs/concepts/task), [Flow](/docs/concepts/flow), [Seat](/docs/concepts/seat), [Crew](/docs/concepts/crew) - a full page for each word.
- [Install Vibestrate](/docs/getting-started/installation), then [run your first Task](/docs/getting-started/first-run).
