---
title: Debug a failed run
description: How to figure out why a run ended in failed or blocked, and what to do next.
slug: workflows/debug-failed
---

## In simple words

When a task does not finish cleanly, this guide helps you find out why. The run screen in [Mission Control](/docs/cli/dashboard) surfaces the same evidence; the commands and paths below are the automation path.

Start by reading the status, because `failed` and `blocked` mean different things and need different responses:

<div class="docs-outcomes">
<div class="docs-outcome bad">

**failed**
A step crashed. Read that step's own output - it says what broke.

</div>
<div class="docs-outcome warn">

**blocked**
Something refused: a review, a policy, or a failed check. Read the decision.

</div>
</div>

<div class="docs-callout tip">

**Tip.** `vibe replay <runId>` is the fastest first move for either. It reopens the finished run with every decision, output and artifact in place, so you read what happened rather than reconstructing it. The run screen's **Replay** tab is the same.

</div>

## Where to look

<div class="docs-cards">

**The failing step's output**
For `failed`. Usually a stack trace or a command that exited non-zero.

**The review finding**
For `blocked` on review. It says what it objected to and why.

**The validation output**
For a failed check. Your own commands, your own error.

**The worktree**
Still on disk. Open it and read the half-finished work.

</div>

<div class="docs-callout">

**Did you know?** A run that ends badly keeps its worktree on purpose. Nothing is cleaned up on failure, so the evidence is there when you come back tomorrow.

</div>

## Start with replay

```bash
vibe replay <runId>
```

Read-only: you can look but not change anything. The status line says which stage threw, and the artifact list shows what the run recorded before it stopped. The run screen's **Outcome banner** answers the same question in a sentence, with the next action beside it.

## If status is `failed`

A `failed` status means a stage raised an error it could not recover from. Three things to look at:

1. **`events.ndjson`** - the last event before the failure shows which transition triggered the error.

2. **The step's output** at `.vibestrate/runs/<runId>/artifacts/flows/<step-id>/output.md` - the model's last response for that step, and any tool-use error. `<step-id>` is the step's own name in the flow, like `plan` or `review`.

3. **The validation output** at `.vibestrate/runs/<runId>/artifacts/flows/<step-id>/validation-results.json` - the exit codes, if the failure happened during validation. The `stdout` and `stderr` per command sit alongside under `validation/`.

The run screen's **Events**, **Artifacts** and **Validation** inspector tabs read those three files.

Common causes:

<div class="docs-cards">

**Provider not authenticated** - `vibe provider test <id>` confirms the local CLI running the model is connected; the **Crew** page's **Providers** tab has the same test.

**Validation command missing** - check `commands.validate` in `.vibestrate/project.yml`.

**Worktree creation failed** - one common case: `git.requireCleanMain` is on and main has uncommitted changes.

**Skill referenced doesn't exist** - check `vibe skills list`.

</div>

## If status is `blocked`

`blocked` is not a crash: it means a decision is needed. Start by reading:

1. **`artifacts/flows/review/output.md`** - the reviewer's findings and the rationale behind its decision.
2. **`artifacts/flows/verify/output.md`** - the verifier's summary, if that was what blocked.

Either way, `events.ndjson` carries the matching `review.decision` or `verification.decision` event with the verdict.

Then act on what you find. The right answer is rarely "rerun and hope":

<div class="docs-cards">

**Sharpen the task** - edit the task description to be more specific.

**Teach a rule** - add a skill encoding the rule the agent did not know.

**Tighten permissions** - adjust a permission profile if the agent reached for something it should not.

**Drop the scope** - split the work into two smaller tasks.

</div>

## Re-run after fixing

Each `vibe run` is a fresh run with a fresh `runId`, and past runs stay at `.vibestrate/runs/`, so you can compare what the planner produced this time against last:

```bash
cd .vibestrate/runs
diff <oldRunId>/artifacts/flows/plan/output.md \
     <newRunId>/artifacts/flows/plan/output.md
```

## Rewind instead of restarting

Sometimes only the implementation needs another pass - the run was read-only, say, and you now want the executor to write code. **Rewind** forks a fresh run that reuses the earlier artifacts and resumes from a stage you pick, so you do not re-pay for planning:

```bash
# executing     reuse plan + architecture
# architecting  reuse just the plan
# planning      seed nothing, start over
vibe run "<same task>" --resume-from <oldRunId> \
  --resume-stage executing
```

`--resume-stage` takes six values and defaults to `executing`:

<div class="docs-chips"><span>planning</span><span>architecting</span><span>executing</span><span>reviewing</span><span>fixing</span><span>verifying</span></div>

The first three regenerate the code. The last three need the earlier code back, which is the next section.

The flow runner finds the first step at the stage you named, **seeds the outputs of every earlier step from the source run** (marking them *skipped (resumed)* in the step ledger), and starts there. The forked run gets its own `runId` and a fresh worktree off your main branch; the original is untouched, its lineage recorded under `resumedFrom` in `state.json`.

This works with `--flow` too: any flow declaring the matching step `stage` can be resumed.

*In the dashboard:* the run screen's **Re-run with changes** dialog has a **Start from** selector with the same six choices, worded by what each reuses - "Implementation - reuse plan + architecture", "Review - restore this run's code", and so on.

## Rewinding to review, fix or verify

`reviewing`, `fixing` and `verifying` need the executor's code already in place, so Vibestrate first **restores the source run's per-phase worktree snapshot** into the fresh worktree.

A snapshot is a saved copy of the run's code at a point in time. Only runs that captured one - every run that produced code - can be rewound this way, and both the CLI and the dashboard say when there is none.

Because that restore overwrites and removes files, dry-run it first to see the exact blast radius:

```bash
vibe run "<same task>" --resume-from <oldRunId> \
  --resume-stage reviewing --preview
```

`--preview` prints the overwrite and remove set and exits **without starting a run**. The same data is at `GET /api/runs/<id>/restore-preview?stage=reviewing`, and the **Re-run with changes** dialog shows a live preview panel when you pick a downstream stage.

The restore is bounded: it only ever runs against a real, isolated run worktree, never your own checkout. A failed or refused restore marks the run **unsafe** in its assurance verdict instead of letting it pass as verified.

## Pruning snapshots

Each rewind-able run anchors its code as a git ref under `refs/vibestrate/snapshots/`, which slowly grows your `.git`, and Vibestrate never deletes these on its own. To reclaim them:

```bash
vibe runs prune                # orphans
vibe runs prune --keep 20      # keep newest 20
vibe runs prune --run <id>     # just this run
vibe runs prune --orphans --dry-run   # preview
```

Orphans are the runs whose directory is gone. It prints the plan and asks before deleting (`-y` skips the prompt). Only refs are removed - artifacts and branches are untouched.

*In the dashboard:* the **Runs** page's **Prune snapshots** button does the same orphan cleanup, over `POST /api/runs/snapshots/prune`, which previews with `dryRun` first. For hands-off trimming, set `git.snapshotRetentionRuns` to keep the last N runs.

## When to file a bug

If the same task fails in the same place across multiple providers, and the failure is not traceable to your config or task description, that is worth a bug report. Include the `runId`, the `events.ndjson` excerpt around the failure, and the failing step's `output.md`.

## Related

- [Run state](/docs/concepts/state) - definitions of `failed` and `blocked`.
- [Troubleshooting](/docs/troubleshooting) - common, reproducible issues with fixes.
