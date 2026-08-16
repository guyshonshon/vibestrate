---
title: Run state
description: The status a run is in, what each one means, and the rules that keep moves between them honest.
slug: concepts/state
---

A run always has one status, and you can check it at any moment to know exactly what the run is doing right now.

Think of it like a package you've shipped. At any point it's in one definite place - "out for delivery", "delivered" - never two at once, and never somewhere the tracking made up. A run's status works the same way. It's always a single value, saved so you can read it back, and never a guess.

That saved value lives in a `state.json` file under `.vibestrate/runs/`, in the folder named after the run id. The `status` comes from a fixed set of sixteen values, and Vibestrate validates it before writing it down.

A run starts at `created` and ends in one of four terminal statuses:

<svg viewBox="0 0 560 150" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A run starts at created, works through planning, architecting, executing, validating, reviewing, fixing and verifying, then ends in one of four terminal statuses: merge_ready, blocked, failed or aborted.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="6" width="110" height="38" rx="8"/>
    <rect x="147" y="1" width="412" height="48" rx="8"/>
    <rect x="1" y="106" width="132" height="38" rx="8"/>
    <rect x="143" y="106" width="132" height="38" rx="8"/>
    <rect x="285" y="106" width="132" height="38" rx="8"/>
    <rect x="427" y="106" width="132" height="38" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M111 25 h30"/>
    <path d="M136 21 l5 4 l-5 4"/>
    <path d="M353 49 v22"/>
    <path d="M67 71 h426"/>
    <path d="M67 71 v30"/><path d="M209 71 v30"/><path d="M351 71 v30"/><path d="M493 71 v30"/>
    <path d="M63 96 l4 5 l4 -5"/><path d="M205 96 l4 5 l4 -5"/><path d="M347 96 l4 5 l4 -5"/><path d="M489 96 l4 5 l4 -5"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="56" y="30">created</text>
    <text x="353" y="21">planning, architecting, executing</text>
    <text x="353" y="39">validating, reviewing, fixing, verifying</text>
    <text x="67" y="130">merge_ready</text>
    <text x="209" y="130">blocked</text>
    <text x="351" y="130">failed</text>
    <text x="493" y="130">aborted</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="369" y="66">no way back out</text>
  </g>
</svg>

Along the way it can sit at `waiting_for_approval` (a policy gate is holding it) or `paused` (you asked it to stop).

## The moves are enforced

What makes the status trustworthy is that Vibestrate controls how a run gets from one status to the next. Every allowed move is written into an explicit list, the `ALLOWED_TRANSITIONS` allowlist. If something tries a move that isn't on the list, Vibestrate raises a `StateTransitionError` and stops, instead of letting the bad move happen quietly.

The four terminal statuses in the diagram above have no way back out. Once a run reaches one of them, it stays there.

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
| `waiting_for_approval` | Run is paused at a policy gate, awaiting a human decision. |
| `paused` | User-requested pause. Resume returns to `pausedAtStatus`. |
| `merge_ready` | Verifier passed. Diff is ready for the user to merge. |
| `blocked` | Reviewer or verifier flagged the run unsafe to continue. |
| `failed` | Unrecoverable error during a stage. |
| `aborted` | User aborted explicitly. Worktree is preserved. |

## Two kinds of pause

A run can be paused for one of two reasons.

- **Policy-gated:** the project says "always pause at the boundary into `executing`." When the orchestrator reaches that boundary, status becomes `waiting_for_approval` and the run sits until a human decides.
- **User-requested:** at any point you run `vibe pause` with the run id, status becomes `paused` between stage boundaries, and `pausedAtStatus` remembers where to resume.

Both kinds survive a restart. The pause flag is saved to disk, so killing and restarting Vibestrate does not lose the pause.

Three commands decide a policy gate. Each wants the run id plus the approval id that `vibe approvals list` prints:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
# reject marks the run blocked
vibe approvals reject <runId> <approvalId>
vibe approvals request-changes \
  <runId> <approvalId> --guidance "..."
```

`request-changes` is the middle answer: the stage re-runs with your guidance instead of being waved through or killed.

## Terminal statuses are sticky

To start over from a terminal status, run the task again as a new run. The previous run's artifacts stay where they are.

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
