---
title: Pause, resume, abort
description: How to safely stop a run, bring it back later, or end it for good.
slug: workflows/pause-resume
---

## In simple words

Sometimes you want to stop a run, look at where it got to, and pick it up later.

```bash
vibe pause <run-id>     # stops at the next safe point
vibe resume <run-id>    # picks up where it stopped
```

Pausing sticks. The flag is written to your project, not held in memory, so it survives anything restarting.

<div class="docs-callout tip">

**Tip.** Pause is not abort. A paused run keeps its worktree, its branch and everything it had done, and resuming continues rather than starting over. Abort is the one that ends it.

</div>

## The three ways a run stops

<div class="docs-cards">

**You paused it**
Status `paused`. Resume clears the flag and it continues.

**It is waiting on you**
Status `waiting_for_approval`. An approval gate wants a human.

**Something refused**
Status `blocked`. A policy, review or check said no.

</div>

<div class="docs-callout">

**Did you know?** Because the pause flag is a file rather than process state, a pause you requested survives closing your laptop, restarting the dashboard, or the machine rebooting. A run cannot quietly resume because something restarted.

</div>


## Going deeper

### Pause

To pause a run, give Vibestrate the run's ID:

```bash
vibe pause <runId>
```

Vibestrate works in stages and checks for the flag between them. When it spots one, it moves the run to the `paused` state and writes down which stage it was about to start. Nothing gets cut off halfway.

### Resume

To pick the run back up:

```bash
vibe resume <runId>
```

This clears the flag and the run continues from the stage in `pausedAtStatus`. When the process is gone, start a fresh run and reuse the work with [`--resume-from`](/docs/workflows/debug-failed) instead.

### Cancel a pause request before it fires

Say you ran `vibe pause` and then changed your mind before the run reached the next gap between stages. Running `vibe resume` cancels the pending pause. The run keeps going and never enters the `paused` state at all.

### Abort

To end a run for good:

```bash
vibe abort <runId>
```

This marks the run as `aborted`. The worktree, which is the isolated copy of your project where the run did its work, stays on disk. You can still `cd` into it to read the partial work it left behind. When you want to clean up the worktree:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

### Policy-gated pauses are different

Some pauses are scheduled by a policy rather than asked for by you. If `policies.requireApprovalAtStages` names a stage, the run pauses on its own at the boundary into that stage, with the status `waiting_for_approval`. This kind of pause is waiting for your decision, so `vibe resume` is not the right tool. Use `vibe approvals` instead:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
vibe approvals reject <runId> <approvalId>
vibe approvals request-changes \
  <runId> <approvalId> --guidance "what to change"
```

When an agent asks for your approval (it emitted a `HUMAN_APPROVAL` request, not a policy gate), you have a third option: **request changes**. Instead of a dead-end reject, you return free-form guidance and the run carries on into that stage's next turn with your guidance attached, then pauses again for your call - bounded by `policies.approvalMaxChangeRounds` (default 3). A policy gate has no agent turn to send guidance to, so requesting changes there fails closed and blocks the run, same as a reject.

Each of these stopping points has its own status, so you always know why a run is sitting still:

<div class="docs-chips"><span>paused</span><span>waiting_for_approval</span><span>blocked</span><span>aborted</span></div>

### When to abort vs let it block

Not every stuck run should be aborted. Abort means you end it; block means it stopped itself. Here is how to tell them apart.

- The run is doing something you don't want it doing. **Abort.**
- The reviewer is doing something useful but is stuck on a call you'd rather make yourself. **Abort**, fix the cause (clarify the task, add a skill, adjust the rules), then run again.
- The run stopped itself (status `blocked`) because the reviewer or verifier raised a real concern. Don't abort. Read the findings, decide what to do, and restart with the lesson encoded in the task or a skill.

### Next

- [Flow](/docs/concepts/flow) - the steps a run works through, and where the pauses fall.
- [Run state](/docs/concepts/state) - every status a run can hold, and which ones are final.
