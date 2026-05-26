---
title: Create and run a task
description: From "I have a thing to do" to a merged diff, end to end.
section: workflows
slug: workflows/create-and-run
---

The shortest path from idea to merged change.

## 1. Frame the task

Write the task description like a brief for a careful colleague. Name the file, name the convention, name the constraint.

Good:

> Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed — never the values.

Bad:

> Improve settings logging.

## 2. Start the run

```bash
amaco run "Add audit logging to the settings save handler..."
```

Add `--ui` if you want the dashboard alongside:

```bash
amaco run "..." --ui
```

Pick a Guide if the work warrants the extra rigor:

```bash
amaco run "..." --guide quality-arbitration
```

Override the provider for this run:

```bash
amaco run "..." --provider claude
```

Or use the effort bucket:

```bash
amaco run "..." --effort high
```

## 3. Watch (or don't)

Amaco runs through plan → architect → execute → validate → review → fix → verify on its own. You can watch each phase in the terminal or the dashboard, or close the terminal and check back later — the run keeps going as long as Amaco's process is alive.

When the run finishes, it lands in one of:

- `merge_ready` — diff is ready to ship.
- `blocked` — reviewer or verifier flagged something a human should decide.
- `failed` — unrecoverable error during a stage.

## 4. Inspect the result

```bash
amaco status                  # what landed
amaco replay <runId>          # full read-only inspector
```

Or open the dashboard's **Git** tab to read the diff inline.

## 5. Merge — by hand

Amaco does not push, does not merge. The run leaves the diff on its branch in the worktree. You decide:

```bash
cd ../.amaco-worktrees/<runId>-<slug>
gh pr create                  # if you want review by a human
git push                       # if you just want to share the branch
```

Or merge locally:

```bash
git checkout main
git merge --ff-only amaco/<runId>-<slug>
```

Or abandon it:

```bash
amaco abort <runId>
# worktree is preserved for inspection; remove when you're done
```

## Related

- [Inspect a run in flight](./inspect-progress).
- [Pause, resume, abort](./pause-resume).
- [Debug a failed run](./debug-failed).
