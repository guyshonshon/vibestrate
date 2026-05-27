---
title: Mission Control
description: The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.
section: cli
slug: cli/dashboard
---

Mission Control is Amaco's web UI. It's served by a Fastify process started on demand — fully local, never connected to a remote backend.

## Start it

```bash
amaco ui
```

Default port is `4317`. Pass `--port` to change it. By default it opens your browser; `--no-open` keeps it headless.

You can also start a run with the dashboard attached:

```bash
amaco run "Add audit logging" --ui
```

## The shape

- **Board** — the active runs, with phase rails, current agent, and live status.
- **Tasks** — your backlog: queued, running, completed, failed, aborted.
- **Crew** — the workflow **roles** (planner, architect, executor, fixer, reviewer, verifier); set the **provider** each role runs on inline (configured providers only). A role is a seat in the workflow; a provider is the CLI it runs on — one provider can power many roles. Adding/configuring providers happens on the **Providers** page.
- **Flows** — the resolved list of built-in and project Flows, plus the steps each defines.
- **Providers** — the CLIs your roles run on: what's installed, what's configured, test each one.
- **Approvals** — pending policy-gated decisions.
- **Git** — inline diff viewer for the active run's worktree, with file-by-file navigation.
- **Suggestions** — review findings grouped into bundles you can apply, validate, and revert.
- **Notifications** — local notifications, with gateway controls.

## Jumping between runs

Press **Cmd/Ctrl-K** (or `g r`) anywhere to open the **run switcher** — a search box over your recent runs. Filter by task, runId, or status and hit Enter to jump straight to a run; you don't have to go through the "all runs" page. Every run is also directly linkable at `#/runs/<runId>`.

## Watching a run

Open a run to supervise it live:

- **Status hero** — the task, a phase rail that follows the *actual* steps (the
  Flow's own steps for a Flow run, not a fixed workflow), and a live
  "Now ⟨step⟩ · ⟨agent⟩" line.
- **Live execution** — the raw provider CLI output in a real terminal. Note:
  agents run **headless** (`claude -p`, etc.), and CLIs in print mode buffer
  their answer until they exit — so this fills in when each step completes
  rather than token-by-token. (Live streaming is on the roadmap via structured
  output; see `docs/design/provider-structured-output.md`.)
- **Changed files** — what the run touched, beside live execution; click one to
  open it in the worktree view. New (untracked) files count their real lines.
- **Live metrics** — run-level tokens, cost, tool calls, and provider calls that
  accumulate as steps finish.
- **Steps inspector** — one card per agent step: provider+model, pass/fail,
  duration, tokens, cost, files touched, and review/verification outcome.
- **Inspect tabs** — Events, Artifacts (with the diff viewer), Validation.
- **Outcome banner** — when a run ends `blocked`, `failed`, or `aborted`, a
  banner explains *what* stopped it (the spend cap, a rejected approval, a
  review `BLOCKED` verdict, verification, or the raw error) and offers the
  right next action — re-run with changes, see the review, or view events.

## What the dashboard does *not* do

- It does not execute arbitrary shell commands you type. The optional terminal panel is enrolled per project and binds to a known run's worktree.
- It does not push or merge. Those remain CLI-only and explicit.
- It does not access your `.env` or any secret-shape file. The path guard refuses those paths regardless of where the request comes from.

## Stopping it

`Ctrl-C` in the terminal where `amaco ui` is running. The Fastify process exits cleanly; the runs continue (or pause at the next stage boundary, depending on what they're doing).
