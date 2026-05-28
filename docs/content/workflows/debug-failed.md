---
title: Debug a failed run
description: A practical playbook for figuring out why a run ended in failed or blocked.
section: workflows
slug: workflows/debug-failed
---

There are two failure shapes: `failed` (an unrecoverable error during a stage) and `blocked` (the reviewer or verifier said "do not continue").

## Start with `replay`

```bash
vibestrate replay <runId>
```

This opens the read-only inspector. The status line tells you which stage threw, and the artifact list tells you what was already recorded.

## If status is `failed`

The orchestrator landed in `failed` because a stage raised an error it couldn't recover from. Look at:

1. **`events.jsonl`** — the last event before the failure shows which transition triggered the error.
2. **The provider stream log** at `.vibestrate/runs/<runId>/outputs/<stage>.log` — usually contains the model's last response and any tool-use error.
3. **The validation output** at `.vibestrate/runs/<runId>/validation.json` — if the failure was during validation, the exit codes and stderr are here.

Common causes:

- **Provider not authenticated.** Run `vibestrate provider test <id>` to confirm.
- **Validation command missing.** Check `commands.validate` in `project.yml`.
- **Worktree creation failed.** `requireCleanMain: true` and main has uncommitted changes is a common one.
- **Skill referenced doesn't exist.** Check `vibestrate skills list`.

## If status is `blocked`

`blocked` is not a crash — it's the system telling you a decision is needed. Read:

1. **`review.md`** — the reviewer's findings and the `BLOCKED` rationale.
2. **`verification.md`** — if the verifier blocked, this has the summary.

Then act on the findings. The right answer is rarely "rerun and hope." Usually it's:

- Edit the task description to be more specific.
- Add a skill encoding the rule you didn't realize the agent didn't know.
- Adjust a permission profile if the agent was reaching for something it shouldn't.
- Drop the scope — split into two smaller tasks.

## Re-run after fixing

Each `vibestrate run` is a fresh run with a fresh runId. Past runs are preserved at `.vibestrate/runs/`, so you can compare what the planner produced this time vs last time:

```bash
diff .vibestrate/runs/<oldRunId>/plan.md .vibestrate/runs/<newRunId>/plan.md
```

## Rewind instead of restarting

When the plan and architecture were fine and only the implementation needs another pass (for example, the run was read-only and you now want the executor to write), you don't have to re-pay for planning and architecture. **Rewind** forks a fresh run that reuses the earlier artifacts and resumes from a chosen stage:

```bash
# Reuse the plan + architecture, redo the implementation onward:
vibestrate run "<same task>" --resume-from <oldRunId> --resume-stage executing

# Reuse just the plan, redo from architecture onward:
vibestrate run "<same task>" --resume-from <oldRunId> --resume-stage architecting

# Re-run everything from scratch (seeds nothing):
vibestrate run "<same task>" --resume-from <oldRunId> --resume-stage planning
```

`--resume-stage` defaults to `executing`, and accepts `planning`, `architecting`, or `executing`. The flow runner finds the first step at that stage, **seeds the outputs of every earlier step from the source run** (marking them *skipped (resumed)* in the run's step ledger), and starts there. The forked run gets its own runId and a fresh worktree off your main branch — correct, because these stages regenerate the downstream code — and the original run is untouched (its `state.json` records the lineage under `resumedFrom`). Works with `--flow` too: any flow that declares the matching step `stage` can be resumed. In the dashboard, the run's **Re-run with changes** dialog has a **Start from** selector with the same choices.

Resuming at *reviewing* or *verifying* isn't supported: those stages need the executor's code already present, and Vibestrate doesn't snapshot the per-step worktree yet. The CLI rejects those stages with a clear message.

## When to file a bug

If the same task fails in the same place across multiple providers and the failure isn't traceable to your config or the task description, that's worth a bug report. Include the `runId`, the `events.jsonl` excerpt around the failure, and the provider stream log.

## Related

- [Run state](/docs/concepts/state) — definitions of `failed` and `blocked`.
- [Troubleshooting](/docs/troubleshooting) — common, reproducible issues with fixes.
