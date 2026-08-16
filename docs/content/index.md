---
title: Vibestrate docs
description: Vibestrate is where your AI coding agents work together - one shared plan, one set of rules, one record. It runs the CLIs you already have and leaves the final call to you.
slug: index
---

You already have the models. What you do not have is a way to put several of them on one task without doing the logistics by hand: pasting the same context into each tool, keeping a spare checkout so a risky change cannot hurt you, carrying one model's output into the next one's prompt, and noticing when they quietly drift apart.

Vibestrate is the frame they work inside. One plan, your rules, the gates you chose, one record of what happened. It drives the coding CLIs already installed on your machine, and the final call stays yours - see [why a human stays in the loop](/docs/getting-started/why-a-human).

<svg viewBox="0 0 560 96" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A task goes in, the run plans, builds, reviews and verifies it inside a worktree on its own branch, and the decision comes back to you.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="26" width="88" height="30" rx="8"/>
    <rect x="104" y="14" width="364" height="54" rx="10" stroke-dasharray="4 4"/>
    <rect x="116" y="26" width="76" height="30" rx="6"/>
    <rect x="204" y="26" width="76" height="30" rx="6"/>
    <rect x="292" y="26" width="76" height="30" rx="6"/>
    <rect x="380" y="26" width="76" height="30" rx="6"/>
    <rect x="484" y="26" width="75" height="30" rx="8"/>
    <path d="M89 41h9"/>
    <path d="M468 41h9"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M98 37l6 4-6 4z"/>
    <path d="M477 37l6 4-6 4z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="45" y="45">your task</text>
    <text x="154" y="45">plan</text>
    <text x="242" y="45">build</text>
    <text x="330" y="45">review</text>
    <text x="418" y="45">verify</text>
    <text x="521" y="45">your call</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="286" y="84">a worktree on its own branch</text>
  </g>
</svg>

A run works in a separate git worktree on its own branch, so it never edits your working tree. It never pushes and never merges. Every prompt, output, and decision is written under `.vibestrate/runs/`, one folder per run. The run then stops at one of four outcomes and hands the decision back to you:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is finished and waiting for your call.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier found something you should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something broke mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself.</span></div>
</div>

<div class="docs-callout">

**Where the worktree boundary ends.** `node_modules`, `.venv` and `venv` are symlinked from your project into the worktree, so your tests can actually run there. An agent with write permission can write back through those links into your project's installed dependencies. It never reaches your tracked source, and `git.linkEnvironment: off` turns the links off.

</div>

## The crew is the point

Vibestrate's real edge is running several AIs, of different models, on one task. The default flow has six seats - planner, architect, implementer, reviewer, fixer and verifier - and you decide which model sits in each, or let Vibestrate pick a crew for you.

Every seat gets the same plan and the same project context, so nobody starts over. The reviewer reads the diff cold, and a separate verifier seat takes the last look. Disagreement between them is the point: a model reviewing its own work can only lower its own confidence.

## Run one in a sentence

```bash
vibe run "Add audit logging to the settings flow"
```

Vibestrate makes the worktree, plans the change, writes it, runs your validation commands, reviews it, verifies the result, and hands it back for your call. That is the whole loop. Everything else in these docs is detail on top of it.

It detects eleven providers by name. Five of them it can configure on its own - claude, codex, gemini, aider and ollama - and the rest it walks you through. See [the provider reference](/docs/reference/providers) for what each one needs:

<div class="docs-chips"><span>Claude Code</span><span>Codex CLI</span><span>Gemini CLI</span><span>OpenCode</span><span>Aider</span><span>Ollama</span><span>Qwen Code</span><span>Crush</span><span>Goose</span><span>Cursor CLI</span><span>Amp</span></div>

## Where to start

<div class="docs-cards">

**[Get the big picture first](/docs/getting-started/big-picture)**
The one short read that makes everything click - Task, Flow, and Crew, told as a simple story.

**[Get started in 5 minutes](/docs/getting-started/installation)**
Install it, point it at a model, run your first task.

**[Understand the concepts](/docs/concepts/task)**
Tasks, the crew of models, providers, Flows, skills, and the worktrees runs work in.

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

**Yours, on your machine.** No cloud account, no server in the middle. Your coding tools make their own calls with the credentials they already hold. Nothing leaves your machine unless you ask it to: browsing the Flow Hub, importing a Flow by URL, fetching a skill, passing `--context-url`, exporting metrics to your own collector, or configuring an `http-api` provider that calls a model API directly.

**Fully on the record.** Every run is saved under `.vibestrate/runs/`. Read it back, replay it, or audit it.

</div>
