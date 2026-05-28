---
title: Task lifecycle
description: How a task moves through statuses from created to terminal, with the fix loop and the approval gates.
section: lifecycle
slug: task-lifecycle
---

A run progresses through a sequence of statuses enforced by the state machine in `src/core/state-machine.ts`. The full enum and transition rules are exposed in the [run-state reference](/docs/reference/state-machine).

## The happy path

```text
created → planning → planned → architecting → architected
       → executing → validating → reviewing → verifying → merge_ready
```

A successful run touches every non-terminal status once, lands in `merge_ready`, and leaves a diff on the worktree branch.

## With the fix loop

```text
reviewing → fixing → validating → reviewing → verifying → merge_ready
```

The reviewer can return `CHANGES_REQUESTED`, sending the run back into `fixing`. The fixer addresses the findings, validation re-runs, and the reviewer re-evaluates. Each round counts against `workflow.maxReviewLoops` (default `2`). Past the budget, the run goes to `blocked`.

## With a policy-gated approval

```text
... → executing → waiting_for_approval → executing → ...
```

If a stage is listed under `policies.requireApprovalAtStages`, the orchestrator pauses at the boundary into that stage. The run sits at `waiting_for_approval` until `vibe approvals decide` is invoked.

## With a user pause

```text
... → executing → paused → executing → ...
```

`vibe pause <runId>` sets a flag the orchestrator picks up at the next stage boundary. The run transitions to `paused`; `pausedAtStatus` records where to resume. `vibe resume <runId>` clears the flag.

## Terminal statuses

Four statuses are terminal — once reached, the run cannot transition out:

- **`merge_ready`** — Verifier passed. The diff is ready to ship.
- **`blocked`** — Reviewer or verifier said the run should not continue. Read `review.md` and `verification.md`.
- **`failed`** — Unrecoverable error during a stage. Read `events.jsonl` and the provider stream log.
- **`aborted`** — User explicitly aborted. Worktree is preserved.

## Where each status writes

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

## Related

- [Run state](/docs/concepts/state) — what each status means in detail.
- [Workflow](/docs/concepts/workflow) — the stage definitions.
