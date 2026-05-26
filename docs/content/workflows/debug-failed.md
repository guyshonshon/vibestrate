---
title: Debug a failed run
description: A practical playbook for figuring out why a run ended in failed or blocked.
section: workflows
slug: workflows/debug-failed
---

There are two failure shapes: `failed` (an unrecoverable error during a stage) and `blocked` (the reviewer or verifier said "do not continue").

## Start with `replay`

```bash
amaco replay <runId>
```

This opens the read-only inspector. The status line tells you which stage threw, and the artifact list tells you what was already recorded.

## If status is `failed`

The orchestrator landed in `failed` because a stage raised an error it couldn't recover from. Look at:

1. **`events.jsonl`** — the last event before the failure shows which transition triggered the error.
2. **The provider stream log** at `.amaco/runs/<runId>/outputs/<stage>.log` — usually contains the model's last response and any tool-use error.
3. **The validation output** at `.amaco/runs/<runId>/validation.json` — if the failure was during validation, the exit codes and stderr are here.

Common causes:

- **Provider not authenticated.** Run `amaco provider test <id>` to confirm.
- **Validation command missing.** Check `commands.validate` in `project.yml`.
- **Worktree creation failed.** `requireCleanMain: true` and main has uncommitted changes is a common one.
- **Skill referenced doesn't exist.** Check `amaco skills list`.

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

Each `amaco run` is a fresh run with a fresh runId. Past runs are preserved at `.amaco/runs/`, so you can compare what the planner produced this time vs last time:

```bash
diff .amaco/runs/<oldRunId>/plan.md .amaco/runs/<newRunId>/plan.md
```

## When to file a bug

If the same task fails in the same place across multiple providers and the failure isn't traceable to your config or the task description, that's worth a bug report. Include the `runId`, the `events.jsonl` excerpt around the failure, and the provider stream log.

## Related

- [Run state](../concepts/state) — definitions of `failed` and `blocked`.
- [Troubleshooting](../troubleshooting) — common, reproducible issues with fixes.
