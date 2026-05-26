---
title: Inspect a run in flight
description: What to look at while a run is happening, and where every detail is recorded.
section: workflows
slug: workflows/inspect-progress
---

There are three surfaces for watching a live run.

## The terminal

The default `amaco run` command prints a header per stage with the current status, the agent name, and any captured output. When validation runs, the validation command's stdout streams directly.

## The dashboard

`amaco run "..." --ui` starts Mission Control alongside the run. The **Board** view shows:

- Phase rail — which stage is current.
- Agent name and provider for that stage.
- Live token usage (where the provider reports it).
- Approvals waiting (if any).

The **Git** tab gives you the live diff against `main` as the executor and fixer work.

The **Suggestions** tab populates as the reviewer files findings.

## The on-disk artifacts

Everything is recorded at `.amaco/runs/<runId>/`:

```text
.amaco/runs/abc123/
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
cat .amaco/runs/abc123/events.jsonl | jq -c 'select(.type == "status-change")'
```

## Read past runs

```bash
amaco replay <runId>
```

Replay is a read-only inspector for any persisted run. Use it for runs that finished long ago, runs from another machine that synced over, or any run you didn't watch live.

## Related

- [Run state](/docs/concepts/state) — what the status field means.
- [Debug a failed run](/docs/workflows/debug-failed).
