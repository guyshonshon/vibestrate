---
title: Mission Control
description: The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.
section: cli
slug: cli/dashboard
---

Mission Control is Vibestrate's web UI. A Fastify process serves it on demand, starting only when you ask for it. It's fully local and never connects to a remote backend.

## Start it

Open the dashboard with:

```bash
vibe ui
```

The default port is `4317`. Pass `--port` to change it.

It opens your browser by default. `--no-open` keeps it headless.

You can also start a run with the dashboard already attached:

```bash
vibe run "Add audit logging" --ui
```

## The pages

Mission Control is organized into these pages.

- **Board** - the active runs, with phase rails, current agent, and live status.
- **Tasks** - your backlog: queued, running, completed, failed, aborted.
- **Crew** - the workflow **roles** (planner, architect, executor, fixer, reviewer, verifier). Set the **provider** each role runs on inline, from your configured providers only. A role is a seat in the workflow; a provider is the CLI it runs on, and one provider can power many roles. You add and configure providers on the **Providers** page.
- **Flows** - the resolved list of built-in and project Flows, plus the steps each one defines.
- **Providers** - the CLIs your roles run on: what's installed, what's configured, and a test for each one.
- **Supervisors** - the read-only catalog of supervisor personas (the orchestrator's judgment posture): what each one aims the reviewers at, the flow it favors for risky work, the safety posture it suggests, and which is the project default. Mirrors `vibe supervisor list`.
- **Approvals** - pending decisions that a policy gate is holding.
- **Git** - an inline diff viewer for the active run's worktree, with file-by-file navigation.
- **Merge** - the merge window. It lists every merge-ready run with its check lanes and branch drift. For each run it gives deterministic merge advice (risk flags, a dry-run conflict report, a recommendation) before the explicit integrate and finish actions. The advice is read-only; nothing merges without you.
- **Suggestions** - review findings grouped into bundles you can apply, validate, and revert.
- **Notifications** - local notifications, with gateway controls.

## Jumping between runs

To open the **run switcher**, a search box over your recent runs, press **Cmd/Ctrl-K** (or `g r`) anywhere.

Filter by task, runId, or status and hit Enter to jump straight to a run. You don't have to go through the "all runs" page.

Every run is also directly linkable at `#/runs/<runId>`.

## Watching a run

Open a run to supervise it live. You get these panels.

- **Status hero** - the task, a phase rail that follows the *actual* steps (the Flow's own steps for a Flow run, not a fixed workflow), and a live "Now ⟨step⟩ · ⟨agent⟩" line.
- **Live execution** - the raw provider CLI output in a real terminal. Agents run **headless** (`claude -p`, etc.), and CLIs in print mode hold their answer until they exit, so this fills in when each step completes rather than token-by-token. Live streaming is on the roadmap via structured output.
- **Changed files** - what the run touched, beside live execution. Click one to open it in the worktree view. New, untracked files count their real lines.
- **Live metrics** - run-level tokens, cost, tool calls, and provider calls that accumulate as steps finish.
- **Steps inspector** - one card per agent step: provider and model, pass or fail, duration, tokens, cost, files touched, and review and verification outcome.
- **Inspect tabs** - Events, Artifacts (with the diff viewer), Validation.
- **Outcome banner** - when a run ends `blocked`, `failed`, or `aborted`, a banner explains *what* stopped it (the spend cap, a rejected approval, a review `BLOCKED` verdict, verification, or the raw error) and offers the right next action: re-run with changes, see the review, or view events.

## What the dashboard does *not* do

A few things stay out of the dashboard on purpose.

- It does not execute arbitrary shell commands you type. The optional terminal panel is enrolled per project and binds to a known run's worktree.
- It does not push or merge. Those stay CLI-only and explicit.
- It does not access your `.env` or any secret-shape file. The path guard refuses those paths no matter where the request comes from.

## Stopping it

Press `Ctrl-C` in the terminal where `vibe ui` is running.

The Fastify process exits cleanly. The runs continue, or pause at the next stage boundary, depending on what they're doing.
