---
title: Keep a change (Git and merging)
description: What Git is in one minute, and how to take a finished run from its safe copy into your real project.
slug: getting-started/merging
---

A run never edits your project folder. It works in its own copy - a git worktree under `../.vibestrate-worktrees/`, on a branch named `vibestrate/` plus the run id - and stops at `merge_ready` with the change waiting on that branch. Folding it into `main` is the one step Vibestrate always leaves to you. New to Git? Start with the next section. Otherwise skip ahead to taking the change.

## Git in one minute

Three ideas are all you need.

<div class="docs-cards">

**A branch** is a parallel line of work. Your real code lives on a branch, usually `main`. A new change can grow on its own branch without disturbing `main`, until you decide to combine them.

**A worktree** is a separate folder checked out to a branch. Every run gets its own, so the agent edits files there rather than in your project folder.

**A merge** is folding one branch into another. Merging the run's branch into `main` is how a finished change becomes part of your project.

</div>

Run ids are short docker-style handles like `bold-lovelace`, so that run's branch is `vibestrate/bold-lovelace`.

## Look at what changed

From the run's worktree, see every line it touched:

```bash
cd ../.vibestrate-worktrees/<runId>
git diff main
```

Or open the **Source** page in [Mission Control](/docs/cli/dashboard), on its **Changes** tab, which shows the same diff file by file.

## Ask the merge advisor

You don't have to judge the risk alone:

```bash
vibe integrate advise <runId>
```

It reports risk flags first - did your checks actually run, does the change touch protected files - then a dry-run conflict report, then one of three recommendations:

<svg viewBox="0 0 560 132" width="100%" style="max-width:560px;height:auto" role="img" aria-label="vibe integrate advise ends on one of three recommendations: finish now, stage on an integration branch, or resolve conflicts first.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="46" width="180" height="40" rx="8"/>
    <rect x="245" y="8" width="314" height="32" rx="8"/>
    <rect x="245" y="50" width="314" height="32" rx="8"/>
    <rect x="245" y="92" width="314" height="32" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M181 66 h32"/>
    <path d="M213 24 V108"/>
    <path d="M213 24 h27"/>
    <path d="M213 66 h27"/>
    <path d="M213 108 h27"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="240,20.5 245,24 240,27.5"/>
    <polygon points="240,62.5 245,66 240,69.5"/>
    <polygon points="240,104.5 245,108 240,111.5"/>
  </g>
  <text x="91" y="70" fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">integrate advise</text>
  <g fill="currentColor" font-size="12">
    <text x="261" y="28">finish now</text>
    <text x="261" y="70">stage on an integration branch</text>
    <text x="261" y="112">resolve conflicts first</text>
  </g>
</svg>

Nothing is merged and no branch is touched. The same view is the Source page's **Merge** tab.

## Take the change

The branch is yours. Two ways to keep it:

```bash
# Open a pull request (best on a shared project)
cd ../.vibestrate-worktrees/<runId>
gh pr create

# Or merge it into main locally
git checkout main
git merge --ff-only vibestrate/<runId>
```

To throw the change away, ignore the branch. Nothing ever reached `main`.

## Why is merging always manual?

Merging is the point of commitment - it joins your shared history and can ship from there. You can revert a bad merge, but only after the wrong code was already trusted and built on. A model that cannot fully vouch for its own work is the wrong thing to make that call for you. See [the safety guarantees](/docs/concepts/safety) for the rule.

Is the advisor just another AI opinion, then? No. `vibe integrate advise` is **deterministic**: it reports git facts and computes the recommendation from them, so the same inputs always give the same advice, and no [supervisor](/docs/concepts/supervisor) persona colors it.

A model only enters when you ask for the deeper read with `vibe integrate analyze`. That sends the run's redacted diff to a provider to look for risks a textual check cannot see, like concurrency, error handling, or missing tests. It is advisory prose only: it never merges, never pushes, and can never change the advisor's recommendation or risk flags.

## Keep going

- [Your first run](/docs/getting-started/first-run) - where the change came from.
- [Task lifecycle](/docs/task-lifecycle) - the statuses a run moves through.
- [Worktree](/docs/concepts/worktree) - the safe copy each run works in.
