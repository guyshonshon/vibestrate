---
title: Task lifecycle
description: How a task moves through statuses, with the fix loop and the approval gates.
slug: task-lifecycle
---

## In simple words

Every task moves through a fixed sequence of statuses, and Vibestrate will not let it skip a step or jump backward.

Open a run and its status hero carries the flow's steps as a rail with the current one marked **Now**; the **Live timeline** panel ticks them over as they finish. The Status column on **All runs** is the same value for every run at once.

<div class="docs-callout tip">

**Tip.** If a status looks stuck, the sequence is the first thing to check. A task waiting at an approval gate and a task whose step crashed look similar from a distance and need completely different responses.

</div>

## Why a fixed sequence

<div class="docs-cards">

**You can tell where it is**
One status, read from a saved value, never inferred.

**No impossible history**
A task cannot reach a status along a path the state machine does not allow.

**Stuck looks different from working**
Waiting on you and crashed are distinct states, not one ambiguous "not done".

**Replayable afterwards**
The sequence is the record, so a finished task can be re-read rather than remembered.

</div>

<div class="docs-callout">

**Did you know?** The moves are enforced, not merely recorded. A task cannot land in a status nobody defined, so the history you read is the history that happened.

</div>

## The happy path

When nothing goes wrong, a task walks through every status once and finishes ready to merge.

```text
created → planning → planned
  → architecting → architected
  → executing → validating
  → reviewing → verifying → merge_ready
```

It leaves a diff on the worktree branch.

## When the reviewer asks for changes

The review step can send work back. When it does, the task drops into `fixing`, runs validation again, and returns to `reviewing` instead of moving on. The run's status hero grows a **review loop** figure reading the pass you are on against the budget.

<svg font-family="var(--font-sans)" viewBox="0 0 560 142" width="100%" style="max-width:720px;height:auto" role="img" aria-label="The review loop: reviewing moves on to verifying and then merge_ready, but a changes-requested review sends the task to fixing, then back through validating into reviewing again.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="1" width="140" height="36" rx="8"/>
    <rect fill="var(--bg-200)" x="210" y="1" width="140" height="36" rx="8"/>
    <rect fill="var(--bg-200)" x="400" y="1" width="159" height="36" rx="8"/>
    <rect fill="var(--bg-200)" x="1" y="101" width="140" height="36" rx="8"/>
    <rect fill="var(--bg-200)" x="210" y="101" width="140" height="36" rx="8"/>
    <path d="M141 19H210M350 19H400M100 37V70H280V101M210 119H141M71 101V37"/>
  </g>
  <g fill="var(--fg-300)" stroke="none">
    <path d="M204 15 210 19 204 23Z"/>
    <path d="M394 15 400 19 394 23Z"/>
    <path d="M276 95 280 101 284 95Z"/>
    <path d="M147 115 141 119 147 123Z"/>
    <path d="M67 43 71 37 75 43Z"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)" text-anchor="middle">
    <text x="71" y="24">reviewing</text>
    <text x="280" y="24">verifying</text>
    <text x="479" y="24">merge_ready</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11" text-anchor="middle">
    <text x="190" y="64">changes requested</text>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)" text-anchor="middle">
    <text x="71" y="124">validating</text>
    <text x="280" y="124">fixing</text>
  </g>
</svg>

<div class="docs-callout">

**The fix loop has a budget.** The default flow allows 3 passes - the first review plus 2 fix cycles. A run still asking for changes when the budget runs out ends `blocked`. `workflow.maxReviewLoops` can lower any flow's budget; a Crew's own `maxReviewLoops` overrides both.

</div>

## When a stage needs your approval

A stage can be set to hold for you once its work is done. The task steps sideways into `waiting_for_approval` and then back into the status it paused in, so it never skips ahead.

The run page shows an approval banner with **Approve**, **Reject** and, for an agent-raised gate, **Request changes**. Mission control collects the same gates in **Waiting on you**; the shell's **Approvals** tab decides them with `a`, `r` and `c`.

<div class="docs-callout">

**The gate holds until you decide.** List a stage under `policies.requireApprovalAtStages` and the run pauses there once, on the first pass through it, with the reason "project policy requires approval before continuing past the *stage* stage." An agent can also ask for a gate of its own by emitting `HUMAN_APPROVAL: REQUIRED`.

</div>

## When you pause it yourself

**Pause** on the run page sets a flag the orchestrator picks up at the next stage boundary, so pausing has the same sideways shape: the task holds at `paused`, then returns to the status it was in. `pausedAtStatus` records where, and **Resume** clears the flag. The shell's `:` palette carries both; a script uses `vibe pause <runId>` and `vibe resume <runId>`.

## Where a task comes to rest

The four terminal statuses in more detail:

- **`merge_ready`** - Verifier passed. The diff is ready to ship.
- **`blocked`** - Reviewer or verifier said the run should not continue. The assurance panel names the lane that refused and offers **View review** for the findings and **Re-run with fixes**, which forks a run reusing this one's plan and architecture. The shell run view lists the first three finding headlines under the `review` line.
- **`failed`** - Unrecoverable error during a stage. The run page names the error it stopped on; the **Events** tab under Inspect has the timeline around it.
- **`aborted`** - User explicitly aborted. Worktree is preserved.

## What a run leaves on disk

Each flow step writes its prompt and the provider's reply under the run folder, named after the step rather than the status. The **Artifacts** tab under Inspect reads all of this without leaving the dashboard. For the default flow the step ids are:

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

## Related

- [Run state](/docs/concepts/state) - what each status means in detail.
- [Workflow](/docs/concepts/workflow) - the stage definitions.
- [Run-state reference](/docs/reference/state-machine) - the full enum and transition rules.
