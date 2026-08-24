---
title: Run state
description: The status a run is in, what each one means, and the rules that keep moves between them honest.
slug: concepts/state
---

## In simple words

A [[run]] is always in exactly one **state**. Think of a package you have shipped: it is in one definite place, "out for delivery" or "delivered", never two at once and never somewhere the tracking invented.

The Status column on **All runs** is that value:

![The All runs table. Rows carry Task, Status, Review, Verify and Duration columns, with one row reading merge-ready. A filter box sits above, beside Replay and Prune snapshots controls.](/media/docs/scoped/runs-table.png)

A run starts at `created` and ends in one of four terminal states:

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

<div class="docs-callout tip">

**Tip.** The four terminal states mean different things and it is worth not blurring them. `blocked` is a *decision* - something refused. `failed` is a *crash* - a step broke. `aborted` is *you*. Only `merge_ready` is a change you can take.

</div>

## Why the states are worth knowing

<div class="docs-cards">

**Knowing where to look**
`failed` means read the failing step's own output. `blocked` means read the review or the policy that refused.

**Knowing what is recoverable**
A blocked run is usually one fix away. A failed one may be an environment problem rather than a code one.

**Filtering the list**
The counts above the table roll sixteen statuses into total, active, merge-ready and failed.

**Trusting the record**
The status is read from a saved value, not inferred. It cannot drift from what actually happened.

</div>

<div class="docs-callout">

**Did you know?** There are sixteen statuses, and Vibestrate validates the value against that fixed set before writing it. A run cannot land in a state nobody defined, and it cannot skip from one to another along a path the state machine does not allow. The moves are enforced, not just recorded.

</div>

## Going deeper

### The moves are enforced

The status is trustworthy because Vibestrate controls how a run gets from one status to the next. Every allowed move is written into an explicit list, the `ALLOWED_TRANSITIONS` allowlist. If something tries a move that isn't on the list, Vibestrate raises a `StateTransitionError` and stops, instead of letting the bad move happen quietly.

The four terminal statuses in the diagram above have no way back out. Once a run reaches one of them, it stays there.

### Why it matters

The state machine is what makes runs replayable, pausable, and auditable. A run that reads `verifying` is verifying: the verifier is running, the previous artifacts are committed, and there's no in-between fuzz. A row that reads `merge-ready` has a real diff behind it and validation that passed.

### The statuses

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
| `waiting_for_approval` | Run is holding at a gate, awaiting a human decision. |
| `paused` | User-requested pause. Resume returns to `pausedAtStatus`. |
| `merge_ready` | Verifier passed. Diff is ready for the user to merge. |
| `blocked` | Reviewer or verifier flagged the run unsafe to continue. |
| `failed` | Unrecoverable error during a stage. |
| `aborted` | User aborted explicitly. Worktree is preserved. |

### Two kinds of pause

A stopped run is stopped for one of two reasons, and the Status column names which.

- **A gate is open** (`waiting_for_approval`). Open the run and an approval banner sits at the top, offering Approve, Request changes and Reject. Two things raise a gate: a project policy that lists the stage in `requireApprovalAtStages`, or an agent asking for your call before it continues. Request changes is the middle answer, re-running the stage with your guidance. It belongs to agent-raised gates; a policy gate has no agent turn to re-run, so approve or reject that one.
- **You asked for it** (`paused`). Press Pause on the run and the status flips at the next stage boundary. `pausedAtStatus` remembers where to resume.

Both kinds survive a restart. The pause flag is saved to disk, so killing and restarting Vibestrate does not lose the pause.

### Terminal statuses are sticky

To start over from a terminal status, run the task again as a new run. The previous run's artifacts stay where they are.

### Advanced: CLI and automation

The same state and the same decisions are reachable from the terminal, for scripts and for work over SSH. See the [CLI overview](/docs/cli/overview) for the full surface.

```bash
vibe status
vibe status --json
vibe replay <runId>
vibe pause <runId>
vibe resume <runId>
```

`vibe replay` opens a read-only inspector for any saved run, the same view the Replay button on the runs table opens. It's useful for after-the-fact debugging, when something interesting happened and you want to retrace it.

Deciding a gate takes the run id plus the approval id that `vibe approvals list` prints:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
# reject marks the run blocked
vibe approvals reject <runId> <approvalId>
# agent-raised gates only
vibe approvals request-changes \
  <runId> <approvalId> --guidance "..."
```

### Going deeper

- [Workflow](/docs/concepts/workflow) - the stages that drive transitions.
- [Task lifecycle](/docs/task-lifecycle) - the same statuses, drawn as a transition diagram.

Next: [[worktree]] covers the copy of your repo a run works in.
