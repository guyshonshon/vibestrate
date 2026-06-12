---
title: Inspect a run in flight
description: What to look at while a run is happening, and where every detail is recorded.
section: workflows
slug: workflows/inspect-progress
---

There are three surfaces for watching a live run.

## The terminal

The default `vibe run` command prints a header per stage with the current status, the agent name, and any captured output. When validation runs, the validation command's stdout streams directly.

## The dashboard

`vibe run "..." --ui` starts Mission Control alongside the run; submitting a brief from Mission Control takes you straight to the run screen. The run screen's **Live timeline** is the main surface: one row per flow step with its status, the seated role and profile, elapsed time ticking while it works, and a live tail of what the model is producing right now. Expand a row for the full picture of that seat - the prompt it received, its complete live transcript (text, thinking, and tool activity as they stream), and its response once done.

Around the timeline:

- **Live metrics** - token usage and cost as the provider reports them.
- **Changed files** - what the run has touched so far; click a file to see its diff or full contents inline, read from the run's worktree.
- **Live execution** - a raw console over every recorded provider stream.

The **Git** tab gives you the live diff against `main` as the run works.

## The on-disk artifacts

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

The `events.jsonl` file is the source of truth for what happened. Every state transition is one JSON line. Use it for after-the-fact debugging:

```bash
cat .vibestrate/runs/abc123/events.jsonl | jq -c 'select(.type == "status-change")'
```

## Read past runs

```bash
vibe replay <runId>
```

Replay is a read-only inspector for any persisted run. Use it for runs that finished long ago, runs from another machine that synced over, or any run you didn't watch live.

## Related

- [Run state](/docs/concepts/state) - what the status field means.
- [Debug a failed run](/docs/workflows/debug-failed).
