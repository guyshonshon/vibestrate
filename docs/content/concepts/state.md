---
title: Run state
description: The set of statuses a run can hold, how transitions are enforced, and what each status means in practice.
section: concepts
slug: concepts/state
---

Every run is in exactly one state at a time, and you can read that state at any
moment to know precisely what the run is doing. The `status` comes from a fixed
set of values, validated and saved to `.vibestrate/runs/<runId>/state.json`.

What makes the state trustworthy is that Vibestrate enforces the moves between
states. Transitions are checked against an explicit allowlist
(`ALLOWED_TRANSITIONS` in `src/core/state-machine.ts`); an illegal move raises
`StateTransitionError` instead of quietly happening, and the terminal states
(`merge_ready`, `blocked`, `failed`, `aborted`) have no way back out. So a status
is a fact about the run, not a guess.

## Why it matters

The state machine is what makes runs replayable, pausable, and auditable. When a run says it's `verifying`, that's the truth - the verifier is running, the previous artifacts are committed, and there's no in-between fuzz. When it says `merge_ready`, the diff is real and the validation passed.

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

- **Policy-gated:** the project says "always pause at the boundary into `executing`." When the orchestrator reaches that boundary, status becomes `waiting_for_approval` and the run sits until a human runs `vibe approvals decide`.
- **User-requested:** at any point you run `vibe pause <runId>`, status becomes `paused` between stage boundaries, and `pausedAtStatus` remembers where to resume.

Both are durable across process restarts. The pause flag is persisted, so killing and restarting Vibestrate does not lose the pause.

## Terminal statuses are sticky

`merge_ready`, `blocked`, `failed`, `aborted` - once a run lands here, it can't transition out. To start over, run the task again as a new run; the previous run's artifacts remain.

## Inspecting state

```bash
vibe status
vibe status --json
vibe replay <runId>
```

`vibe replay` opens a read-only inspector for any persisted run - useful for after-the-fact debugging when something interesting happened and you want to retrace.

## Related

- [Workflow](/docs/concepts/workflow) - the stages that drive transitions.
- [Task lifecycle](/docs/task-lifecycle) - the same statuses, drawn as a transition diagram.
