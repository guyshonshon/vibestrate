---
title: Supervisor Control
description: A conversation with your project's supervisor that remembers, and - when you allow it - acts on what you say.
slug: concepts/supervisor-control
---

**Supervisor Control** is the panel on a run's page, beside the control centre. Each run gets its own thread, so "look at that again" always has a referent. It is a conversation with the supervisor that persists, knows your project, and can put work where it belongs.

[Consult](concepts/consult) answers one question and forgets it. That is right for "what would you do here" and useless for someone you work alongside: every follow-up re-explains the project, and nothing it decided five minutes ago survives. Supervisor Control keeps the thread.

## Talking to it

Type what you want. It answers from your real project context: the tasks, the runs that have happened, what your checks say, and the operating manual if you keep one.

Not sure how to review a change it made? Ask it. That is the question it is best at, and the reason the panel exists rather than a second composer.

## Letting it act

Out of the box the supervisor **writes nothing**. It answers, suggests, and drafts, and that is all.

```
vibe config set supervisorControl.autonomy act
```

turns that up. In `act` mode, saying "add a hero section to the landing page" is enough: the supervisor decides where that belongs and does it. It can create a task, add TODOs to one you already have, or start a run.

There are exactly two settings, `advise` and `act`. An earlier design had a middle "queue" tier, and it was dropped for being dishonest - queueing a task starts the scheduler, so it runs the work exactly like `act` does, just through another process. A tier that reads as cautious while behaving like the top one is worse than no tier.

<div class="docs-callout warn">

**`act` will not turn on without a budget ceiling.** A run started from chat spends money and its agent runs commands on your machine, and every ceiling ships off. So `supervisorControl.autonomy: act` with no `budget.*` limit set is refused at config load, not warned about. Set one first:

```
vibe budget set --max-turns-run 40
```

</div>

## The stop button

The panel header has one. It stops the supervisor acting immediately, without touching config, and it survives a restart.

It **fails closed**: if the flag cannot be read - corrupt, half-written, wrong permissions - the supervisor is treated as stopped. A stop button that quietly degrades to "go" is not a stop button.

Talking still works while stopped. Only acting is off - and while it is stopped the routing model is not called at all, so a stopped supervisor is not quietly spending to reach decisions it cannot use.

It is on both surfaces, because the moment you most want a stop button is not reliably a moment you have a browser tab open:

```bash
vibe supervisor stop --reason "reviewing the last diff"
vibe supervisor status
vibe supervisor resume
```

## Why it cannot be talked into things

The supervisor answers from your project's context, and that context is not all written by you. A merged agent diff edits `VIBESTRATE.md`. A dependency's README reaches the codebase map. Annotations arrive over HTTP. Task titles are sometimes model-written. While the supervisor could only answer, text like that was harmless. Once it can start a run, it would be a way to make it act.

So the work is split in two, and they never meet:

<div class="docs-cards">

**The router**
Decides what you meant. Its prompt holds your message and a list of task ids. No manual, no codebase map, no annotations, no file contents, no run output, and none of the earlier turns.

**The answerer**
Writes the reply. Has the full project context, and cannot route anything.

</div>

Then deterministic code, with no model involved, checks the router's proposal before anything happens:

- The task it picked must be one that was offered. Never fuzzy-matched, so an invented or injected id goes nowhere.
- Its echo of your message must match what you actually typed. This catches the subtle version, where the intent is left alone and the *brief* is quietly rewritten.
- A run's instructions are **your words, verbatim**. Never a model's summary of them.
- Starting a run crosses the Action Broker as `run.start`, so a policy can refuse it.

One limit worth knowing: this describes what Vibestrate puts *into* the router's prompt. The model still runs as a CLI in your project directory, so a tool-capable one can read files on its own. The checks above are what actually stand between a poisoned repo and an action, which is why they are deterministic code rather than more instructions to the model.

## What it tells you afterwards

Every action shows in the thread on the message that caused it, including the ones it refused. A refusal you cannot see is how you end up believing work was queued that never was.

Adding TODOs to a task with a run already in flight says so plainly: that run works from the list it started with, so new items wait for the next one. It would be easy to reply "added it, the run is picking it up", and it would be false.

## What is not reversible

Creating a task and adding TODOs are cheap to undo. **Starting a run is not.** It spends money, takes the task lock, creates a branch, and its agent runs commands on your machine. Aborting is cooperative: a run mid-turn finishes that turn first.

That asymmetry is why `act` is opt-in, why it needs a ceiling, and why the stop button exists.
