---
title: Task lifecycle
description: How a task moves through statuses, with the fix loop and the approval gates.
slug: task-lifecycle
---

Every task moves through a fixed sequence of statuses, and Vibestrate won't let it skip a step or jump backward. Think of it like a package working through delivery: it goes through sorted, in transit, and out for delivery in order, and each scan tells you exactly where it is right now.

It comes to rest in one of four places, and which one is the whole answer to "what do I do next":

```text
merge_ready  the diff passed; read it and merge, or drop it
blocked      review or verification says stop; read the findings
failed       an error broke a stage mid-run
aborted      you ran vibe abort; the worktree is kept
```

## The happy path

When nothing goes wrong, a task walks through every status once and finishes ready to merge.

The full status sequence, in order:

```text
created → planning → planned → architecting → architected
       → executing → validating → reviewing → verifying → merge_ready
```

A successful run touches every non-terminal status once, lands in `merge_ready`, and leaves a diff on the worktree branch.

## When the reviewer asks for changes

The review step can send work back. When it does, the task loops through a fix-and-recheck cycle instead of moving on.

```text
reviewing → fixing → validating → reviewing → verifying → merge_ready
```

<div class="docs-callout">

**The fix loop has a budget.** A `CHANGES_REQUESTED` review sends the run back into `fixing`, validation re-runs, and the reviewer looks again. The default flow allows 3 passes - the first review plus 2 fix cycles. A run still asking for changes when the budget runs out ends `blocked`. `workflow.maxReviewLoops` can lower any flow's budget; a Crew's own `maxReviewLoops` overrides both.

</div>

## When a stage needs your approval

A stage can be set to hold for you once its work is done, before the run moves past it.

```text
... → executing → waiting_for_approval → executing → ...
```

<div class="docs-callout">

**The gate holds until you decide.** List a stage under `policies.requireApprovalAtStages` and the run pauses there once, on the first pass through it, with the reason "project policy requires approval before continuing past the *stage* stage." An agent can also ask for a gate of its own by emitting `HUMAN_APPROVAL: REQUIRED`. Either way the run sits at `waiting_for_approval` until you run `vibe approvals approve`, `reject`, or `request-changes`, then continues from the status it paused in.

</div>

## When you pause it yourself

You can stop a running task and start it again later, and it picks up from where it left off.

```text
... → executing → paused → executing → ...
```

`vibe pause <runId>` sets a flag the orchestrator picks up at the next stage boundary. The run transitions to `paused`; `pausedAtStatus` records where to resume. `vibe resume <runId>` clears the flag.

## Where a task can come to rest

The four terminal statuses in more detail - what each means and what it gives you:

- **`merge_ready`** - Verifier passed. The diff is ready to ship.
- **`blocked`** - Reviewer or verifier said the run should not continue. On the dashboard, a run blocked by review offers **See review** (the reviewer's decision and findings) and **Re-run with fixes** (forks a new run that reuses this run's plan and architecture, then re-implements); the shell run view lists the first three finding headlines under the `review` line.
- **`failed`** - Unrecoverable error during a stage. Read `events.ndjson` and the provider stream log.
- **`aborted`** - User explicitly aborted. Worktree is preserved.

## What a run leaves on disk

Each flow step writes its prompt and the provider's reply under the run folder, named after the step rather than the status. For the default flow the step ids are `plan`, `architecture`, `implement`, `validation`, `review`, `fix`, `revalidation`, and `verify`.

```text
.vibestrate/runs/<runId>/
  state.json                    current status, transitions
  events.ndjson                 every event, append-only
  actions.ndjson                every brokered action + its verdict
  artifacts/flows/
    <step-id>/prompt.md         what the provider was sent
    <step-id>/output.md         what it replied
    <step-id>/validation-results.json   commands run + exit codes
    findings.json               the reviewer's findings
    finding-responses.json      how the fixer answered each one
```

The code changes themselves are commits in the run's worktree, not files here. `events.ndjson` is the record to trust: one JSON line per event, append-only.

## Going deeper

- [Run state](/docs/concepts/state) - what each status means in detail.
- [Workflow](/docs/concepts/workflow) - the stage definitions.
- [Run-state reference](/docs/reference/state-machine) - the full enum and transition rules.
