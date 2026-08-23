---
title: Keep a change (Git and merging)
description: Git in one minute, and how to move a finished change from the run's copy into your real project.
slug: getting-started/merging
---

## In simple words

A run never edits your project folder. It works in its own copy - a git [[worktree]] beside your project, on its own branch - and stops at `merge_ready` with the change waiting there.

Folding it into `main` is the one step Vibestrate always leaves to you.

![The Workspace panel of a run, naming the branch and the run's isolated git worktree path, with a Copy cd button.](/media/docs/scoped/run-workspace.png)

**Copy cd** puts the path on your clipboard, so you can go and read the work before you take it.

<div class="docs-callout tip">

**Tip.** Read the diff before merging, every time. The verdict tells you which checks ran and passed; it does not tell you the change is the one you wanted. Those are different questions and only you can answer the second.

</div>

## Your three options

<div class="docs-cards">

**Take it**
Merge the run's branch into yours. The advisor can tell you what that would do first.

**Take part of it**
It is a normal git branch. Cherry-pick what you want.

**Leave it**
Ignore the folder. Nothing entered your branch, so there is nothing to undo.

</div>

<div class="docs-callout">

**Did you know?** `vibe integrate advise` is read-only. It reads the run's branch and tells you which of the three routes it recommends, changing nothing. The merge itself needs a separate command, and finishing into `main` needs a typed confirmation token.

</div>

## Git in one minute

Three ideas cover it.

<div class="docs-cards">

**A branch** is a parallel line of work. Your real code sits on a branch, usually `main`. A new change can grow on its own branch without disturbing `main`, until you decide to combine them.

**A worktree** is a second folder checked out to a branch. Every run gets one, so the agent edits files there instead of in your project folder.

**A merge** folds one branch into another. Merging the run's branch into `main` is how a finished change becomes part of your project.

</div>

Run ids are short docker-style handles like `bold-lovelace`, so that run's branch is `vibestrate/bold-lovelace`.

## Look at what changed

Open the run's copy and read every line it touched:

```bash
cd ../.vibestrate-worktrees/<runId>
git diff main
```

Or open the **Source** page in [Mission Control](/docs/cli/dashboard) and pick its **Changes** tab, which shows you the same diff file by file.

## Ask the merge advisor

You don't have to judge the risk on your own:

```bash
vibe integrate advise <runId>
```

It leads with risk flags - did your checks run at all, does the change touch protected files - then a dry-run conflict report, then one of three recommendations:

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

It merges nothing and touches no branch. The Source page's **Merge** tab shows you the same thing.

## Going deeper

### Take the change

The branch is yours. Two ways to keep it:

```bash
# Open a pull request (best on a shared project)
cd ../.vibestrate-worktrees/<runId>
gh pr create

# Or merge it into main locally
git checkout main
git merge --ff-only vibestrate/<runId>
```

To throw the change away, leave the branch alone. Nothing ever reached `main`.

### Merging is always your call

Merging is the moment you commit to the change. It joins your shared history, and you can ship from there. You can revert a bad merge, but only after the wrong code was already trusted and built on. No model can vouch for its own work well enough to make that call for you. See [the safety guarantees](/docs/concepts/safety) for the rule.

`vibe integrate advise` is **deterministic**: it reports git facts and computes the recommendation from them, so the same inputs always give the same advice, and no [supervisor](/docs/concepts/supervisor) persona colors it.

A model only enters when you ask for the deeper read with `vibe integrate analyze`. That sends the run's redacted diff to a provider to look for risks a text check can't see, like concurrency or missing tests. It's advisory prose only: it never merges, never pushes, and can't change the advisor's recommendation or risk flags.

### Keep going

- [Your first run](/docs/getting-started/first-run) - where the change came from.
- [Task lifecycle](/docs/task-lifecycle) - the statuses a run moves through.
- [Worktree](/docs/concepts/worktree) - the safe copy each run works in.
