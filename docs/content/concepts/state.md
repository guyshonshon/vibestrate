---
title: Run state
description: The status a run is in, what each one means, and the rules that keep moves between them honest.
section: concepts
slug: concepts/state
---

A run always has one status, and you can check it at any moment to know exactly what the run is doing right now.

Think of it like a package you've shipped. At any point it's in one definite place - "out for delivery", "delivered" - never two at once, and never somewhere the tracking made up. A run's status works the same way. It's always a single value, saved so you can read it back, and never a guess.

That saved value lives in `.vibestrate/runs/<runId>/state.json`. The `status` comes from a fixed set of values, and Vibestrate validates it before writing it down.

<div class="docs-callout">

**One value, on disk, validated.** A status is a fact about the run, not a hopeful label. It lives in `state.json`, it survives a restart, and Vibestrate refuses to write a value that isn't in the fixed set.

</div>

## The moves are enforced

What makes the status trustworthy is that Vibestrate controls how a run gets from one status to the next. Every allowed move is written into an explicit list, the `ALLOWED_TRANSITIONS` allowlist. If something tries a move that isn't on the list, Vibestrate raises a `StateTransitionError` and stops, instead of letting the bad move happen quietly.

The four terminal states - `merge_ready`, `blocked`, `failed`, and `aborted` - have no way back out. Once a run reaches one of them, it stays there.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>merge_ready</b><span>Verifier passed. Diff is ready for the user to merge.</span></div><div class="docs-outcome warn"><b>blocked</b><span>Reviewer or verifier flagged the run unsafe to continue.</span></div><div class="docs-outcome stop"><b>failed</b><span>Unrecoverable error during a stage.</span></div><div class="docs-outcome stop"><b>aborted</b><span>User aborted explicitly. Worktree is preserved.</span></div></div>

## Why it matters

The state machine is what makes runs replayable, pausable, and auditable. When a run says it's `verifying`, that's the truth. The verifier is running, the previous artifacts are committed, and there's no in-between fuzz. When it says `merge_ready`, the diff is real and the validation passed.

## The statuses

The canonical, generated list lives in the [run-state reference](/docs/reference/state-machine).

| Status | Meaning |
|---|---|
| `created` | Run record exists; orchestrator hasn't picked it up yet. |
| `planning` | Planner is running. |
| `planned` | Plan is recorded; about to enter architecting. |
| `architecting` | Architect is running. |
| `architected` | Architecture recorded; about to execute. |
| `executing` | Executor is editing files in the worktree. |
| `validating` | Validation commands are running. |
| `reviewing` | Reviewer is reading diff + validation output. |
| `fixing` | Fixer is addressing review findings. |
| `verifying` | Verifier is doing the final pass before merge. |
| `waiting_for_approval` | Run is paused at a policy gate. Awaiting `vibe approvals decide`. |
| `paused` | User-requested pause. Resume returns to `pausedAtStatus`. |
| `merge_ready` | Verifier passed. Diff is ready for the user to merge. |
| `blocked` | Reviewer or verifier flagged the run unsafe to continue. |
| `failed` | Unrecoverable error during a stage. |
| `aborted` | User aborted explicitly. Worktree is preserved. |

## Two kinds of pause

A run can be paused for one of two reasons.

- **Policy-gated:** the project says "always pause at the boundary into `executing`." When the orchestrator reaches that boundary, status becomes `waiting_for_approval` and the run sits until a human runs `vibe approvals decide`.
- **User-requested:** at any point you run `vibe pause <runId>`, status becomes `paused` between stage boundaries, and `pausedAtStatus` remembers where to resume.

<div class="docs-flow"><div><b>waiting_for_approval</b><span>Policy gate. Run sits until vibe approvals decide.</span></div><div><b>paused</b><span>You ran vibe pause. pausedAtStatus holds the resume point.</span></div></div>

Both kinds survive a restart. The pause flag is saved to disk, so killing and restarting Vibestrate does not lose the pause.

## Terminal statuses are sticky

`merge_ready`, `blocked`, `failed`, `aborted` - once a run lands here, it can't transition out. To start over, run the task again as a new run. The previous run's artifacts remain.

## Inspecting state

```bash
vibe status
vibe status --json
vibe replay <runId>
```

`vibe replay` opens a read-only inspector for any saved run. It's useful for after-the-fact debugging, when something interesting happened and you want to retrace it.

## Going deeper

- [Workflow](/docs/concepts/workflow) - the stages that drive transitions.
- [Task lifecycle](/docs/task-lifecycle) - the same statuses, drawn as a transition diagram.
