---
title: Vibestrate docs
description: Vibestrate is a CTO for your AI coding - it breaks a task down, runs it across several models, supervises the work, and leaves the decision to you.
section: start
slug: index
---

Vibestrate gives you a CTO for your AI coding. You hand it a task, even one you could not write yourself - a security fix, a piece of WebGL you have never touched - and it breaks the work down, hands each part to the right AI, and supervises the whole thing the way a senior engineer would.

Because AI can write that code. AI also gets it wrong.

<div class="docs-callout">

**It is not a yes-man.** A chat assistant agrees with you and hands back whatever you asked for. Vibestrate questions its own work. It plans, reviews the result with a fresh set of eyes, and tells you what it actually thinks - the risks, the trade-offs, the parts worth a second look.

</div>

## The crew is the point

Vibestrate's real edge is running several AIs, of different models, on one task. One plans. Another builds. A different one reviews the change cold. Each model reads the problem from its own angle, and the disagreement between them is a feature, not a bug. Together they produce something better than any single model working alone.

<div class="docs-flow">
<div><b>Plan</b><span>A strong model breaks the task into a real plan.</span></div>
<div><b>Build</b><span>Another writes the code, in a safe copy of your project.</span></div>
<div><b>Review</b><span>A different model reads the change with fresh eyes.</span></div>
<div><b>Verify</b><span>A final pass checks the result against your tests.</span></div>
<div><b>You decide</b><span>Keep it, send it back, or throw it away.</span></div>
</div>

You choose who does what, or let Vibestrate pick a sensible crew for you.

## You stay in control

It never gets ahead of you. Every task runs in a separate, throwaway copy of your project, so your real files are never touched. Your checks run. Every prompt, output, and decision is recorded. Then it stops at one of three outcomes and leaves the call to you:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is ready for you to keep.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>It needs a decision from you.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something went wrong mid-run.</span></div>
</div>

It never pushes your code and never merges for you. That part is always yours.

## Run one in a sentence

```bash
vibe run "Add audit logging to the settings flow"
```

Vibestrate makes a safe copy, plans the change, writes it, runs your tests, reviews it, double-checks the result, and hands it back for your call. That is the whole loop. Everything else in these docs is detail on top of it.

It works with the coding tools you already have:

<div class="docs-chips">
<span>Claude Code</span><span>Codex</span><span>Gemini</span><span>Aider</span><span>Ollama</span><span>OpenCode</span>
</div>

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

**An advisor you can ask.** [Consult](/docs/concepts/consult) knows your project and answers questions read-only, without changing a thing.

**Many models, one task.** Different AIs each bring their own view, and Vibestrate makes them check each other instead of rubber-stamping.

**Yours, on your machine.** No cloud account, no server in the middle. The only network calls are the ones your coding tools already make.

**Fully on the record.** Every run is saved under `.vibestrate/runs/<runId>/`. Read it back, replay it, or audit it.

**Always your call.** Nothing is pushed or merged behind your back.

</div>

## What it is not

<div class="docs-cards">

**Not a chat window.** Vibestrate runs and supervises the work. You watch and decide.

**Not a paid online service.** There is no cloud version to sign up for.

**Not an AI model of its own.** It brings no model. It directs the ones you choose to run.

</div>
