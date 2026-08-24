---
title: Native Windows support
description: The core loop - install, providers, runs, diffs and merge - runs natively on Windows in PowerShell or cmd, with no WSL. The run page's Terminal tab and Docker isolation are the exceptions.
slug: getting-started/windows
---

## In simple words

Vibestrate runs natively on Windows, with no WSL. In PowerShell or cmd you install the CLI, open the dashboard, set up providers, run tasks, review diffs and merge.

```powershell
npm install -g vibestrate
cd C:\path\to\your-project
vibe ui
```

The dashboard comes up on `http://127.0.0.1:4317` and **More > Setup** takes it from there.

<div class="docs-callout warn">

**One thing you do not get: the run page's Terminal tab.** It needs a POSIX shell, so on native Windows Vibestrate reports it unavailable rather than spawning a shell that isn't there. If you want a shell inside the app, run Vibestrate under WSL.

</div>

<div class="docs-callout tip">

**Tip.** Your own terminal still works fine. The run page's **Workspace** panel has a **Copy cd** button for the run's worktree path, so you can open it in PowerShell.

</div>

## What works natively

<div class="docs-cards">

**The dashboard**
`vibe ui` in PowerShell or cmd, browser and scheduler included.

**Providers**
The same detection, setup and testing as anywhere else.

**Runs and worktrees**
Real git worktrees, real isolation, no translation layer.

**Diffs and merging**
The Source page's Changes, Tree and Merge tabs, or your own terminal.

</div>

<div class="docs-callout">

**Did you know?** Native Windows support is not a port of a POSIX assumption, it is a separate execution path. That is why the Terminal tab is switched off with a reason rather than failing when you click it.

</div>


## Going deeper

### Providers on Windows

Claude Code, Codex and Gemini run natively on Windows once you've installed their CLIs with npm, and Vibestrate calls them the same way it does on macOS and Linux.

Past those three it varies tool by tool, and some are still POSIX-only. The Setup page's **Connect a model** step flags any provider it can't find or run, so you know where each stands before you start.

<div class="docs-callout">

**"`claude` is not recognized" right after installing?** Two causes, both on the Windows side: your PATH hasn't picked up the new npm global bin directory yet, which a fresh terminal fixes, or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Confirm the provider runs on its own with `claude --version`, then press **Re-check** on the Setup page.

</div>

### Docker isolation on Windows

The Docker execution backend is an opt-in sandbox on every platform; you never need it. Native execution is the supported path everywhere, Windows included.

The Docker backend isn't wired up for Windows yet. It mounts the run's worktree at its real host path, so the diff gate and the path guard resolve against the same paths the host uses, and a Windows host path isn't valid inside a Linux container. Making it work needs a host-to-container path-mapping pass, so run natively until then. See [Container isolation](/docs/concepts/sandbox) for how the Docker backend works.

### Next

- [Installation](/docs/getting-started/installation) - requirements, and the same setup path on every platform.
- [Connect a model](/docs/getting-started/providers) - point Vibestrate at the CLIs you have.
