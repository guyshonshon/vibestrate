---
title: Keep a change (Git and merging)
description: What Git is in one minute, and how to take a finished run from its safe copy into your real project.
section: getting-started
slug: getting-started/merging
---

A run finishes at `merge_ready` with the change sitting on its own branch, in a separate copy of your project. This page is the last step: getting that change into your real code. New to Git? Start here. Otherwise, skip to taking the change.

## Git in one minute

Vibestrate is built on **Git**, the standard tool for tracking versions of code. Three ideas are all you need.

<div class="docs-cards">

**A branch** is a parallel line of work. Your real code lives on a branch (usually `main`). A new change can grow on its own branch without disturbing `main`, until you decide to combine them.

**A worktree** is a separate folder checked out to a branch. Vibestrate gives every run its own worktree under `../.vibestrate-worktrees/`, so the AI edits files there, never in your real project folder.

**A merge** is folding one branch into another. Merging the run's branch into `main` is how a finished change actually becomes part of your project. It is the one step Vibestrate leaves entirely to you.

</div>

So a run never touches your files. It works in its own worktree, on a branch named `vibestrate/<runId>-<slug>`, and waits for you.

## Look at what changed

From the run's worktree, see every line it touched:

```bash
cd ../.vibestrate-worktrees/<runId>-<slug>
git diff main
```

Or open the **Git** tab in [Mission Control](/docs/cli/dashboard), which shows the same diff file by file.

## Ask the merge advisor

You don't have to judge the risk alone. The advisor is read-only and lays out the facts before you merge:

```bash
vibe integrate advise <runId>
```

It reports risk flags first (did your checks actually run? does the change touch protected files?), then a dry-run conflict report and a recommendation: finish now, stage on an integration branch, or resolve conflicts first. Nothing is merged and no branch is touched. The same view is the dashboard's **Merge** page. For a deeper, semantic read, `vibe integrate analyze <runId>` has a local model look for risks a textual check can't see, like concurrency, error handling, or missing tests. It is advisory only.

## Take the change

The branch is yours. Three ways to keep it:

```bash
# Open a pull request for review (best on a shared project)
cd ../.vibestrate-worktrees/<runId>-<slug>
gh pr create

# Or merge it into main locally
git checkout main
git merge --ff-only vibestrate/<runId>-<slug>
```

Or `git push` the branch to share it as is. To throw the change away, just ignore the branch. Nothing ever reached `main`.

<div class="docs-callout tip">

**New to this?** Open a pull request (`gh pr create`) instead of merging locally. It gives you, or a teammate, a clean place to read the change one more time before it lands, and it is how teams normally take changes on a shared project.

</div>

## Why is merging always manual?

Two rules are on by default and not negotiable: Vibestrate never auto-merges, and it never auto-pushes. A run stops at `merge_ready` and hands you the diff. Folding it into `main` is always a decision you make.

Merging is the point of commitment - it joins your shared history and can ship from there. You can revert a bad merge, but only after the wrong code was already trusted and built on. A model that cannot fully vouch for its own work is the wrong thing to make that call on your behalf.

A fair question is whether the merge advisor is just another AI opinion dressed up as a recommendation. It is not. `vibe integrate advise` is **deterministic**: it reports facts - did your checks actually run, does the change touch protected paths, are there conflicts - and a recommendation computed from them. The same inputs always give the same advice, and no persona or [supervisor](/docs/concepts/supervisor) "voice" colors it. A model only enters if you explicitly ask for the deeper read with `vibe integrate analyze`, and even then it is advisory: it never merges, never relaxes the recommendation, and never pushes.

## Keep going

- [Your first run](/docs/getting-started/first-run) - where the change came from.
- [Task lifecycle](/docs/task-lifecycle) - the statuses a run moves through.
- [Worktree](/docs/concepts/worktree) - the safe copy each run works in.
