---
title: Debug a failed run
description: How to figure out why a run ended in failed or blocked, and what to do next.
slug: workflows/debug-failed
---

## In simple words

When a task does not finish cleanly, this guide helps you find out why.

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

**Tip.** `vibe replay <run-id>` is the fastest first move for either. It reopens the finished run with every decision, output and artifact in place, so you are reading what happened rather than reconstructing it.

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

**Did you know?** A run that ends badly keeps its worktree on purpose. Nothing is cleaned up on failure, so the evidence is still there when you come back to it tomorrow.

</div>


## Going deeper

### Start with `replay`

Open the read-only inspector for the run:

```bash
vibe replay <runId>
```

Read-only means you can look but not change anything. The status line tells you which stage threw the error, and the artifact list shows you what the run already recorded before it stopped.

### If status is `failed`

A `failed` status means a stage raised an error it couldn't recover from. Three things to look at, in order:

1. **`events.ndjson`** - the last event before the failure shows which transition triggered the error.

2. **The step's output** at `.vibestrate/runs/<runId>/artifacts/flows/<step-id>/output.md` - the AI's response for that step. It usually contains the model's last response and any tool-use error.

   The `<step-id>` is the step's own name in the flow, like `plan` or `review`.

3. **The validation output** at `.vibestrate/runs/<runId>/artifacts/flows/<step-id>/validation-results.json` - if the failure happened during validation, the exit codes are here.

   The `stdout` and `stderr` for each command sit alongside it under `validation/`.

Common causes:

<div class="docs-cards">

**Provider not authenticated** - the provider is the service running the AI model. Run `vibe provider test <id>` to confirm it is connected.

**Validation command missing** - check `commands.validate` in `.vibestrate/project.yml`.

**Worktree creation failed** - a worktree is the isolated copy of your code the run works in. One common case: `git.requireCleanMain` is on and main has uncommitted changes.

**Skill referenced doesn't exist** - a skill is a reusable instruction the agent can pull in. Check `vibe skills list`.

</div>

### If status is `blocked`

`blocked` is not a crash. It's the system telling you a decision is needed. Start by reading:

1. **`artifacts/flows/review/output.md`** - the reviewer's findings, plus the rationale behind its decision.
2. **`artifacts/flows/verify/output.md`** - if the verifier was the one that blocked, this has its summary instead.

Either way, `events.ndjson` carries the matching `review.decision` or `verification.decision` event with the actual verdict.

Then act on what you find. The right answer is rarely "rerun and hope." Usually it's one of these:

<div class="docs-cards">

**Sharpen the task** - edit the task description to be more specific.

**Teach a rule** - add a skill that encodes the rule you didn't realize the agent didn't know.

**Tighten permissions** - adjust a permission profile if the agent was reaching for something it shouldn't.

**Drop the scope** - split the work into two smaller tasks.

</div>

### Re-run after fixing

Each `vibe run` is a fresh run with a fresh `runId`. Past runs stay on disk at `.vibestrate/runs/`, so you can compare what the planner produced this time against last time:

```bash
cd .vibestrate/runs
diff <oldRunId>/artifacts/flows/plan/output.md \
     <newRunId>/artifacts/flows/plan/output.md
```

### Rewind instead of restarting

Sometimes the plan and architecture were fine and only the implementation needs another pass. For example, the run was read-only and you now want the executor to actually write code. In that case you don't have to re-pay for planning and architecture. **Rewind** forks a fresh run that reuses the earlier artifacts and resumes from a stage you pick:

```bash
# executing     reuse plan + architecture
# architecting  reuse just the plan
# planning      seed nothing, start over
vibe run "<same task>" --resume-from <oldRunId> \
  --resume-stage executing
```

`--resume-stage` takes six values, and defaults to `executing`:

<div class="docs-chips"><span>planning</span><span>architecting</span><span>executing</span><span>reviewing</span><span>fixing</span><span>verifying</span></div>

The first three regenerate the code, so they behave as described here. The last three need the earlier code back, which is the next section.

The flow runner finds the first step at the stage you named, **seeds the outputs of every earlier step from the source run** (marking them *skipped (resumed)* in the run's step ledger), and starts there.

The forked run gets its own `runId` and a fresh worktree off your main branch. The original run is untouched, and its lineage is recorded under `resumedFrom` in the run's `state.json`.

This works with `--flow` too: any flow that declares the matching step `stage` can be resumed. In the dashboard, the run's **Re-run with changes** dialog has a **Start from** selector with the same choices.

### Rewinding to review, fix, or verify (restores the run's code)

`reviewing`, `fixing`, and `verifying` are also resumable, but these stages need the executor's code already in place. So Vibestrate first **restores the source run's per-phase worktree snapshot** into the fresh worktree.

A snapshot is a saved copy of the run's code at a point in time. Only runs that captured one - every run that produced code - can be rewound this way, and the CLI and dashboard tell you when there's none.

Because that restore overwrites and removes files, you can **dry-run it first** to see the exact blast radius - which files it would add, overwrite, or remove - before committing to it:

```bash
vibe run "<same task>" --resume-from <oldRunId> \
  --resume-stage reviewing --preview
```

`--preview` prints the overwrite/remove set and exits **without starting a run**. The same data is available at `GET /api/runs/<id>/restore-preview?stage=reviewing`, and the dashboard's **Re-run** dialog shows a live preview panel when you pick a downstream stage.

The restore itself is bounded. It only ever runs against a real, isolated run worktree, never your own checkout. A failed or refused restore marks the run **unsafe** in its assurance verdict instead of letting it pass as verified.

### Housekeeping: pruning snapshots

Each rewind-able run anchors its code as a git ref under `refs/vibestrate/snapshots/`, which slowly grows your `.git`. Vibestrate never deletes these on its own. To reclaim them yourself:

```bash
vibe runs prune                # orphans
vibe runs prune --keep 20      # keep newest 20
vibe runs prune --run <id>     # just this run
vibe runs prune --orphans --dry-run   # preview
```

Orphans are the runs whose directory is gone.

It prints the plan and asks before deleting (skip the prompt with `-y`). Only refs are removed. The runs' artifacts and branches are untouched.

The dashboard's **Runs** page has a **Prune snapshots** button for the same orphan cleanup, and `POST /api/runs/snapshots/prune` (with `dryRun`) is the API. For hands-off trimming, set `git.snapshotRetentionRuns` to keep the last N runs automatically.

### When to file a bug

If the same task fails in the same place across multiple providers, and the failure isn't traceable to your config or your task description, that's worth a bug report. Include the `runId`, the `events.ndjson` excerpt around the failure, and the failing step's `output.md`.

### Related

- [Run state](/docs/concepts/state) - definitions of `failed` and `blocked`.
- [Troubleshooting](/docs/troubleshooting) - common, reproducible issues with fixes.
