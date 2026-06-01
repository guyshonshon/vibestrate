# Design: Rewind phase 2 - resume at review / verify / fix

Status: **in progress**. Extends Rewind phase 1 (`resumeFrom` at planning /
architecting / executing) to the downstream stages.

## The gap

Phase 1 forks a fresh run from a prior run and resumes at an upstream stage by
**seeding that run's upstream artifacts** (plan, architecture) and re-running
from the chosen stage. That works for planning/architecting/executing because
those stages *regenerate* the code from scratch - the new worktree starts empty
off the base branch and the executor fills it.

Review / verify / fix are different: they operate on **code that already
exists** - the executor's output. Seeding artifacts isn't enough; the resumed
run's worktree must contain the same files the original run's executor produced.
Today the run only ever has its *final* tree (in its own worktree, which is torn
down), so there's nothing to restore a downstream stage from.

## Decision: per-phase worktree snapshots as durable git objects

Runs share the project's `.git` object database (`git worktree add` off the
project repo), so a tree captured in run A is reachable from run B's worktree.
We already have the primitives in `diff-gate.ts`:

- `snapshotWorktree(wt)` = `git add -A` + `git write-tree` → a tree sha
  (non-destructive).
- `restoreWorktree(wt, tree)` = `git read-tree` + `git checkout-index -fa` +
  `git clean -fd` → materialize that tree into a worktree.

**Capture.** At each downstream phase boundary that changes code - after the
**executing** stage, and after each **fixing** stage - capture the worktree
tree and make it durable so a *later* rewind can still find it:

1. `tree = snapshotWorktree(wt)`
2. `commit = git commit-tree <tree> -m "…"` (parentless; explicit author env so
   it never depends on the user's git config)
3. `git update-ref refs/vibestrate/snapshots/<runId>/<seq> <commit>` - a ref out
   of the way of branches keeps the tree + blobs reachable across `git gc`.

The snapshots are recorded in `runs/<id>/phase-snapshots.json`
(`{seq, stage, treeSha, commitSha, ref, at}`), the run's durable manifest.

**Restore.** When a run resumes at `reviewing` / `fixing` / `verifying`, after
its fresh worktree is prepared we restore the source run's relevant snapshot -
the latest snapshot at-or-before the resume stage (review → the executing
snapshot; verify → the last fixing snapshot) - into the new worktree via
`restoreWorktree`. Upstream artifacts are still seeded exactly as phase 1 does,
so the resumed downstream stages see both the code and the plan/review context.

## Scope (V1)

- Capture after executing + after each fixing stage (the code-producing phases).
- `ResumeStage` gains `reviewing | fixing | verifying`.
- `resolveResumeFrom` validates the source run actually has a usable snapshot for
  the requested stage; a clear error otherwise (no silent empty rewind).
- Restore the chosen snapshot into the resumed worktree before the stage walk.
- CLI `--resume-stage`, `POST /api/runs` `resumeFrom.fromStage`, and the run
  state `resumedFrom.fromStage` all accept the new stages.

## Safety & known issues

The restore is destructive (`checkout-index -f` + `clean -fd`), so it is confined
to the run's dedicated throwaway worktree (`resolveWorktreePath` always yields a
per-run subdir, never the project root) and guarded by `isSafeRestoreTarget`
(refuses the project root). Snapshot ref/object accumulation, partial-restore
handling in assurance, and a restore preview are tracked as
**[ISSUE-001](../ISSUES.md#issue-001--rewind-restore-is-destructive--bound-its-blast-radius-)**.

## Out of scope / honest limits

- Snapshots are git objects in the shared repo; a `git gc --prune=now` between
  the original run and the rewind could still drop an unreferenced blob, but the
  ref keeps them reachable under normal operation.
- We restore the latest code snapshot ≤ the resume stage, not an arbitrary
  point-in-time; per-turn (sub-phase) rewind is not in scope.
- No cross-repository rewind (the snapshot lives in the project's object DB).
