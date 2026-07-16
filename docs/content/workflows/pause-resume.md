---
title: Pause, resume, abort
description: How to safely stop a run, bring it back later, or end it for good.
section: workflows
slug: workflows/pause-resume
---

Sometimes you want to stop a run, look at where it got to, and pick it back up later. Pausing does exactly that, and it sticks. The run state is saved to disk, so even if you kill Vibestrate's process and start it again, the pause is still there waiting for you.

There are three things you can do to a running run:

<div class="docs-cards">

**Pause**
Stop the run cleanly at the next gap between stages and hold it there. The state is saved, so it survives a restart.

**Resume**
Pick a paused run back up from where it stopped, or cancel a pause you asked for before it fires.

**Abort**
End the run for good. The worktree stays on disk so you can read the partial work, until you clean it up.

</div>

## Pause

To pause a run, give Vibestrate the run's ID:

```bash
vibe pause <runId>
```

Vibestrate works in stages, and it checks for a pause flag between them. When it spots one, it moves the run to the `paused` state and writes down which stage it was about to start. Nothing gets cut off halfway. A pause always lands cleanly at the gap between two stages.

## Resume

To pick the run back up:

```bash
vibe resume <runId>
```

This clears the pause flag. Vibestrate starts the run again from the stage it had written down in `pausedAtStatus`, which is the spot where it stopped.

## Cancel a pause request before it fires

Say you ran `vibe pause` and then changed your mind before the run reached the next gap between stages. Running `vibe resume` cancels the pending pause. The run keeps going and never enters the `paused` state at all.

## Abort

To end a run for good:

```bash
vibe abort <runId>
```

This marks the run as `aborted`. The worktree, which is the isolated copy of your project where the run did its work, stays on disk. You can still `cd` into it to read the partial work it left behind. When you want to clean up the worktree:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>-<slug>
git branch -D vibestrate/<runId>-<slug>
```

## Policy-gated pauses are different

Some pauses are scheduled by a policy rather than asked for by you. If `policies.requireApprovalAtStages` names a stage, the run pauses on its own at the boundary into that stage, with the status `waiting_for_approval`. This kind of pause is waiting for your decision, so `vibe resume` is not the right tool. Use `vibe approvals` instead:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
vibe approvals reject <runId> <approvalId>
vibe approvals request-changes <runId> <approvalId> --guidance "what to change"
```

When an agent asks for your approval (it emitted a `HUMAN_APPROVAL` request, not a policy gate), you have a third option: **request changes**. Instead of a dead-end reject, you return free-form guidance and the run re-runs that stage with it, then pauses again for your call - bounded by `policies.approvalMaxChangeRounds` (default 3). Policy gates have no agent turn to re-run, so they stay approve-or-reject.

Each of these stopping points has its own status, so you always know why a run is sitting still:

<div class="docs-outcomes"><div class="docs-outcome warn"><b>paused</b><span>You asked it to stop. Resume when ready.</span></div><div class="docs-outcome warn"><b>waiting_for_approval</b><span>A policy paused it for your decision. Use approvals decide.</span></div><div class="docs-outcome warn"><b>blocked</b><span>The run stopped itself over a real concern. Read the findings.</span></div><div class="docs-outcome stop"><b>aborted</b><span>Ended for good. The worktree stays until you remove it.</span></div></div>

## When to abort vs let it block

Not every stuck run should be aborted. Here is how to tell them apart.

<div class="docs-callout">

**Abort means you end it. Block means it stopped itself.** You abort a run that is heading the wrong way, so you can fix the cause and start over. A `blocked` run already stopped on its own because the reviewer or verifier raised something real, so read the findings before you touch it.

</div>

- The run is doing something you don't want it doing. **Abort.**
- The reviewer is doing something useful but is stuck on a call you'd rather make yourself. **Abort**, fix the cause (clarify the task, add a skill, adjust the rules), then run again.
- The run stopped itself (status `blocked`) because the reviewer or verifier raised a real concern. Don't abort. Read the findings, decide what to do, and restart with the lesson encoded in the task or a skill.

## Next

- [Flow](/docs/concepts/flow) - the steps a run works through, and where the pauses fall.
