---
title: Pause, resume, abort
description: How to halt a run safely, how to bring it back, and when to abort instead.
section: workflows
slug: workflows/pause-resume
---

Pausing is durable — the run state is persisted, so killing Amaco's process and restarting it preserves the pause.

## Pause

```bash
amaco pause <runId>
```

The orchestrator polls between stages. When it sees the pause flag, it transitions the run to `paused` and remembers the status it was about to enter. Nothing is interrupted mid-stage — pauses always land cleanly at a boundary.

## Resume

```bash
amaco resume <runId>
```

Clears the pause flag. The orchestrator picks the run back up from the status recorded in `pausedAtStatus`.

## Cancel a pause request before it fires

If you ran `amaco pause` and then changed your mind before the next stage boundary, `amaco resume` cancels the pending pause without ever transitioning to `paused`.

## Abort

```bash
amaco abort <runId>
```

Marks the run as `aborted`. The worktree is preserved on disk — you can still `cd` into it to read the partial work. To clean up the worktree:

```bash
cd your-project
git worktree remove ../.amaco-worktrees/<runId>-<slug>
git branch -D amaco/<runId>-<slug>
```

## Policy-gated pauses are different

If `policies.requireApprovalAtStages` lists a stage, the run automatically pauses at the boundary into that stage with status `waiting_for_approval`. The fix is `amaco approvals decide`, not `amaco resume`:

```bash
amaco approvals list <runId>
amaco approvals decide <runId> <approvalId> --approve   # or --reject
```

## When to abort vs let it block

- The run is doing something you don't want it doing → **abort**.
- The reviewer is doing something useful but stuck on something you'd rather decide yourself → **abort**, fix the cause (clarify the task, add a skill, adjust the rules), run again.
- The run blocked itself (`blocked`) because the reviewer or verifier raised a real concern → don't abort. Read the findings, decide, restart with the lesson encoded in the task or a skill.
