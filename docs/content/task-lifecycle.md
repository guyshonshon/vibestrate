---
title: Task lifecycle
description: How a task moves through statuses, with the fix loop and the approval gates.
section: lifecycle
slug: task-lifecycle
---

Every task moves through a fixed sequence of statuses, and Vibestrate won't let it skip a step or jump backward. Think of it like a package working through delivery: it goes through sorted, in transit, and out for delivery in order, and each scan tells you exactly where it is right now.

## The happy path

When nothing goes wrong, a task walks through every status once and finishes ready to merge.

<div class="docs-flow">
<div><b>Plan</b><span>created, planning, planned.</span></div>
<div><b>Architect</b><span>architecting, architected.</span></div>
<div><b>Execute</b><span>executing.</span></div>
<div><b>Check</b><span>validating, reviewing, verifying.</span></div>
<div><b>Done</b><span>merge_ready.</span></div>
</div>

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

**The fix loop has a budget.** The reviewer can return `CHANGES_REQUESTED`, sending the run back into `fixing`. The fixer addresses the findings, validation re-runs, and the reviewer re-evaluates. Each round counts against `workflow.maxReviewLoops` (default `2`). Past the budget, the run goes to `blocked`.

</div>

## When a stage needs your approval

Some stages can be set to wait for you before they start. The task pauses at the gate and holds until you decide.

```text
... → executing → waiting_for_approval → executing → ...
```

<div class="docs-callout">

**The gate holds until you decide.** If a stage is listed under `policies.requireApprovalAtStages`, the orchestrator pauses at the boundary into that stage. The run sits at `waiting_for_approval` until `vibe approvals decide` is invoked.

</div>

## When you pause it yourself

You can stop a running task and start it again later, and it picks up from where it left off.

```text
... → executing → paused → executing → ...
```

`vibe pause <runId>` sets a flag the orchestrator picks up at the next stage boundary. The run transitions to `paused`; `pausedAtStatus` records where to resume. `vibe resume <runId>` clears the flag.

## Where a task can come to rest

Four statuses are terminal. Once a run reaches one, it cannot transition out:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>Verifier passed. The diff is ready to ship.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>Reviewer or verifier said the run should not continue.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Unrecoverable error during a stage.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>User explicitly aborted. Worktree is preserved.</span></div>
</div>

What to read, and what each offers:

- **`merge_ready`** - Verifier passed. The diff is ready to ship.
- **`blocked`** - Reviewer or verifier said the run should not continue. Read `review.md` and `verification.md`. On the dashboard, a run blocked by review offers **See review** (the reviewer's decision + findings, parsed from the review artifact) and **Re-run with fixes** (forks a new run that reuses this run's plan + architecture and re-implements); the shell run view lists the finding headlines under the `review` line.
- **`failed`** - Unrecoverable error during a stage. Read `events.jsonl` and the provider stream log.
- **`aborted`** - User explicitly aborted. Worktree is preserved.

## Where each status writes

As a task moves, each status leaves something behind so you can see what happened.

| Status | Primary artifact |
|---|---|
| `planning` → `planned` | `plan.md` |
| `architecting` → `architected` | `architecture.md` |
| `executing` | file edits in the worktree + `execution.log` |
| `validating` | `validation.json` |
| `reviewing` | `review.md` |
| `fixing` | new commits in the worktree + `finding-responses.md` |
| `verifying` | `verification.md` |

All under `.vibestrate/runs/<runId>/`. The `events.jsonl` file logs every transition, append-only.

## Going deeper

- [Run state](/docs/concepts/state) - what each status means in detail.
- [Workflow](/docs/concepts/workflow) - the stage definitions.
- [Run-state reference](/docs/reference/state-machine) - the full enum and transition rules.
