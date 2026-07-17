---
title: Worktree
description: Every run does its work in a separate copy of your project, so your real files are never touched.
section: concepts
slug: concepts/worktree
---

Every time Vibestrate works on a task, it does that work in a separate copy of your project. Your real files, the ones you edit yourself, are never touched.

That separate copy is a git **worktree**. Git can keep a second working folder of the same project, on its own branch, sitting right next to your main one. Picture it like a contractor building your new kitchen in a workshop down the street: same blueprints, but the mess stays out of your house until you choose to bring the finished work home.

The copy is created when the run starts, lives under `../.vibestrate-worktrees/` by default, and gets its own branch named `<git.branchPrefix><runId>` - the run id itself, no slug appended.

## Why this keeps you safe

Because the run works in its own folder on its own branch, you can keep coding in your real project at the same time. The two never collide, and git doesn't even notice the overlap.

It also means nothing is lost when a run goes wrong. If a run ends `blocked`, `failed`, or `aborted`, its copy stays on disk so you can open it, read the half-finished work, and pull out anything useful.

## Where the copies live

```text
your-project/                  ← your real files
../.vibestrate-worktrees/
  bold-lovelace/                ← one run's copy
  quiet-turing/                 ← another run's copy
```

You can move them in `project.yml`. Keep the location outside your project, never inside it, or it will shadow your real files:

```yaml
git:
  worktreeDir: ../.vibestrate-worktrees   # default
  branchPrefix: vibestrate/                # default
  linkEnvironment: auto                    # default; "off" for bare worktrees
```

## What can and can't be written

Inside the copy, Vibestrate writes file edits from the agents and one commit per stage. It refuses to write anywhere outside that folder, to known-secret files like `.env` or `*.pem`, or any patch that adds something shaped like a leaked token. Run records stay under your project root in `.vibestrate/runs/<runId>/`, never inside the copy.

## Bringing your tools along

A fresh copy starts with only the files git tracks. That leaves out installed folders like `node_modules` or a Python `.venv`, so your tests would fail with "command not found" before they checked anything. With `linkEnvironment: auto` (the default), Vibestrate links those gitignored folders (`node_modules`, `.venv`, `venv`, and workspace-package `node_modules`) into each copy so it behaves like the real project.

Two safety checks keep this honest. `node_modules` is linked only when the copy's lockfile is identical to your project's, so a branch with different dependencies is never tested against the wrong set. And a folder is linked only if git is ignoring it, so the link can never end up committed.

If you'd rather skip linking, set `linkEnvironment: off` for bare copies. When a tool is missing because nothing was linked, those commands are recorded with the status `environment`, which is separate from `failed`: nothing was checked, but nothing failed, and a run is never blocked over it. The reviewer is told plainly that those commands could not run.

## After the run

- **`merge_ready`** - the branch is ready for you to merge. The copy stays on disk until you delete it.
- **`blocked` / `failed` / `aborted`** - the copy is kept so you can inspect it or pull fragments out.

To clean one up:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

One thing to avoid: don't run `git checkout main` inside a copy. Each copy is tied to its own branch, and switching branches there undoes the separation that keeps things safe.

## Going deeper

- [Run state](/docs/concepts/state) - the final statuses that tell you whether to keep a copy.
- [Task lifecycle](/docs/task-lifecycle) - when a copy is created and torn down.
