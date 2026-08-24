---
title: Pause, resume, abort
description: How to safely stop a run, bring it back later, or end it for good.
slug: workflows/pause-resume
---

## In simple words

Sometimes you want to stop a run, see where it got to, and pick it up later. The run screen in [Mission Control](/docs/cli/dashboard) has all three controls; the commands below are the automation path.

```bash
vibe pause <runId>     # stops at the next safe point
vibe resume <runId>    # picks up where it stopped
vibe abort <runId>     # ends it
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

**Did you know?** Because the pause flag is a file rather than process state, a pause survives closing your laptop, restarting the dashboard or a reboot. A run cannot quietly resume because something restarted.

</div>

## Going deeper

### Pause

```bash
vibe pause <runId>
```

Vibestrate works in stages and checks for the flag between them. On spotting one it moves the run to `paused` and records which stage it was about to start. Nothing is cut off halfway.

### Resume

```bash
vibe resume <runId>
```

This clears the flag and the run continues from the stage in `pausedAtStatus`. When the process is gone, start a fresh run and reuse the work with [`--resume-from`](/docs/workflows/debug-failed) instead.

Change your mind before the run reaches the next gap between stages and `vibe resume` cancels the pending pause: the run keeps going and never enters `paused`.

### Abort

```bash
vibe abort <runId>
```

This marks the run `aborted`. The worktree - the isolated copy of your project where the run worked - stays on disk, so you can `cd` into it and read the partial work. To clean it up:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

*In the dashboard:* the run screen carries pause, resume and abort directly, and the shell's **Runs** page has them on `p`, `r` and `a`.

### Policy-gated pauses are different

Some pauses are scheduled by a policy rather than asked for. If `policies.requireApprovalAtStages` names a stage, the run pauses on its own at the boundary into it, with the status `waiting_for_approval`. That pause waits for a decision, so `vibe resume` is not the tool - use `vibe approvals`:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
vibe approvals reject <runId> <approvalId>
vibe approvals request-changes \
  <runId> <approvalId> --guidance "what to change"
```

When an agent asks for your approval - a `HUMAN_APPROVAL` request, not a policy gate - you have a third option: **request changes**. Instead of a dead-end reject, you return free-form guidance; the run carries on into that stage's next turn with it attached, then pauses again for your call, bounded by `policies.approvalMaxChangeRounds` (default 3). A policy gate has no agent turn to send guidance to, so requesting changes there fails closed and blocks the run, the same as a reject.

*In the dashboard:* every blocked run appears on **Mission control** under **Waiting on you** with **Approve**, **Reject** and **Details**, and the same decision sits in a banner at the top of the run.

Each stopping point has its own status, so you know why a run is sitting still:

<div class="docs-chips"><span>paused</span><span>waiting_for_approval</span><span>blocked</span><span>aborted</span></div>

### Abort, or let it block

Not every stuck run should be aborted. Abort means you end it; block means it stopped itself.

- The run is doing something you do not want it doing. **Abort.**
- The reviewer is useful but stuck on a call you would rather make yourself. **Abort**, fix the cause (clarify the task, add a skill, adjust the rules), then run again.
- The run stopped itself (status `blocked`) because the reviewer or verifier raised a real concern. Do not abort: read the findings, decide, and restart with the lesson encoded in the task or a skill.

### Next

- [Flow](/docs/concepts/flow) - the steps a run works through, and where the pauses fall.
- [Run state](/docs/concepts/state) - every status a run can hold, and which ones are final.
