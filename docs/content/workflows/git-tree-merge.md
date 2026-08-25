---
title: Merge from the git tree
description: Explore your branches as a graph, predict a merge before you apply it, let the supervisor resolve conflicts, and undo with one click.
slug: workflows/git-tree-merge
---

## In simple words

Folding one branch into another - a finished run's branch into `main`, or two pieces of work together - is something the **Git tree** lets you see before you do it. It is the **Source** page's **Tree** tab in [Mission Control](/docs/cli/dashboard), and the interactive canvas has no CLI equivalent by design.

The per-run path does have one:

```bash
vibe integrate advise <runId>    # read-only: what would merging this do?
vibe integrate apply <runId> --into integration/logging
vibe integrate finish integration/logging \
  --confirm merge-to-main
```

<div class="docs-callout tip">

**Tip.** Look before you merge. The tree shows the shape of what you are about to combine, which beats deciding from a branch name.

</div>

## What it is good for

<div class="docs-cards">

**Seeing the shape**
Which branches exist, where they forked, what is ahead of what.

**Reading a commit**
Before deciding whether you want it.

**Predicting a merge**
What would happen, before it happens.

**Undoing one**
There is a real revert path, not just advice to be careful.

</div>

<div class="docs-callout">

**Did you know?** The merge advisor is read-only. It reads the run's branch and recommends one of three routes - finish now, stage on an integration branch, or resolve first - and changes nothing. Merging is a separate command, and finishing into `main` needs the literal token `merge-to-main`, typed at a prompt or passed as `--confirm`.

</div>

## See the shape of your history

The left panel is the commit graph: a lane rail beside commit rows carrying the subject, the diff size (`+added -removed`), the author and the short hash. Branch tips render as labelled ring nodes so a tip never looks like a plain commit, and `main` is the violet spine. On a large repository the graph is bounded to the most recent commits.

Click a commit and its history stays lit while everything unrelated dims; if the commit reached `main` through a merge, the merge commit is marked **merged here**.

## See every branch

Switch the left panel from **Graph** to **Branches** for a flat list of every local branch - the view that still works when history is linear and the graph collapses to one rail. Each row shows the branch's standing against `main`: how far ahead and behind (`up`/`down`), its diff size, merged or open, and its latest commit. A ledger up top counts open against merged. Click a branch to focus its tip in the graph and stage it as the merge planner's source.

## Inspect a commit

The **Inspector** in the middle answers the first question about any commit - is it on main? - as a toned status (on main / merged / unmerged), then the diff totals, the files it changed with per-file `+`/`-`, the full message body, and its parents and branch tips as jump links, each marked **merged** or **open**.

## Predict before you apply

In the **Merge planner** on the right, pick a **source** and a **target** branch. The pickers annotate every branch as `main`, `merged` or `open`, and if the pair is already merged the planner says so before any prediction runs. Then **Predict**: Vibestrate performs the merge in a throwaway worktree - never on a real branch - and tells you one of three things:

<div class="docs-cards">

**Clean** - the merge applies with no conflicts. You can apply it as-is.

**Already up to date** - the source is already contained in the target. Nothing to do.

**Conflicts** - the files that would conflict, listed by name. Resolve them before applying.

</div>

The prediction is read-only and the scratch worktree is always torn down. When every branch is already merged, the planner says so instead of offering a no-op.

## Ask the supervisor

**Ask the supervisor** sits above the planner's actions, with an **Ask** button that consults your local provider: which open branch is worth merging next, and whether the pair you picked is safe to merge now. It answers with a confidence level and its caveats, and it never merges for you.

**Guided merge** goes further: it runs the prediction and, on a conflict, has the supervisor propose a resolution. Applying the result is still a separate, explicit click.

## Let the supervisor resolve conflicts

On a conflict, **Ask supervisor to propose** has your local provider - the same assist path the rest of Vibestrate uses - propose a merged version of each conflict region with a rationale. You review a three-way view (ours / theirs / proposed) and edit the result before anything is written. The proposal is the **whole file** with the conflict regions resolved, so the lines that did not conflict are preserved. **Apply resolved merge** is what writes it.

This step is secret-safe by construction:

- A file whose **path** looks secret-like (a `.env`, a key file) is refused outright and never sent to a provider - resolve it yourself.
- Conflict bodies are **redacted** of secret-shaped tokens before they reach the provider.
- A binary or unparseable conflict is flagged for manual resolution.

The supervisor never commits.

## Apply, and undo

**Apply merge** performs the real merge on the target branch with `--no-ff`, so it is always a merge commit, after recording the target's pre-merge sha. It is gated through the [Action Broker](/docs/concepts/safety) (`git.merge`), refuses a dirty tree or a target that is not checked out, and **never moves your HEAD or pushes**.

**Undo merge** resets the branch back to the recorded pre-merge sha. It is guarded: it refuses once anything has been built on top of the merge, once the merge has reached an upstream (best-effort push detection), if the recorded point has drifted, or if uncommitted work would be discarded. It can only reverse a merge that is still safe to reverse.

## The per-run path

The **Merge** tab beside Tree is the run-shaped version of the same job, and what `vibe integrate` drives:

```bash
vibe integrate advise            # every merge-ready run
vibe integrate advise <runId> --json
vibe integrate preview           # dry-run conflict report
vibe integrate apply <runId> --into integration/<name>
vibe integrate finish integration/<name> \
  --confirm merge-to-main
```

`advise` is computed from git facts and check lanes - no model output - and merges nothing. `apply` integrates into a dedicated branch, never `main`. `finish` is the only one that reaches `main`: it takes the integration branch as its argument and the exact token `merge-to-main`, either as `--confirm` or typed at the prompt. Any other value exits 2 rather than falling through to the prompt, it refuses partial integrations, dirty trees and conflicts, and it is local only - nothing is pushed.

## What it does not do

Merges only - no rebase, squash, cherry-pick, amend or force. No auto-merge, no auto-apply, no push. The interactive canvas is UI-only by design; the underlying operations are plain git, so the [merge advisor](/docs/getting-started/merging) and `vibe integrate` remain the terminal path for the per-run flow.
