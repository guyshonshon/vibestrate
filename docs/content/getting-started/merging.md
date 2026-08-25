---
title: Keep a change (Git and merging)
description: Git in one minute, and how to move a finished change from the run's copy into your real project.
slug: getting-started/merging
---

## In simple words

A run never edits your project folder. It works in its own copy - a git [[worktree]] beside your project, on its own branch - and stops at `merge_ready` with the change waiting there.

Folding it into `main` is the one step Vibestrate always leaves to you, and the sidebar's **Source** page is where you do it: **Changes**, **Tree**, **Merge**.

<div class="docs-callout tip">

**Tip.** Read the diff before merging, every time. The verdict tells you which checks ran and passed, not that the change is the one you wanted. Only you can answer the second question.

</div>

![The Workspace panel of a run, naming the branch and the run's isolated git worktree path, with a Copy cd button.](/media/docs/scoped/run-workspace.png)

**Copy cd** on the run page puts the worktree path on your clipboard, to read the work in your editor.

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

**Did you know?** The merge advice is read-only: it reads the run's branch and recommends one of three routes, changing nothing. The merge is a separate click; finishing into `main` asks you to confirm first, and from the terminal needs the `merge-to-main` token typed out.

</div>

## Git in one minute

<div class="docs-cards">

**A branch** is a parallel line of work. Your real code sits on one, usually `main`; a new change grows on its own branch until you combine them.

**A worktree** is a second folder checked out to a branch. Every run gets one, so the agent edits files there, not in your project folder.

**A merge** folds one branch into another: the run's branch into `main` is how a finished change becomes part of your project.

</div>

Run ids are short docker-style handles like `bold-lovelace`, so that run's branch is `vibestrate/bold-lovelace`.

## Read the change

**Source > Changes** lays out your working tree and every run's worktree; **What each run changed** opens each diff file by file. Or read it where it sits:

```bash
cd ../.vibestrate-worktrees/<runId>
git diff main
```

## Ask for advice, then integrate

**Source > Merge** lists every merge-ready run: how far **ahead** and **behind** `main`, how many files it touched, its assurance lanes. **Get merge advice** opens one, with risk flags first (did your checks run at all, does the change touch protected paths), then a dry-run conflict report, then one of three recommendations:

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

Below it, **Integrate this run** merges into the branch you name - `integration/main` to start with, never straight into `main`. A conflict stops it and leaves a mergeable worktree rather than half a merge. Once that branch is clean, **Complete merge to main** appears, asks you to confirm, and merges locally. It never pushes.

**Analyze the diff**, under **Analyze deeper**, is the optional model pass: a local provider reads the run's redacted diff and writes advisory prose on risks a text check can't see, like concurrency or missing tests. It never merges, never pushes, and cannot change the recommendation above it.

## Plan any merge, run or not

**Source > Tree** draws your repo's commit graph. Pick a source and a target in the **Merge planner** and press **Predict** for the result before it happens. A clean prediction offers **Apply merge**; **Guided merge** has the supervisor propose a resolution for a conflict, with the apply still your explicit click. **Undo merge on "&lt;target&gt;"** reverses the last merge on that branch, while it is unpushed and nothing is built on top.

## From the terminal

```bash
vibe integrate advise <runId>    # the same read-only advice; --json for a machine
vibe integrate preview           # dry-run conflict report across merge-ready runs
vibe integrate analyze <runId>   # the optional model read of the diff
vibe integrate apply --into integration/<name>
vibe integrate finish <branch>   # merge to main, typed confirmation, local only
```

Or use git directly. It is a normal branch:

```bash
# Open a pull request (best on a shared project)
cd ../.vibestrate-worktrees/<runId>
gh pr create

# Or merge it into main locally
git checkout main
git merge --ff-only vibestrate/<runId>
```

To throw the change away, leave the branch alone. Nothing ever reached `main`.

## Merging is always your call

Merging is the moment you commit: the change joins your shared history and ships from there. A bad merge is revertible, but only after the wrong code was trusted and built on, and no model can vouch for its own work well enough to make that call for you. See [the safety guarantees](/docs/concepts/safety).

The advice is **deterministic**: git facts and check lanes in, recommendation out, so the same inputs always give the same answer and no [supervisor](/docs/concepts/supervisor) persona colours it. A model enters only when you ask for the deeper read.

## Keep going

- [Your first run](/docs/getting-started/first-run) - where the change came from.
- [Task lifecycle](/docs/task-lifecycle) - the statuses a run moves through.
- [Worktree](/docs/concepts/worktree) - the safe copy each run works in.

## Next

[Why you stay in the loop →](/docs/getting-started/why-a-human) - what actually catches a bad change, and why the last call is a human's.
