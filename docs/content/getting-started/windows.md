---
title: Native Windows support
description: The core loop - install, providers, runs, diffs and merge - runs natively on Windows in PowerShell or cmd, with no WSL. The in-app terminal tab and Docker isolation are the exceptions.
slug: getting-started/windows
---

## In simple words

Vibestrate runs natively on Windows, with no WSL. In PowerShell or cmd you install the CLI, set up providers, run tasks, review diffs and merge, the same as anywhere else.

```powershell
npm install -g vibestrate
cd C:\path\to\your-project
vibe init
vibe doctor --fix
```

<div class="docs-callout warn">

**One thing you do not get: the in-app terminal tab.** It needs a POSIX shell, so on native Windows Vibestrate turns it off and points you here. If you want a shell inside the app, run Vibestrate under WSL instead. Everything else works as it does everywhere.

</div>

<div class="docs-callout tip">

**Tip.** Your own terminal still works fine. The run's worktree path is on the run page with a copy button, so you can open it in PowerShell and work there directly.

</div>

## What works natively

<div class="docs-cards">

**Install and init**
`npm install -g vibestrate`, then `vibe init` in PowerShell or cmd.

**Providers**
The same detection and setup as anywhere else.

**Runs and worktrees**
Real git worktrees, real isolation, no translation layer.

**Diffs and merging**
Read the change, take it, all from the dashboard or your own terminal.

</div>

<div class="docs-callout">

**Did you know?** Native Windows support was not a port of a POSIX assumption - it is a separate execution path. That is why the terminal tab is switched off with an explanation rather than failing at the moment you click it.

</div>


## Going deeper

### Providers on Windows

Claude Code, Codex and Gemini all run natively on Windows once you've installed their CLIs with npm. Vibestrate calls them the same way it does on macOS and Linux.

Past those three it varies tool by tool, and some are still POSIX-only. `vibe doctor` flags any provider it can't find or run, so you know where each one stands before you start rather than halfway through a run.

<div class="docs-callout">

**"`claude` is not recognized" right after installing?** Two things cause this, and both sit on the Windows side. Either your PATH hasn't picked up the new npm global bin directory yet, so open a fresh terminal and it will, or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Fix whichever it is, confirm the provider runs on its own with `claude --version`, then run `vibe doctor` again.

</div>

### Docker isolation on Windows

The Docker execution backend is an opt-in sandbox on every platform, and you never need it to use Vibestrate. Native execution is the supported path everywhere, Windows included.

The Docker backend isn't wired up for Windows yet. It mounts the run's worktree, the separate copy of your repo, at its real host path, so the diff gate and the path guard resolve against the same paths the host uses. A Windows host path isn't a valid path inside a Linux container. Making it work needs a host-to-container path-mapping pass, which is still to come, so run natively until then. See [Container isolation](/docs/concepts/sandbox) for how the Docker backend works in general.

### Next

- [Installation](/docs/getting-started/installation) - requirements, and the same two setup commands on every platform.
- [Set up a provider](/docs/getting-started/providers) - point Vibestrate at the CLIs you have.
