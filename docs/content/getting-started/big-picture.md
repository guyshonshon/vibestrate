---
title: The big picture
description: The one mental model that makes everything else click - Task, Flow, and Crew, explained with a simple story. Read this first.
section: getting-started
slug: getting-started/big-picture
---

# The big picture

Before any commands, spend three minutes here. Vibestrate has a handful of words
that show up everywhere - Task, Flow, Crew, Seat, Role, Profile, Provider - and
once they click, the rest of the docs read like plain English. Skip this and
they'll feel like jargon. Read it and you'll never have to look them up again.

Here's the whole idea in one sentence:

> You hand Vibestrate a **job**, it follows a **recipe** to get it done, and the
> recipe is carried out by a **team of AI workers you put together**.

That's it. Job, recipe, team. Everything below is just the real names for those
three things, plus the small pieces inside them.

## The story: you're directing a small production

Imagine you're putting on a play. You don't act in it yourself - you direct. You
decide what gets made, you hire the people, and you watch it come together.

- The **script** says what happens, scene by scene. It also lists the parts that
  need filling: "we need someone to build the set, someone to check the lighting."
- The **cast and crew** are the actual people you bring in to play those parts.
- You decide **who plays what**, and **how much to spend** on each one - a star
  for the lead, a budget hire for the walk-on.

Vibestrate works exactly like this. The script is a **Flow**. The parts it needs
filled are **Seats**. The people you bring in are your **Crew**, and each person
on it is a **Role**. How much star power you give each one is a **Profile**. And
the talent agency each person comes from - the actual AI tool doing the work - is
the **Provider**.

Let's meet them one at a time.

## Task - the job you want done

A **Task** is what you ask for, written in plain language, the way you'd brief a
capable colleague:

```bash
vibe run "Add structured logging to the settings save handler"
```

You say *what* you want. You do not say *how* to do it step by step - that's the
Flow's job. A good Task names the thing you mean (a file, a feature, a rule to
respect); a vague Task gets you a vague result. Same as briefing a person.

That's the only thing you're strictly required to provide. Everything else has a
sensible default, and you can ignore it until you want to tune it.

## Flow - the recipe the Task runs through

A **Flow** is the recipe: the ordered steps a Task moves through from "let's go"
to "ready for you to look at." The built-in default Flow looks like this:

```text
plan  →  build  →  check it works  →  review  →  final sign-off
```

Each step is a handoff. One worker plans, hands the plan to the next, who builds,
hands the result to validation, and so on. If the reviewer finds problems, the
Flow loops back to fix them and check again, up to a limit, then stops and calls
you over.

Here's the important part: **a Flow doesn't name any specific AI model.** It
doesn't say "use Claude for the build step." Instead it says "this step needs
*a builder*." It leaves a labelled empty chair. That empty chair is a Seat.

## Seat - a labelled chair in the recipe

A **Seat** is a spot in the Flow that needs someone in it, with a name that says
*what that someone is for*: a `builder` seat, a `reviewer` seat, a `planner` seat.

```text
THE FLOW:   plan  →  build  →  review

            seat:    seat:     seat:
            planner  builder   reviewer
```

The Flow reserves the seats but stays completely silent about *who* sits in them.

Why does that matter so much? Because it's what makes a Flow **shareable**. A Flow
written by someone on the other side of the world only ever says "I need a
builder and a reviewer." It says nothing about your models, your keys, your setup.
So you can download a Flow from the [Flow hub](/docs/concepts/flow), drop it in,
and it just works with *your* crew - because all it ever asked for was seats, and
you bring the people. (More on the hub in [Flow](/docs/concepts/flow).)

So: the Flow brings the empty chairs. You bring the people. That's the Crew.

## Crew - your team of AI workers

A **Crew** is the team you assemble to fill those seats. Think of them as your
models in costume - the same way one actor can play a king in one play and a
beggar in the next, one AI model can be your careful Reviewer in one seat and your
fast Builder in another.

Each member of the Crew is a **Role** - one worker with a job description:

- a name and a short brief ("you are the Reviewer; you critique the diff"),
- which **Seats** they're allowed to sit in,
- and how much horsepower they run with (their **Profile**, coming up next).

You'll have a default Crew with the usual suspects already set up: a Planner, a
Builder/Executor, a Reviewer, a Verifier. You can keep more than one Crew - say a
"fast and cheap" crew for small chores and a "careful and thorough" crew for risky
work - and pick which one to use per Task.

When you start a Task, Vibestrate matches the Flow's seats to your Crew's roles:

```text
THE FLOW asks for...      YOUR CREW provides...
  a builder seat     ←      Executor   (allowed to sit in: builder, executor)
  a reviewer seat    ←      Reviewer   (allowed to sit in: reviewer, challenger)
```

If a Flow needs a seat that nobody on your Crew can sit in, Vibestrate stops and
tells you in plain words ("add this seat to one of your roles"). If two of your
people could both take the same seat, it asks you to pick. No silent guessing.

## Profile - how strong (and expensive) each worker runs

Here's where the real power is, and it's the part most people miss at first.

A **Profile** is how much star power you give a worker: which model, how hard it
thinks (the effort level), how much you're willing to spend. The same Role can be
cheap or premium just by pointing it at a different Profile - you don't rebuild
the worker, you just change their costume.

This is the move that saves you money and time:

```text
THE BUILDER seat            ←   give it your best:    Claude Opus, max effort
  (writes the actual code)      a top model, thinking hard, no token limit

THE VALIDATOR seat          ←   give it something cheap:   a small fast model
  (just runs the lint and        it only needs to run "does it pass?",
   test commands)                so don't pay premium prices for it
```

Your heavy lifting gets your heaviest model. The routine box-checking gets a cheap
one. You decide, per seat, and you can change your mind any time without touching
the Flow or the Crew's wiring.

## Provider - the actual tool behind each worker

Finally, a **Provider** is the real coding-agent tool a Profile runs on - Claude
Code, Codex, Aider, Ollama, and so on. These are the CLIs already installed on
your machine. Vibestrate doesn't ship a model of its own; it drives the ones you
already have.

The chain, from the empty chair all the way down to the thing actually doing the
work, reads like this:

```text
  a SEAT          filled by a ROLE       running a PROFILE          on a PROVIDER
  in the Flow     in your Crew           (model + effort)           (the real tool)

  "builder"   →   Executor           →   Opus, max effort       →   Claude Code
  "reviewer"  →   Reviewer           →   a cheap fast model      →   Codex
```

Read left to right: *the recipe needs a builder; my Executor takes that seat; I've
set my Executor to run Opus at max effort; that runs on Claude Code.* Every layer
has one job, and you can swap any one of them without disturbing the others.

## Putting it together: one real Task

Say you run:

```bash
vibe run "Add structured logging to the settings save handler"
```

Here's what happens, in the words you now know:

1. Your **Task** kicks off a run.
2. Vibestrate picks the default **Flow** (the plan → build → check → review →
   sign-off recipe).
3. It fills each of the Flow's **Seats** from your **Crew**: your Planner takes
   the planner seat, your Executor the builder seat, your Reviewer the reviewer
   seat.
4. Each Role runs at its **Profile** - maybe your Planner and Executor are on a
   strong model, your Validator on a cheap one.
5. Each Profile runs on its **Provider** - the actual CLI on your machine.
6. The run does its work in an isolated copy of your project (a
   [worktree](/docs/concepts/worktree)), and stops at `ready to merge`,
   `blocked`, or `failed`. It never pushes or merges for you. You look, you decide.

That's the entire system. Six words, one story.

## You don't have to set any of this up to start

Worth saying plainly: **the defaults already work.** Fresh out of `vibe init` you
get a default Crew with all the usual roles, a sensible default Profile, and the
built-in default Flow. You can run your very first Task without configuring a
single seat.

The vocabulary above is what lets you *tune* things later - hire a sharper
Reviewer, swap in a downloaded Flow, send the cheap work to a cheap model. Learn
it once now, reach for it when you need it.

## A one-card cheat sheet

| Word | In one line | The play metaphor |
|---|---|---|
| **Task** | The job you ask for, in plain language. | The thing you want made. |
| **Flow** | The step-by-step recipe the Task runs through. | The script. |
| **Seat** | A labelled empty chair in the Flow ("needs a builder"). | A part that needs casting. |
| **Crew** | Your team of AI workers. | Your cast and crew. |
| **Role** | One worker, with a brief and the seats they can fill. | One person you hired. |
| **Profile** | How strong/expensive a worker runs (model + effort). | How much star power you pay for. |
| **Provider** | The real coding-agent tool behind it all. | The talent agency they came from. |

## Next

[Install Vibestrate →](/docs/getting-started/installation), then
[run your first Task →](/docs/getting-started/first-run). When you want to go
deeper on any one word, every concept has its own page under
[Concepts](/docs/concepts/task).
