---
title: Worktree
description: Every run gets its own isolated git worktree. The orchestrator never edits your project root.
section: concepts
slug: concepts/worktree
---

**Professional explanation.** A run worktree is a separate git worktree linked to the project repository, created at run start under `git.worktreeDir` (default `../.amaco-worktrees/`), and bound to a fresh branch named `<git.branchPrefix><runId>-<slug>`. All write-side actions during the run are constrained to this directory by the path guard (`src/core/path-guard.ts`); any attempt to write outside it is refused. The worktree is preserved across `aborted` and `blocked` runs for inspection.

**Simple explanation.** Each run gets its own copy of your repo, on its own branch. Your main checkout is never touched.

## Why it matters

Isolation is what makes Amaco safe to run on a real working repo. You can have an active run editing files while you keep coding in the project root — they're on different branches in different directories, and git doesn't notice the overlap.

It also means a failed run leaves a forensic copy: the worktree is on disk, the branch exists, you can `cd` in and read the half-finished work.

## Where worktrees live

By default:

```text
your-project/                  ← your main checkout
../.amaco-worktrees/
  abc123-add-audit-logging/    ← run abc123's worktree
  def456-fix-token-leak/       ← run def456's worktree
```

You can change the location in `project.yml`:

```yaml
git:
  worktreeDir: ../.amaco-worktrees   # default
  branchPrefix: amaco/                # default
```

## What goes in (and out)

The orchestrator writes:

- File edits from the executor and fixer agents.
- The branch's commit history (one commit per stage, signed by the role).
- Nothing else. No `.amaco/runs/` artifacts go inside the worktree — those live under the project root's `.amaco/runs/<runId>/`.

The orchestrator refuses:

- Writes outside the worktree path.
- Writes to known-secret paths (`.env`, `*.pem`, etc.).
- Patch hunks that add high-precision token shapes (the secret-shape refusal).

## After the run

- **`merge_ready`** — branch is ready for you to merge. The worktree stays on disk until you delete it.
- **`blocked` / `failed`** — worktree is preserved. Inspect, copy out fragments, or abandon.
- **`aborted`** — worktree is preserved. You'll need to `git worktree remove` it manually if you don't want it.

To clean up:

```bash
cd your-project
git worktree remove ../.amaco-worktrees/<runId>-<slug>
git branch -D amaco/<runId>-<slug>
```

## Common mistakes

- **Running `git checkout main` inside a worktree.** Worktrees are bound to their own branch; switching branches inside one defeats the isolation.
- **Treating the worktree as throwaway.** If a run does interesting partial work, you can copy commits out before deleting the worktree.
- **Configuring `worktreeDir` inside the project root.** Don't — it shadows your real working tree. Always use a sibling directory.

## Related

- [Run state](/docs/concepts/state) — terminal statuses determine whether you want to keep the worktree.
- [Task lifecycle](/docs/task-lifecycle) — when the worktree is created and torn down.
