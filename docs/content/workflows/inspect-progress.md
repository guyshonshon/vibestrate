---
title: Inspect a run in flight
description: Where to watch a run as it happens, and where every detail is saved.
slug: workflows/inspect-progress
---

## In simple words

While Vibestrate is working you can watch it. The dashboard is the primary place; the terminal and the files on disk are the automation paths to the same record.

<div class="docs-cards">

**The dashboard**
The full live picture: steps ticking over, tokens, spend, the diff so far.

**The interactive shell**
`vibe` opens the same run panel in the terminal, on page `5`.

**The terminal**
`vibe logs` for what a provider actually wrote.

**The files on disk**
The complete record, readable at any time, including long after the run.

</div>

<div class="docs-callout tip">

**Tip.** You do not have to watch. The run does the same thing either way, and the record is written as it happens, so walking away costs you nothing you cannot read back later.

</div>

<div class="docs-callout">

**Did you know?** Because the record is on disk as the run goes, a crash still leaves everything decided up to that point. There is no buffer to lose when the process dies.

</div>

## The dashboard

`vibe ui` opens Mission Control; `vibe run "..." --ui` opens it alongside a run you are starting. **New run** in the dashboard launches in the background and drops you on the run screen.

The main thing to watch is the **Live timeline**: one row per step in the flow, each carrying

- its status,
- the role and profile in the seat - which agent is in the chair, on which settings,
- the elapsed time, ticking up while it works,
- a live tail of what the model is writing.

Expand a row for that seat's prompt, its full transcript (text, thinking and tool activity as they stream), and its response.

Around the timeline:

- **Live metrics** - token usage and cost, as the provider reports them.
- **Changed files** - what the run has touched so far. Click one to see its diff or full contents, read from the run's worktree.
- **Live execution** - a raw console over every recorded provider stream.
- **Workspace** - the worktree path and branch, with a copyable `cd`.
- **Artifacts** - the inspector tab holding the changed-file list and the diff viewer together.

The **Source** page's **Changes** tab reads the same diff against `main`, for the project and for any run's worktree.

## The interactive shell

`vibe` opens the [interactive shell](/docs/cli/shell); page `5` is **Runs**. The scheduler queue sits at its top, active runs show the current agent, MCP servers and skills, and finished runs say why they ended. `tab` switches the inspector section, `/` filters the events tail, and `p` / `r` / `a` pause, resume or abort the selected run.

## The terminal

A plain `vibe run` narrates itself: one line per flow step as it starts, warnings as they come up, and a final block with the run's status, the review and verification decisions, and the paths to its artifacts, worktree and branch.

That is a summary, not the model's own output. To read what a provider actually wrote, tail its stream:

```bash
vibe logs <runId> --follow
```

Streams are recorded per step in the run's own `streams/` folder, so `vibe logs` works on a finished run too. Without `--follow` it prints the newest stream and exits, and `--stream` picks a specific one by name.

## The files on disk

Everything is recorded at `.vibestrate/runs/<runId>/`:

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

Each flow step gets its own folder under that last path, holding what it was asked and what it answered:

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

Every line in `events.ndjson` is one JSON object: a timestamp, an event `type`, a human `message`, sometimes a data payload. One filter pulls out the whole status history:

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

## Read past runs

Open any run from the **Runs** page and the **Inspect** section's **Replay** tab walks it start to finish. It works on a run that finished long ago, one synced from another machine, one you never watched live.

Replay is read-only wherever you open it: it reads what the run recorded and changes nothing.

*From a terminal:* `vibe replay <runId>`.

## Related

- [Run state](/docs/concepts/state) - what the status field means.
- [Debug a failed run](/docs/workflows/debug-failed).
