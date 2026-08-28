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

## When a run does not finish, the Supervisor says what it would do

A run that ends anywhere other than merge-ready records **why**, as a code
rather than as prose, read from its own evidence - the events it logged and
whether validation could run at all. The Supervisor panel at the top of the
run turns that into a proposal: one line on what stopped it, and what it
suggests doing about it. The same proposal arrives as a notification.

It speaks up about every unfinished run, including the ones it will not touch.
A refusal that stayed silent is how a stuck piece of work ends up looking like
a finished one.

Whether it acts is your **autonomy** setting, and there are only two values:

- **advise** (the default) - it proposes and stops. The panel reads *Wants to
  step in*, and says the decision is yours.
- **act** - it carries the remedy out. The panel reads *Handling this*.

Even on `act` it will only act where the fault is deterministically the
environment's - the toolchain was missing, so nothing about your code was
actually tested. It will not retry a run that merely ran out of road, and it
will not act when the evidence is absent: retrying something nobody has
diagnosed is how an automated loop spends a budget without ever converging.
Setting autonomy to `act` requires a budget ceiling, and the Supervisor's pause
switch overrides the setting - a paused Supervisor proposes and never acts.

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

<svg viewBox="0 0 500 266" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A run carries its own identity, branch, worktree and verdict, plus a snapshot of the flow it resolved. Four of those fields are what make a run resumable after the process that started it is gone.">
  <rect x="0" y="22" width="286" height="208" rx="14" fill="var(--bg-300)"/>
  <polygon points="30.1525,22 42.1525,5 81.8475,5 93.8475,22 81.8475,39 42.1525,39" fill="var(--violet-deep)"/>
  <text x="62" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Run</text>
  <text x="20" y="76" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">runId</text>
  <text x="266" y="76" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">its identity</text>
  <text x="20" y="101" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">status</text>
  <text x="266" y="101" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">one of sixteen</text>
  <text x="20" y="126" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">branchName</text>
  <text x="266" y="126" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">its own branch</text>
  <text x="20" y="151" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">worktreePath</text>
  <text x="266" y="151" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">outside the repo</text>
  <text x="20" y="176" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">flow</text>
  <text x="266" y="176" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">the snapshot</text>
  <text x="20" y="201" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)">crewId</text>
  <text x="266" y="201" font-size="11" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="end">-&gt; Crew</text>
  <rect x="330" y="44" width="170" height="56" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="415" y="70" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">resumable</text>
  <text x="415" y="88" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">status + loops + flow</text>
  <rect x="330" y="150" width="170" height="56" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="415" y="176" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">auditable</text>
  <text x="415" y="194" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">events + actions</text>
  <path d="M286 100 L308 100 L308 72 L326 72" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="318,67.5 326,72 318,76.5" fill="var(--fg-200)"/>
  <path d="M286 150 L308 150 L308 178 L326 178" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="318,173.5 326,178 318,182.5" fill="var(--fg-200)"/>
  <text x="0" y="258" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">enough state to be picked back up after the owning process is gone</text>
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
