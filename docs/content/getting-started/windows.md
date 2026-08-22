---
title: Native Windows support
description: The core loop - install, providers, runs, diffs and merge - runs natively on Windows in PowerShell or cmd, with no WSL. The in-app terminal tab and Docker isolation are the exceptions.
slug: getting-started/windows
---

Vibestrate runs natively on Windows, with no WSL. In PowerShell or cmd you can install the CLI, set up your providers, run tasks, review the diffs and merge, the same as on any other machine.

The in-app terminal tab is one thing you don't get. It needs a POSIX shell, so on native Windows Vibestrate turns it off and points you here. If you want a shell inside the app, run Vibestrate under WSL instead. Everything else works as it does everywhere.

```powershell
npm install -g vibestrate
vibe --version
```

From there nothing changes. Run `vibe init` in a git repository, `vibe doctor` to check your environment, then `vibe run` to start a task. The [Installation](/docs/getting-started/installation) and [Your first run](/docs/getting-started/first-run) pages apply as written, Node 24 included.

## Providers on Windows

Claude Code, Codex and Gemini all run natively on Windows once you've installed their CLIs with npm. Vibestrate calls them the same way it does on macOS and Linux.

Past those three it varies tool by tool, and some are still POSIX-only. `vibe doctor` flags any provider it can't find or run, so you know where each one stands before you start rather than halfway through a run.

<div class="docs-callout">

**"`claude` is not recognized" right after installing?** Two things cause this, and both sit on the Windows side. Either your PATH hasn't picked up the new npm global bin directory yet, so open a fresh terminal and it will, or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Fix whichever it is, confirm the provider runs on its own with `claude --version`, then run `vibe doctor` again.

</div>

## Docker isolation on Windows

The Docker execution backend is an opt-in sandbox on every platform, and you never need it to use Vibestrate. Native execution is the supported path everywhere, Windows included.

The Docker backend isn't wired up for Windows yet. It mounts the run's worktree, the separate copy of your repo, at its real host path, so the diff gate and the path guard resolve against the same paths the host uses. A Windows host path isn't a valid path inside a Linux container. Making it work needs a host-to-container path-mapping pass, which is still to come, so run natively until then. See [Container isolation](/docs/concepts/sandbox) for how the Docker backend works in general.

## Next

- [Installation](/docs/getting-started/installation) - requirements, and the same two setup commands on every platform.
- [Set up a provider](/docs/getting-started/providers) - point Vibestrate at the CLIs you have.
