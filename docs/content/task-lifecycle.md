---
title: Task lifecycle
description: How a task moves through statuses, with the fix loop and the approval gates.
slug: task-lifecycle
---

Every task moves through a fixed sequence of statuses, and Vibestrate won't let it skip a step or jump backward. Think of it like a package working through delivery: it goes through sorted, in transit, and out for delivery in order, and each scan tells you exactly where it is right now.

It comes to rest in one of four places, and which one is the whole answer to "what do I do next":

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The diff passed. Read it, then merge it or drop it.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>Review or verification says stop. Read the findings.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>An error broke a stage mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You ran vibe abort. The worktree is kept.</span></div>
</div>

## The happy path

When nothing goes wrong, a task walks through every status once and finishes ready to merge.

The full status sequence, in order:

```text
created → planning → planned
  → architecting → architected
  → executing → validating
  → reviewing → verifying → merge_ready
```

A successful run touches every non-terminal status once, lands in `merge_ready`, and leaves a diff on the worktree branch.

## When the reviewer asks for changes

The review step can send work back. When it does, the task drops into `fixing`, runs validation again, and returns to `reviewing` instead of moving on.

<svg viewBox="0 0 560 142" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The review loop: reviewing moves on to verifying and then merge_ready, but a changes-requested review sends the task to fixing, then back through validating into reviewing again.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="140" height="36" rx="8"/>
    <rect x="210" y="1" width="140" height="36" rx="8"/>
    <rect x="400" y="1" width="159" height="36" rx="8"/>
    <rect x="1" y="101" width="140" height="36" rx="8"/>
    <rect x="210" y="101" width="140" height="36" rx="8"/>
    <path d="M141 19H210M350 19H400M100 37V70H280V101M210 119H141M71 101V37"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28" stroke="none">
    <path d="M204 15 210 19 204 23Z"/>
    <path d="M394 15 400 19 394 23Z"/>
    <path d="M276 95 280 101 284 95Z"/>
    <path d="M147 115 141 119 147 123Z"/>
    <path d="M67 43 71 37 75 43Z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="71" y="24">reviewing</text>
    <text x="280" y="24">verifying</text>
    <text x="479" y="24">merge_ready</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="190" y="64">changes requested</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="71" y="124">validating</text>
    <text x="280" y="124">fixing</text>
  </g>
</svg>

<div class="docs-callout">

**The fix loop has a budget.** A `CHANGES_REQUESTED` review sends the run back into `fixing`, validation re-runs, and the reviewer looks again. The default flow allows 3 passes - the first review plus 2 fix cycles. A run still asking for changes when the budget runs out ends `blocked`. `workflow.maxReviewLoops` can lower any flow's budget; a Crew's own `maxReviewLoops` overrides both.

</div>

## When a stage needs your approval

A stage can be set to hold for you once its work is done, before the run moves past it. The task steps sideways into `waiting_for_approval` and then steps back into the status it paused in - it never skips ahead.

<div class="docs-callout">

**The gate holds until you decide.** List a stage under `policies.requireApprovalAtStages` and the run pauses there once, on the first pass through it, with the reason "project policy requires approval before continuing past the *stage* stage." An agent can also ask for a gate of its own by emitting `HUMAN_APPROVAL: REQUIRED`. Either way the run sits at `waiting_for_approval` until you approve, reject or request changes with `vibe approvals`, then continues from the status it paused in.

</div>

## When you pause it yourself

You can stop a running task and start it again later, and it picks up from where it left off. Pausing has the same sideways shape: the task holds at `paused`, then returns to the status it was in.

`vibe pause <runId>` sets a flag the orchestrator picks up at the next stage boundary. `pausedAtStatus` records where to resume, and `vibe resume <runId>` clears the flag.

## Where a task can come to rest

The four terminal statuses in more detail - what each means and what it gives you:

- **`merge_ready`** - Verifier passed. The diff is ready to ship.
- **`blocked`** - Reviewer or verifier said the run should not continue. On the dashboard, a run blocked by review offers **See review** (the reviewer's decision and findings) and **Re-run with fixes** (forks a new run that reuses this run's plan and architecture, then re-implements); the shell run view lists the first three finding headlines under the `review` line.
- **`failed`** - Unrecoverable error during a stage. Read `events.ndjson` and the provider stream log.
- **`aborted`** - User explicitly aborted. Worktree is preserved.

## What a run leaves on disk

Each flow step writes its prompt and the provider's reply under the run folder, named after the step rather than the status. For the default flow the step ids are:

<div class="docs-chips"><span>plan</span><span>architecture</span><span>implement</span><span>validation</span><span>review</span><span>fix</span><span>revalidation</span><span>verify</span></div>

```text
.vibestrate/runs/<runId>/
  state.json        current status, transitions
  events.ndjson     every event, append-only
  actions.ndjson    brokered actions + verdicts
  artifacts/flows/
    <step-id>/prompt.md    what it was sent
    <step-id>/output.md    what it replied
    <step-id>/validation-results.json
    findings.json          reviewer findings
    finding-responses.json how the fixer answered
```

`validation-results.json` holds the commands that ran and their exit codes. The code changes themselves are commits in the run's worktree, not files here. `events.ndjson` is the record to trust: one JSON line per event, append-only.

## Going deeper

- [Run state](/docs/concepts/state) - what each status means in detail.
- [Workflow](/docs/concepts/workflow) - the stage definitions.
- [Run-state reference](/docs/reference/state-machine) - the full enum and transition rules.
