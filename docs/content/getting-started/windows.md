---
title: Native Windows support
description: Vibestrate runs the full core loop natively on Windows - install, providers, runs, diffs, and merge - with PowerShell or cmd and no WSL. The one exception is the in-app terminal tab.
slug: getting-started/windows
---

Vibestrate runs natively on Windows, with no WSL. The full core loop works on a plain Windows machine in PowerShell or cmd: install the CLI, configure providers, run tasks, review diffs, and merge. Exactly one feature is excluded - the in-app terminal tab is built on a POSIX shell, so on native Windows it is turned off with a note pointing here. Run Vibestrate under WSL if you want an in-app shell. Everything else, including every part of the core loop, works natively.

```powershell
npm install -g vibestrate
vibe --version
```

From there the workflow is identical to every other platform. Run `vibe init` in a git repository, then `vibe doctor` to check your environment, then `vibe run` to start a task. The [Installation](/docs/getting-started/installation) and [Your first run](/docs/getting-started/first-run) pages apply as written, Node 24 requirement included.

## Providers on Windows

Claude Code, Codex, and Gemini all run natively on Windows once their CLIs are installed with npm. Vibestrate runs their provider commands the same way it does on macOS and Linux.

The longer list of providers varies tool by tool - some are still POSIX-only. `vibe doctor` flags any provider it cannot find or run, so you know where each one stands rather than discovering it mid-run.

<div class="docs-callout">

**"`claude` is not recognized" right after installing?** This is almost always Windows, not Vibestrate. Either the new npm global bin directory is not on your PATH yet (open a fresh terminal so the updated PATH loads), or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Fix the PATH or the execution policy, confirm the provider runs on its own (`claude --version`), then run `vibe doctor` again.

</div>

## Docker isolation on Windows

The Docker execution backend is an opt-in isolation sandbox on every platform, and is never required to run Vibestrate. Native execution is the supported path everywhere, Windows included.

Docker isolation on Windows is not wired up yet. The backend mounts the run's worktree at its real host path, so the diff gate and the path guard still resolve against the same paths the host uses - and a Windows host path is not a valid Linux container path. Making it work needs a host-to-container path-mapping pass, which is future work. Until then, run natively. See [Container isolation](/docs/concepts/sandbox) for how the Docker backend works in general.

## Next

- [Installation](/docs/getting-started/installation) - requirements and the same two setup commands on every platform.
- [Set up a provider](/docs/getting-started/providers) - point Vibestrate at the CLIs you have.
