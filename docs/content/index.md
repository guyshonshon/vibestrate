---
title: Amaco docs
description: Local-first orchestration for the coding agents you already use. A supervised plan → build → review → verify loop in isolated git worktrees.
section: start
slug: index
---

Amaco runs software tasks through the coding-agent CLIs you already have on your machine — Claude Code, Codex, Aider, Ollama, OpenCode — and keeps every turn inspectable. It creates a git worktree, streams the agent's output, runs your project's validation commands, records artifacts, and stops at `merge_ready`, `blocked`, or `failed`. It does not push and does not merge for you.

Think of it as the missing supervisor for vibe-coding. You define the flow — plan with one model, implement with another, review with a third — and Amaco runs each phase under one visible, auditable process.

## Reading paths

<div class="docs-cards">

**[Get started in 5 minutes](/docs/getting-started/installation)**
Install, configure a provider, run your first task.

**[Understand the concepts](/docs/concepts/task)**
Tasks, agents, providers, Flows, skills, worktrees — what each one is, and why it exists.

**[Inspect the reference](/docs/reference/cli)**
Every CLI command, every config key, every built-in Flow — generated from source.

**[Extend Amaco](/docs/extending/add-skill)**
Add skills, providers, or your own Flow.

</div>

## What Amaco is

- **Local-first.** No cloud backend, no hosted relay. Amaco never sends your code to its own infrastructure — the only network calls are the ones your provider CLIs already make.
- **Provider-agnostic.** Any local CLI that can take a prompt on stdin and produce a diff can be wired in. Claude Code is preset-ready; Codex, Aider, Ollama, and OpenCode are detected and configurable.
- **Worktree-isolated.** Every run gets its own git worktree. The orchestrator never edits your project root.
- **Inspectable.** Every prompt, output, metric, event, and approval is recorded under `.amaco/runs/<runId>/`. You can read, replay, or audit any past run.
- **Human-gated.** Reviews, approvals, merges — anything that affects shared state — is always explicit. No auto-push, no auto-merge.

## What it is not

- **Not a chat UI.** Amaco is a workflow engine. The terminal and dashboard are surfaces for inspecting and steering it.
- **Not a hosted service.** There is no cloud SaaS edition.
- **Not a model.** Amaco doesn't ship a model. It orchestrates the ones you choose to run locally.

## A typical run, in one sentence

You write `amaco run "Add audit logging to the settings flow"`, Amaco creates a worktree, the planner agent writes a plan, the executor edits files, the validator runs your tests, the reviewer reads the diff, the verifier confirms the result, and you decide whether to merge.

That's the loop. Everything in these docs is detail on top of it.
