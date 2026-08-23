---
title: Inspect a run in flight
description: Where to watch a run as it happens, and where every detail is saved.
slug: workflows/inspect-progress
---

## In simple words

While Vibestrate is working you can watch it. Three places to look, depending on what you want.

<div class="docs-cards">

**The terminal**
`vibe logs` for a quick glance at what step it is on.

**The dashboard**
The full live picture: steps ticking over, tokens, spend, the diff so far.

**The files on disk**
The complete record, readable at any time, including long after the run.

</div>

<div class="docs-callout tip">

**Tip.** You do not have to watch. The run does the same thing either way, and the record is written as it happens rather than at the end - so walking away costs you nothing you cannot read back later.

</div>

<div class="docs-callout">

**Did you know?** Because the record is on disk as the run goes, a run that crashes still leaves everything it had decided up to that point. There is no buffer that gets lost when the process dies.

</div>


## Going deeper

### The terminal

A plain `vibe run` narrates itself: one line per flow step as it starts, any warnings as they come up, and a final block at the end with the run's status, the review and verification decisions, and the paths to its artifacts, worktree and branch.

That is a summary, not the model's own output. To read what a provider actually wrote, tail its stream:

```bash
vibe logs <runId> --follow
```

Streams are recorded per step in the run's own `streams/` folder, so `vibe logs` works on a finished run too. Without `--follow` it prints the newest stream and exits, and `--stream` picks a specific one by name.

### The dashboard

`vibe run "..." --ui` opens Mission Control, a web dashboard, next to the run. Mission Control also has its own **New run** composer: submit a brief there and it launches in the background, then offers you an **Open** button through to the run screen.

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

### The files on disk

Everything is recorded at `.vibestrate/runs/<runId>/`, and the run folder looks like this:

```text
.vibestrate/runs/bold-lovelace/
  state.json            current status, transitions
  events.ndjson         every event, append-only
  actions.ndjson        brokered action + verdict
  runtime-metrics.json  tokens, durations, costs
  flow.json             the resolved flow snapshot
  participants.json     role + profile per seat
  streams/              raw provider output
  artifacts/flows/<step-id>/
```

Each step of the flow gets its own folder under that last path, holding what it was asked and what it answered:

```text
artifacts/flows/<step-id>/
  prompt.md                the prompt for this step
  output.md                the provider's response
  validation-results.json  commands run + exit codes
  validation/              one file per command
    <n>-<command>.stdout.txt
    <n>-<command>.stderr.txt
```

Token, duration and cost figures are recorded where the provider reports them, and the two validation entries only appear for a step that validates.

Run ids are docker-style pairs like `bold-lovelace`, not sequential numbers; runs are listed in the order you started them, not by id.

Every line in `events.ndjson` is one JSON object: a timestamp, an event `type`, a human `message`, and sometimes a data payload. Pull out the run's whole status history with one filter:

```bash
jq -r 'select(.type=="state.changed").message' \
  .vibestrate/runs/bold-lovelace/events.ndjson
```

```text
created → planning
planning → planned
...
verifying → merge_ready
```

Swap the type for `review.decision`, `verification.decision` or `action.denied` to answer a different question off the same file.

### Read past runs

To look back at a run that already finished:

```bash
vibe replay <runId>
```

Replay is a read-only inspector for any saved run. It is handy for runs that finished long ago, runs from another machine that synced over, or any run you did not watch live.

### Related

- [Run state](/docs/concepts/state) - what the status field means.
- [Debug a failed run](/docs/workflows/debug-failed).
