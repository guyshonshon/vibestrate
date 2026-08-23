---
title: Worktree
description: Every run works in a separate copy of your project, so your real files are never touched.
slug: concepts/worktree
---

## In simple words

Every [[run]] does its work in a **separate copy** of your project, on its own branch. Your real files, the ones you have open in your editor, are never touched.

Open a finished run and the Workspace panel names that copy:

![The Workspace panel of a run. It names the branch, shows the run's isolated git worktree path, and offers a Copy cd button. A line below reads: the run's isolated git worktree, run vibe path for the same from the CLI.](/media/docs/scoped/run-workspace.png)

**Copy cd** puts a `cd` command for it on your clipboard, so you can go and look at the work yourself.

That copy is a git **worktree**. Git can keep a second working folder of the same project, on its own branch, right next to your main one. Picture a contractor building your new kitchen in a workshop down the street: same blueprints, and the mess stays out of your house until you choose to bring the finished work home.

<div class="docs-callout tip">

**Tip.** Because the run works in its own folder on its own branch, you can keep coding in your real project while it runs. The two never collide, and git does not even notice the overlap.

</div>

## What this buys you

<div class="docs-cards">

**Nothing to undo**
A run you dislike is a folder you ignore. It never entered your branch, so there is nothing to revert.

**Failures keep their evidence**
A run that ends blocked, failed or aborted leaves its copy on disk. Open it, read the half-finished work, take anything useful.

**You can work in parallel**
Your editor stays on your branch while agents work on theirs.

**Writes are fenced**
Vibestrate refuses to write outside that folder, to secret-like files such as `.env` or `*.pem`, or any patch adding something shaped like a leaked token.

</div>

<div class="docs-callout warn">

**One honest exception.** `node_modules`, `.venv` and `venv` are symlinked in from your project so your tests can actually run in the copy. An agent with write permission can write back through those links into your installed dependencies. It never reaches your tracked source, and `git.linkEnvironment: off` turns the links off.

</div>

<svg viewBox="0 0 560 128" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The run's copy holds the agents' edits and one commit per stage. Only node_modules and .venv are symlinked through to your project, and an agent can write back along those links. A write anywhere else is refused.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="8" width="250" height="100" rx="8"/>
    <rect x="17" y="60" width="170" height="32" rx="6"/>
    <rect x="429" y="8" width="130" height="100" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M187 76 h242"/>
    <path d="M424 71 l5 5 l-5 5"/><path d="M192 71 l-5 5 l5 5"/>
  </g>
  <g fill="currentColor" font-size="12">
    <text x="17" y="30">the run's copy</text>
    <text x="494" y="34" text-anchor="middle">your project</text>
  </g>
  <text x="102" y="80" fill="currentColor" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">node_modules, .venv</text>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="17" y="48">agent edits, one commit per stage</text>
    <text x="340" y="68" text-anchor="middle">symlinked - writes reach back</text>
    <text x="126" y="122" text-anchor="middle">a write anywhere else is refused</text>
  </g>
</svg>

<div class="docs-callout">

**Did you know?** A terminal you open against a run from the dashboard starts inside the copy, and it refuses to open a session at your project root. The isolation is not just where files are written; it is where you land too.

</div>

## Going deeper

### Where the copies live

Three settings in `project.yml` control this. Keep `worktreeDir` outside your project, never inside it, or the copies will shadow your real files:

```yaml
git:
  worktreeDir: ../.vibestrate-worktrees   # default
  branchPrefix: vibestrate/               # default
  linkEnvironment: auto                   # default
```

The dashboard's project page shows the resolved directory, so you can check where copies land.

Run ids look like `bold-lovelace` and `quiet-turing`, so two runs at once give you two folders under `../.vibestrate-worktrees/`, one named for each.

Run records stay under your project root, in the `.vibestrate/runs/` folder named after the run id. They are never written inside the copy.

### Bringing your tools along

A fresh copy starts with only the files git tracks. That leaves out installed folders like `node_modules` or a Python `.venv`, so your tests would fail with "command not found" before they checked anything. With `linkEnvironment: auto` (the default), Vibestrate links those gitignored folders into each copy so it behaves like the real project:

<div class="docs-chips"><span>node_modules</span><span>.venv</span><span>venv</span><span>workspace-package node_modules</span></div>

Two safety checks keep this honest. `node_modules` is linked only when the copy's lockfile is byte-identical to your project's, so a branch with different dependencies is never tested against the wrong set. And a folder is linked only if git is ignoring it, so the link can never end up committed.

Set `linkEnvironment: off` for bare copies if you'd rather skip linking. A command whose toolchain is then missing gets the status `environment`, which is separate from `failed`: nothing was checked, nothing failed, and a run is never blocked over it. The reviewer is told plainly that those commands could not run.

### After the run

- **`merge_ready`** - the branch is ready for you to merge. The copy stays on disk until you delete it.
- **`blocked` / `failed` / `aborted`** - the copy is kept so you can inspect it or pull fragments out.

Either way, **View diff** on the run page reads every line the run wrote, file by file.

### Advanced: CLI and automation

The same path and branch are reachable from the terminal, for scripts and for work over SSH. See the [CLI overview](/docs/cli/overview).

```bash
vibe path <runId>          # worktree path + branch
vibe path <runId> --cd     # only the absolute path
cd "$(vibe path <runId> --cd)"
```

To clean a copy up when you're done with it:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

One thing to avoid: don't run `git checkout main` inside a copy. Each copy is tied to its own branch, and switching branches there undoes the separation that keeps things safe.

### Going deeper

- [Run state](/docs/concepts/state) - the final statuses that tell you whether to keep a copy.
- [Task lifecycle](/docs/task-lifecycle) - when a copy is created and torn down.
