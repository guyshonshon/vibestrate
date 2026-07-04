---
title: Merge from the git tree
description: Explore your branches as a graph, predict a merge before you apply it, let the supervisor resolve conflicts, and undo with one click.
section: workflows
slug: workflows/git-tree-merge
---

When you want to fold one branch into another - a finished run's branch into
`main`, or two pieces of work together - the **Git tree** turns it into something
you can see and reverse. It is the interactive, any-node-to-any-node evolution of
the [merge advisor](/docs/getting-started/merging): the same safety model, but
you drive it from a graph instead of a list.

Open it from the dashboard nav (**Diffs**). Nothing on this page touches a real
branch until you click Apply.

## See the shape of your history

The left panel is the commit graph: a lane rail next to rich commit rows - each
row carries the subject, the diff size (`+added -removed`), the author, and the
short hash. Branch tips render as labelled ring nodes so a tip never looks like
a plain commit, and `main` is the violet spine. On a large repository the graph
is bounded to the most recent commits.

Click a commit and the graph tells its story: the commit's history stays lit,
everything unrelated dims, and if the commit reached `main` through a merge,
the merge commit is marked **merged here**.

## See every branch

Switch the left panel to **Branches** for a flat list of every local branch -
the view that works even when history is linear and the graph collapses to one
rail. Each row shows the branch's standing against `main`: how far ahead and
behind (`up`/`down`), its own diff size (`+added -removed`), whether it is
already merged or still open, and its latest commit. A one-line ledger up top
counts open vs merged. Click a branch to focus its tip in the graph and stage
it as the merge planner's source.

## Inspect a commit

The middle panel answers the first question about any commit - is it on main? -
as a toned status (on main / merged / unmerged), then the diff totals, the
files it changed with per-file `+`/`-`, the full message body, and its parents
and branch tips as jump links. Branch tips also say whether that branch is
already **merged** or still **open**.

## Predict before you apply

In the planner (right panel), pick a **source** and a **target** branch. The
pickers annotate every branch as `main`, `merged`, or `open`, and if the pair
you picked is already merged the planner says so up front - before any
prediction runs. Then **Predict**: Vibestrate performs the merge in a throwaway
worktree - never on a real branch - and tells you one of three things:

<div class="docs-cards">

**Clean** - the merge applies with no conflicts. You can apply it as-is.

**Already up to date** - the source is already contained in the target. Nothing
to do.

**Conflicts** - the files that would conflict, listed by name. Resolve them before
applying.

</div>

The prediction is read-only and the scratch worktree is always torn down. When
every branch is already merged, the planner says so instead of offering a no-op.

## Ask the supervisor

The planner has an **Ask the supervisor** button that consults your local
provider for advice - which open branch is worth merging next, and whether the
pair you picked is safe to merge now. It is read-only: the supervisor never
merges for you. **Guided merge** takes it one step further: it runs the
prediction and, on a conflict, has the supervisor propose a resolution
automatically - but applying the result is always a separate, explicit click.

## Let the supervisor resolve conflicts

On a conflict, click **Ask supervisor to propose**. Your local provider (the same
assist path the rest of Vibestrate uses) proposes a merged version of each
conflict region, with a one-line rationale. You review a three-way view (ours /
theirs / proposed) and edit the result before anything is written. The proposal
is the **whole file** with the conflict regions resolved, so the lines that did
not conflict are preserved.

This step is secret-safe by construction:

- A file whose **path** looks secret-like (a `.env`, a key file) is refused
  outright and never sent to a provider - resolve it yourself.
- Conflict bodies are **redacted** of secret-shaped tokens before they reach the
  provider.
- A binary or unparseable conflict is flagged for manual resolution.

The supervisor never commits. Apply is still your click.

## Apply, and undo if you change your mind

**Apply** performs the real merge on the target branch with `--no-ff` (so it is
always a merge commit), after recording the target's pre-merge sha. It is gated
through the [Action Broker](/docs/concepts/safety) (`git.merge`), refuses a dirty
tree or a target that is not checked out, and **never moves your HEAD or pushes**.

Changed your mind? **Undo last merge** resets the branch back to the recorded
pre-merge sha. Undo is guarded - it refuses once anything has been built on top of
the merge, once the merge has reached an upstream (best-effort push detection), or
if the recorded point has drifted - so it can only reverse a merge that is still
safe to reverse.

## What it does not do

Merges only - no rebase, squash, cherry-pick, amend, or force. No auto-merge, no
auto-apply, no push. The interactive canvas is UI-only by design (there is no CLI
equivalent for the graph); the underlying operations are plain git, so the CLI
[merge advisor](/docs/getting-started/merging) and `vibe integrate` remain the
terminal path for the per-run flow.

Merging from the dashboard requires `VIBESTRATE_API_TOKEN` to be set: a tokenless
local API is reachable by any process on your machine, so the write actions stay
behind a bearer token.
