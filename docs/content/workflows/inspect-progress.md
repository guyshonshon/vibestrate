---
title: Inspect a run in flight
description: Where to watch a run as it happens, and where every detail is saved.
section: workflows
slug: workflows/inspect-progress
---

When Vibestrate is doing work for you, you can watch it as it goes. There are three places to look.

<div class="docs-callout">

**Pick the surface that fits the moment.** The terminal for a quick glance while it runs, the dashboard for the full live picture, and the files on disk for the complete record you can read back at any time.

</div>

<div class="docs-cards">

**The terminal**
A per-stage header right where you started the run. Status, the agent at work, and the check output streaming to your screen.

**The dashboard**
Mission Control, a web view next to the run. A live timeline of every step, plus metrics, changed files, and the running diff.

**The files on disk**
Everything written under `.vibestrate/runs/<runId>/`. The full, append-only record of the run, there to read back whenever you want.

</div>

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

Opening **Source** for the run gives you the live diff against `main` as it works, so you can see exactly what is changing.

## The files on disk

Everything is recorded at `.vibestrate/runs/<runId>/`:

```text
.vibestrate/runs/bold-lovelace/
  state.json                       current status, transitions
  events.ndjson                    every event, append-only
  actions.ndjson                   every brokered action (writes, commands) + its verdict
  runtime-metrics.json             tokens, durations, costs (where reported)
  flow.json                        the resolved flow snapshot for this run
  participants.json                which role/profile filled each seat
  artifacts/
    flows/
      <step-id>/
        prompt.md                  the prompt sent to the provider for that step
        output.md                  the provider's response
        validation-results.json    commands run + exit codes, if the step validates
        validation/
          <n>-<command>.stdout.txt per-command stdout
          <n>-<command>.stderr.txt per-command stderr
```

Run ids are docker-style pairs like `bold-lovelace`, not sequential numbers;
runs are listed in the order you started them, not by id.

<div class="docs-callout">

**`events.ndjson` is the source of truth.** Every event is one JSON line, and the file is append-only, so lines are only added, never changed. It is the record to trust when you want to know exactly what happened.

</div>

Use it to dig into a run after the fact:

```bash
cat .vibestrate/runs/bold-lovelace/events.ndjson | jq -c 'select(.type == "state.changed")'
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
