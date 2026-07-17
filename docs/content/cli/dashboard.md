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

First visit, a short guided tour points out Runs, Flows, Board, Consult, and New run. Skip it any time, or take it again later from the help overlay (press `?`).

You can also start a run with the dashboard already attached:

```bash
vibe run "Add audit logging" --ui
```

## The pages

Mission Control's left sidebar is the app shell. It lists:

- **Dashboard** - the home overview.
- **Runs** - Active, Merge-ready, and Failed run lists, with the scheduler queue (what's queued, what's running, policy, concurrency) folded into the top of the list.
- **Flows** - the resolved list of built-in and project Flows, plus the steps each one defines.
- **Crew** - the workflow **roles** (planner, architect, executor, fixer, reviewer, verifier), plus a **Providers** tab (relocated here from the old standalone Providers page): what's installed, what's configured, and a test for each one. A role is a seat in the workflow; a provider is the CLI it runs on, and one provider can power many roles.
- **Source** - the single git surface, with **Changes** / **Tree** / **Merge** tabs (this is where the old separate Git and Merge pages live now). Changes is an inline diff viewer for the project's working tree and per-run worktrees, file by file. Tree is the commit graph with a merge planner (see [Merge from the git tree](/docs/workflows/git-tree-merge)). Merge lists every merge-ready run with its check lanes and branch drift, and gives deterministic advice (risk flags, a dry-run conflict report, a recommendation) before the explicit integrate and finish actions - still read-only, nothing merges without you.
- **Board** - the task kanban (roadmap -> tasks -> runs), plus a **Ledger** tab: the read-only continuity ledger (`vibe ledger`) of what shipped, what's still open, and the decisions on record.
- **Metrics** - token, cost, and run-outcome roll-ups across the project.
- **Profiles** - the provider + model + effort presets your roles run on.
- **Codebase** - the read-only project/git file tree, search, and history.

Under **More**: **Supervisors** - the read-only catalog of supervisor personas (the orchestrator's judgment posture): what each one aims the reviewers at, the flow it favors for risky work, the safety posture it suggests, and which is the project default. Mirrors `vibe supervisor list`. Also **Policies**, **Proposals**, **Project**, **Config**, **Branding canvas**, and **All projects** (the multi-project workspace switcher).

Approvals and Suggestions no longer have their own pages - they're inspector tabs on each run's detail view (see "Watching a run" below). Notifications live in the bell icon in the sidebar's utility row, not a page.

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
