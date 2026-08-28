---
title: Run
description: One attempt at a task, driven through a flow by a crew, in its own copy of your repo.
slug: concepts/run
---

## In simple words

You have a [[task]] (what you want done), a [[flow]] (the recipe), and a [[crew]] (who does it). A **Run** is what happens when you put those three together and press go.

One run is one attempt. It gets its own copy of your repository to work in, walks the flow's steps in order, and stops at a verdict. Your actual branch is untouched the whole time.

`vibe ui` opens the dashboard on `127.0.0.1:4317` and lands on **Mission control**: the supervisor, the new-run composer, and a **Waiting on you** deck of anything holding for your approval. The sidebar lists every live run, and clicking one opens **Run detail**.

<div class="docs-callout tip">

**Tip.** A run is cheap to throw away: abandoning one costs you the tokens it spent and nothing else. That is what makes it safe to try something.

</div>

Everything a run is fits in the top of that page:

![The header of a finished run. A green panel on the left reads Run, merge ready. Beside it the task, then Flow Default with its eight steps listed in order - Plan, Architecture, Implement, Validate, Review, Fix, Re-validate, Verify - and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.](/media/docs/scoped/run-header.png)

**View diff** sits in the header row, and **Re-run with changes** joins it there once the run is finished. **Pause** and **Abort** are a level down, on the status hero, for as long as the run is live.

## How a run ends

A run always lands in one of four places, and only the first is mergeable.

<div class="docs-outcomes">
<div class="docs-outcome ok">

**merge_ready**
Every step passed. The change is waiting for you to take it.

</div>
<div class="docs-outcome warn">

**blocked**
Something refused. A policy, a review, or a failed check.

</div>
<div class="docs-outcome bad">

**failed**
A step crashed. The failing step's own output says why.

</div>
<div class="docs-outcome stop">

**aborted**
You stopped it.

</div>
</div>

Between `created` and one of those four, a run moves through whichever states its flow needs, pausing at `waiting_for_approval` whenever a gate asks for you. [[state]] has the full list.

## Reading the verdict

**Run assurance** splits `merge_ready` into four lanes rather than collapsing them into a thumbs up:

![The Run assurance panel reading verified, with the summary policy passed, review, validation, verification passed. Below it five tiles: Policy passed, Validation passed 2 of 2, Review approved, Verification passed, and the supervisor that judged it, staff-engineer.](/media/docs/scoped/run-assurance.png)

When a lane goes badly the panel grows the button that answers it: **View review** for the findings, **View validation** for the commands that failed, **Re-run with fixes** to fork a run reusing this one's plan and architecture.

<div class="docs-callout">

**Did you know?** The reviewer that approves a diff never inherits the session of the model that wrote it. It starts a fresh process and reads the change cold, the way a colleague would. A model reviewing its own transcript mostly agrees with itself.

</div>

## Watching one live

Below the verdict the run page is a board you can rearrange: **Live timeline**, **Live metrics**, **Changed files**, and **Live execution** for the provider's raw output. While the run is still going, Supervisor Control sits under them so you can steer it mid-flight.

At the bottom sits **Inspect**: Tree, Steps, Events, Artifacts, Validation, Terminal, Replay. Artifacts holds the diff, file by file; Terminal opens a shell already inside the run's copy of the repo.

## The same run in the terminal

`vibe` on its own (or `vibe shell`) opens the interactive shell. Its **Runs** tab is a list on the left and an inspector on the right with Overview, Events, Validation and Audit tabs. Pause, resume and abort live in the `:` palette.

## The three verdicts

Review answers `APPROVED`, `CHANGES_REQUESTED` or `BLOCKED`. Verification answers `PASSED`, `FAILED` or `NEEDS_HUMAN`. A `CHANGES_REQUESTED` does not end the run; it sends the work to the fix step and back round for re-validation, which is why the default flow lists Fix and Re-validate after Review.

`NEEDS_HUMAN` is the honest answer when the evidence supports neither a pass nor a fail. It stops rather than guessing.

## Isolation

Every run gets its own git [[worktree]]: a real checkout on its own branch, sharing your repository's object database. Nothing is pushed or merged without you. The **Workspace** panel names the path.

![The Workspace panel of a run, naming the branch and showing the run's isolated git worktree path, with a Copy cd button.](/media/docs/scoped/run-workspace.png)

## What is recorded

Tokens, spend and duration per step, every supervisor decision, the diff, and the validator output. All of it is written locally as the run happens, which makes a finished run something you re-read rather than remember.

## What a run carries

`state.json` holds around forty fields. These are the ones that decide what the
run does next.

| Field | What it is |
|---|---|
| `runId` | Its identity, and the name of its directory and branch. |
| `status` | Where it is, from the fixed set of sixteen. |
| `branchName`, `worktreePath` | The branch it commits to and the worktree it works in. |
| `flow` | The resolved flow, snapshotted at start. Editing the flow mid-run changes nothing. |
| `crewId`, `taskId` | The crew it was cast from, and the task card it belongs to. |
| `reviewLoopCount`, `maxReviewLoops` | How many review and fix cycles it has spent, and its ceiling. |
| `finalDecision`, `verification` | The reviewer's verdict and the verifier's. |
| `permissionMode`, `readOnly` | How much rope this run gets. |
| `pauseRequested`, `pausedAtStatus`, `abortRequested` | The two ways it stops, and where to resume. |
| `pendingApprovalId` | The gate it is holding at, when it is holding. |
| `ownerPid` | The process that owns it, so a dead owner is detectable. |

<svg viewBox="0 0 560 178" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A run carries its own identity, branch, worktree and verdict, plus a snapshot of the flow it resolved. Four of those fields are what make a run resumable after the process that started it is gone.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="0" y="0" width="270" height="160" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="330.5" y="96.5" width="210" height="40" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="330.5" y="20.5" width="210" height="40" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M274 62 L300 62 L300 40 L326 40"/>
    <path d="M274 96 L300 96 L300 116 L326 116"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="320,36.5 326,40 320,43.5"/>
    <polygon points="320,112.5 326,116 320,119.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="435" y="39">resumable</text>
    <text x="435" y="115">auditable</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="10" y="17" text-anchor="start">state.json</text>
    <text x="16" y="40" text-anchor="start" fill-opacity="0.92">runId</text>
    <text x="16" y="58" text-anchor="start" fill-opacity="0.92">status</text>
    <text x="16" y="76" text-anchor="start" fill-opacity="0.92">branchName</text>
    <text x="16" y="94" text-anchor="start" fill-opacity="0.92">worktreePath</text>
    <text x="16" y="112" text-anchor="start" fill-opacity="0.92">flow</text>
    <text x="16" y="130" text-anchor="start" fill-opacity="0.92">crewId</text>
    <text x="16" y="148" text-anchor="start" fill-opacity="0.92">reviewLoopCount</text>
    <text x="435" y="54">status + loops + flow</text>
    <text x="435" y="130">events + actions + verdict</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="254" y="40" text-anchor="end">its identity</text>
    <text x="254" y="58" text-anchor="end">one of sixteen</text>
    <text x="254" y="76" text-anchor="end">its own branch</text>
    <text x="254" y="94" text-anchor="end">outside the repo</text>
    <text x="254" y="112" text-anchor="end">the snapshot</text>
    <text x="254" y="130" text-anchor="end">-&gt; Crew</text>
    <text x="254" y="148" text-anchor="end">number</text>
    <text x="330" y="76" text-anchor="start">picked back up after the</text>
    <text x="330" y="92" text-anchor="start">owning process is gone</text>
  </g>
</svg>

What the run record is for: enough state to be picked back up, and enough evidence to be audited afterwards.

Four of these are why a run is resumable at all: `status`, `reviewLoopCount`, the
flow snapshot and the worktree path are enough to pick a run back up after the
process that started it is gone. The shape is `runStateSchema` in
`src/core/state-machine.ts`.

## Automation

Drivable from a script or over SSH; see the [CLI overview](/docs/cli/overview).

```bash
vibe run "describe the change"
vibe status
vibe replay <runId>
vibe abort <runId>
```

Next: [[state]] is where a run has got to, and what is allowed to move it.
