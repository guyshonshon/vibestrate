---
title: Pause, resume, abort
description: How to safely stop a run, bring it back later, or end it for good.
slug: workflows/pause-resume
---

Sometimes you want to stop a run, look at where it got to, and pick it back up later. Pausing does exactly that, and it sticks: the flag is written to your project, not held in memory, so it survives anything restarting.

There are three things you can do to a running run: pause it, resume it, or abort it. Only `vibe abort` is final, and even that keeps the run's worktree on disk for you to read. `vibe pause` and `vibe resume` just set a flag - the process doing the work is what reads it, so neither one starts or stops anything by itself. If that process is gone, clearing the flag will not bring it back.

A run that stops itself at a policy gate is a different thing, and `vibe resume` will not move it. Its status is `waiting_for_approval`, and the command that decides it is `vibe approvals`.

<svg viewBox="0 0 560 122" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A run you paused yourself sits at the status paused, and vibe resume clears the flag. A run stopped by a policy gate sits at waiting_for_approval, and only vibe approvals moves it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="4" width="250" height="44" rx="8"/>
    <rect x="349" y="4" width="210" height="44" rx="8"/>
    <rect x="1" y="72" width="250" height="44" rx="8"/>
    <rect x="349" y="72" width="210" height="44" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M251 26 h94"/><path d="M340 22 l5 4 l-5 4"/>
    <path d="M251 94 h94"/><path d="M340 90 l5 4 l-5 4"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="126" y="24">paused</text>
    <text x="454" y="24">vibe resume</text>
    <text x="126" y="92">waiting_for_approval</text>
    <text x="454" y="92">vibe approvals</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="126" y="40">you asked for it</text>
    <text x="454" y="40">clears the flag</text>
    <text x="126" y="108">a policy gate stopped it</text>
    <text x="454" y="108">approve, reject, or send guidance</text>
  </g>
</svg>

## Pause

To pause a run, give Vibestrate the run's ID:

```bash
vibe pause <runId>
```

Vibestrate works in stages and checks for the flag between them. When it spots one, it moves the run to the `paused` state and writes down which stage it was about to start. Nothing gets cut off halfway.

## Resume

To pick the run back up:

```bash
vibe resume <runId>
```

This clears the flag and the run continues from the stage in `pausedAtStatus`. When the process is gone, start a fresh run and reuse the work with [`--resume-from`](/docs/workflows/debug-failed) instead.

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
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

## Policy-gated pauses are different

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

## When to abort vs let it block

Not every stuck run should be aborted. Abort means you end it; block means it stopped itself. Here is how to tell them apart.

- The run is doing something you don't want it doing. **Abort.**
- The reviewer is doing something useful but is stuck on a call you'd rather make yourself. **Abort**, fix the cause (clarify the task, add a skill, adjust the rules), then run again.
- The run stopped itself (status `blocked`) because the reviewer or verifier raised a real concern. Don't abort. Read the findings, decide what to do, and restart with the lesson encoded in the task or a skill.

## Next

- [Flow](/docs/concepts/flow) - the steps a run works through, and where the pauses fall.
- [Run state](/docs/concepts/state) - every status a run can hold, and which ones are final.
