---
title: Inspect a run in flight
description: Where to watch a run as it happens, and where every detail is saved.
section: workflows
slug: workflows/inspect-progress
---

When Vibestrate is doing work for you, you can watch it as it goes. There are three places to look.

## The terminal

If you start a run with the plain `vibe run` command, the terminal prints a header for each stage. The header shows the current status, the name of the agent doing the work, and any output it captured. When the checks run (the "validation" step that runs commands to confirm the work holds up), the output of those commands streams straight to your screen.

## The dashboard

`vibe run "..." --ui` opens Mission Control, a web dashboard, next to the run. Submit a brief from Mission Control and it takes you straight to the run screen.

The main thing to watch on the run screen is the **Live timeline**. It shows one row per step in the flow. Each row gives you:

- its status,
- the role and profile in the seat (the "seat" is which kind of agent is in the chair and which settings it is using),
- the elapsed time, ticking up while it works,
- a live tail of what the model is writing right now.

Expand a row to see everything about that seat: the prompt it received, its full live transcript (the text, the thinking, and the tool activity, all as they stream in), and its response once it is done.

Around the timeline you also get:

- **Live metrics** - token usage and cost, as the provider reports them.
- **Changed files** - the files the run has touched so far. Click a file to see its diff or its full contents inline, read from the run's worktree (the isolated copy of your project the run works in).
- **Live execution** - a raw console over every recorded provider stream.

The **Git** tab gives you the live diff against `main` as the run works, so you can see exactly what is changing.

## The files on disk

Everything is recorded at `.vibestrate/runs/<runId>/`:

```text
.vibestrate/runs/abc123/
  state.json                 current status, transitions
  events.jsonl               every transition event, append-only
  metrics.json               tokens, durations, costs (where reported)
  plan.md                    planner's output
  architecture.md            architect's output
  execution.log              executor's stream
  validation.json            commands run + exit codes + output
  review.md                  reviewer's findings + decision
  verification.md            verifier's summary + decision
  prompts/                   raw prompts sent to each provider
  outputs/                   raw responses received
```

The `events.jsonl` file is the source of truth for what happened. Every state transition is one JSON line, and the file is append-only (lines are only added, never changed). Use it to dig into a run after the fact:

```bash
cat .vibestrate/runs/abc123/events.jsonl | jq -c 'select(.type == "status-change")'
```

## Read past runs

To look back at a run that already finished:

```bash
vibe replay <runId>
```

Replay is a read-only inspector for any saved run. It is handy for runs that finished long ago, runs from another machine that synced over, or any run you did not watch live.

## Related

- [Run state](/docs/concepts/state) - what the status field means.
- [Debug a failed run](/docs/workflows/debug-failed).
