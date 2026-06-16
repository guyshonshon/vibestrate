---
title: Debug a failed run
description: How to figure out why a run ended in failed or blocked, and what to do next.
section: workflows
slug: workflows/debug-failed
---

When a task doesn't finish cleanly, this guide helps you find out why and decide what to do about it.

A run can stop short for two different reasons. They feel similar, but they call for different responses, so the first job is to tell them apart.

<div class="docs-callout">

**`failed` is a crash. `blocked` is a decision.** `failed` means something broke during a stage and couldn't recover. `blocked` means the reviewer or verifier looked at the work and said "do not continue." One needs a fix; the other needs a call from you.

</div>

## Start with `replay`

Open the read-only inspector for the run:

```bash
vibe replay <runId>
```

Read-only means you can look but not change anything. The status line tells you which stage threw the error, and the artifact list shows you what the run already recorded before it stopped.

## If status is `failed`

A `failed` status means a stage raised an error it couldn't recover from. Three things to look at, in order:

1. **`events.jsonl`** - the last event before the failure shows which transition triggered the error.
2. **The provider stream log** at `.vibestrate/runs/<runId>/outputs/<stage>.log` - this is the log of the AI's responses for that stage. It usually contains the model's last response and any tool-use error.
3. **The validation output** at `.vibestrate/runs/<runId>/validation.json` - if the failure happened during validation, the exit codes and stderr are here.

Common causes:

<div class="docs-cards">

**Provider not authenticated**
The provider is the service running the AI model. Run `vibe provider test <id>` to confirm it's connected.

**Validation command missing**
Check `commands.validate` in `project.yml`.

**Worktree creation failed**
A worktree is the isolated copy of your code the run works in. One common case: `requireCleanMain: true` is set and main has uncommitted changes.

**Skill referenced doesn't exist**
A skill is a reusable instruction the agent can pull in. Check `vibe skills list`.

</div>

## If status is `blocked`

`blocked` is not a crash. It's the system telling you a decision is needed. Start by reading:

1. **`review.md`** - the reviewer's findings, plus the `BLOCKED` rationale that explains why it stopped.
2. **`verification.md`** - if the verifier was the one that blocked, this has the summary.

Then act on what you find. The right answer is rarely "rerun and hope." Usually it's one of these:

<div class="docs-cards">

**Sharpen the task**
Edit the task description to be more specific.

**Teach a rule**
Add a skill that encodes the rule you didn't realize the agent didn't know.

**Tighten permissions**
Adjust a permission profile if the agent was reaching for something it shouldn't.

**Drop the scope**
Split the work into two smaller tasks.

</div>

## Re-run after fixing

Each `vibe run` is a fresh run with a fresh runId. Past runs stay on disk at `.vibestrate/runs/`, so you can compare what the planner produced this time against last time:

```bash
diff .vibestrate/runs/<oldRunId>/plan.md .vibestrate/runs/<newRunId>/plan.md
```

## Rewind instead of restarting

Sometimes the plan and architecture were fine and only the implementation needs another pass. For example, the run was read-only and you now want the executor to actually write code. In that case you don't have to re-pay for planning and architecture. **Rewind** forks a fresh run that reuses the earlier artifacts and resumes from a stage you pick:

```bash
# Reuse the plan + architecture, redo the implementation onward:
vibe run "<same task>" --resume-from <oldRunId> --resume-stage executing

# Reuse just the plan, redo from architecture onward:
vibe run "<same task>" --resume-from <oldRunId> --resume-stage architecting

# Re-run everything from scratch (seeds nothing):
vibe run "<same task>" --resume-from <oldRunId> --resume-stage planning
```

`--resume-stage` defaults to `executing`, and accepts `planning`, `architecting`, or `executing`. The flow runner finds the first step at that stage, **seeds the outputs of every earlier step from the source run** (marking them *skipped (resumed)* in the run's step ledger), and starts there. The forked run gets its own runId and a fresh worktree off your main branch. That's correct, because these stages regenerate the downstream code. The original run is untouched, and its lineage is recorded under `resumedFrom` in the run's `state.json`. This works with `--flow` too: any flow that declares the matching step `stage` can be resumed. In the dashboard, the run's **Re-run with changes** dialog has a **Start from** selector with the same choices.

### Rewinding to review, fix, or verify (restores the run's code)

`reviewing`, `fixing`, and `verifying` are also resumable, but these stages need the executor's code already in place. So Vibestrate first **restores the source run's per-phase worktree snapshot** into the fresh worktree. A snapshot is a saved copy of the run's code at a point in time. Only runs that captured one (every run that produced code) can be rewound this way, and the CLI and dashboard tell you when there's none.

Because that restore overwrites and removes files, you can **dry-run it first** to see the exact blast radius - which files it would add, overwrite, or remove - before committing to it:

```bash
vibe run "<same task>" --resume-from <oldRunId> --resume-stage reviewing --preview
```

`--preview` prints the overwrite/remove set and exits **without starting a run**. The same data is available at `GET /api/runs/<id>/restore-preview?stage=reviewing`, and the dashboard's **Re-run** dialog shows a live preview panel when you pick a downstream stage. The restore itself is bounded: it only ever runs against a real, isolated run worktree, never your own checkout, and a failed or refused restore marks the run **unsafe** in its assurance verdict instead of letting it pass as verified.

### Housekeeping: pruning snapshots

Each rewind-able run anchors its code as a git ref under `refs/vibestrate/snapshots/`, which slowly grows your `.git`. Vibestrate never deletes these on its own. To reclaim them yourself:

```bash
vibe runs prune                 # drop snapshots for runs whose directory is gone (orphans)
vibe runs prune --keep 20       # keep the 20 most-recent runs, prune the rest
vibe runs prune --run <id>      # drop one run's snapshots
vibe runs prune --orphans --dry-run   # preview without deleting
```

It prints the plan and asks before deleting (skip the prompt with `-y`). Only refs are removed. The runs' artifacts and branches are untouched. The dashboard's **Runs** page has a **Prune snapshots** button for the same orphan cleanup, and `POST /api/runs/snapshots/prune` (with `dryRun`) is the API. For hands-off trimming, set `git.snapshotRetentionRuns` to keep the last N runs automatically.

## When to file a bug

If the same task fails in the same place across multiple providers, and the failure isn't traceable to your config or your task description, that's worth a bug report. Include the `runId`, the `events.jsonl` excerpt around the failure, and the provider stream log.

## Related

- [Run state](/docs/concepts/state) - definitions of `failed` and `blocked`.
- [Troubleshooting](/docs/troubleshooting) - common, reproducible issues with fixes.
