---
title: Vibestrate docs
description: Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.
slug: index
---

You already have the models. What you don't have is somewhere to run them as a team - one plan, one set of rules, and a place to hand work between them, so you stop carrying context from tool to tool by hand.

Hand Vibestrate a task, including one you could not write yourself: a security fix, a piece of WebGL you have never touched. It breaks the work down, runs it across several models, and supervises the whole thing.

AI can write that code. It also gets things wrong, and it tends to agree with whatever you said last. That is why the final call stays yours - see [why a human stays in the loop](/docs/getting-started/why-a-human).

## The crew is the point

Vibestrate's real edge is running several AIs, of different models, on one task. One plans. Another builds. A different one reviews the change cold. Each model reads the problem from its own angle, and the disagreement between them is a feature, not a bug. Together they produce something better than any single model working alone.

You choose who does what, or let Vibestrate pick a sensible crew for you.

## You stay in control

It never gets ahead of you. Every task runs in a separate, throwaway copy of your project, so your real files are never touched. Your checks run. Every prompt, output, and decision is recorded. Then it stops at one of three outcomes and leaves the call to you:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is ready for you to keep.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>It needs a decision from you.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something went wrong mid-run.</span></div>
</div>

It never pushes your code and never merges for you - see [the safety guarantees](/docs/concepts/safety).

## Run one in a sentence

```bash
vibe run "Add audit logging to the settings flow"
```

Vibestrate makes a safe copy, plans the change, writes it, runs your tests, reviews it, double-checks the result, and hands it back for your call. That is the whole loop. Everything else in these docs is detail on top of it.

It works with the coding tools you already have: Claude Code, Codex, Gemini, Aider, Ollama, and OpenCode.

## Where to start

<div class="docs-cards">

**[Get the big picture first](/docs/getting-started/big-picture)**
The one short read that makes everything click - Task, Flow, and Crew, told as a simple story.

**[Get started in 5 minutes](/docs/getting-started/installation)**
Install it, point it at a model, run your first task.

**[Understand the concepts](/docs/concepts/task)**
Tasks, the crew of models, providers, Flows, skills, and the safe copies it works in.

**[Look up the details](/docs/reference/cli)**
Every command, every setting, every built-in Flow.

**[Make it your own](/docs/extending/add-skill)**
Add skills, add models, or write your own Flow.

</div>

## What makes it different

<div class="docs-cards">

**A supervisor, not a chatbot.** It runs the work, judges it, and reports back with real feedback. The terminal and dashboard are how you watch and steer.

**An advisor you can ask.** [Consult](/docs/concepts/consult) knows your project, and Vibestrate itself, and answers without touching your code.

**Many models, one task.** Different AIs each bring their own view, and Vibestrate makes them check each other instead of rubber-stamping.

**Yours, on your machine.** No cloud account, no server in the middle. The only network calls are the ones your coding tools already make.

**Fully on the record.** Every run is saved under `.vibestrate/runs/<runId>/`. Read it back, replay it, or audit it.

</div>
