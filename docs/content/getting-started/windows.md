---
title: Native Windows support
description: Vibestrate runs the full core loop natively on Windows - install, providers, runs, diffs, and merge - with PowerShell or cmd and no WSL. The one exception is the in-app terminal tab.
section: getting-started
slug: getting-started/windows
---

Vibestrate runs natively on Windows. The full core loop works on a plain Windows machine in PowerShell or cmd: you install the CLI, configure providers, run agent orchestrations, review diffs, and merge - all without WSL.

Install is the same as on macOS and Linux: a global npm install of the CLI.

```powershell
npm install -g vibestrate
vibe --version
```

From there the workflow is identical to every other platform. Run `vibe init` in a git repository, then `vibe doctor` to check your environment, then `vibe run` to start a task. The [Installation](/docs/getting-started/installation) and [Your first run](/docs/getting-started/first-run) pages apply as written.

## Providers on Windows

Claude Code, Codex, and Gemini all run natively on Windows once their CLIs are installed with npm. Vibestrate spawns providers through execa, which resolves the `.cmd` shims that npm writes for global packages, so the provider commands run the same way they do on macOS and Linux.

The longer list of providers varies tool by tool - some are still POSIX-only. `vibe doctor` flags any provider it cannot find or run, so you always know where each one stands rather than discovering it mid-run.

<div class="docs-callout">

**"`claude` is not recognized" right after installing?** This is almost always Windows, not Vibestrate. Either the new npm global bin directory is not on your PATH yet (open a fresh terminal so the updated PATH loads), or PowerShell's execution policy is blocking the `.cmd`/`.ps1` shim. Fix the PATH or execution policy, confirm the provider runs on its own (for example `claude --version`), then run `vibe doctor` again.

</div>

## The one carve-out: the in-app terminal tab

Everything runs natively except one feature: the in-app integrated terminal tab is not available on native Windows. It is built on a POSIX shell, so on a plain Windows machine that tab is turned off with a note pointing you here. If you want an in-app shell, run Vibestrate under WSL. This is the single, clearly-scoped exclusion - the rest of the product, including every part of the core loop, works natively.

## Docker isolation on Windows

The Docker execution backend is an opt-in isolation sandbox, exactly the role it plays on macOS and Linux. It is never required to run Vibestrate. Native execution is the supported path on every platform, Windows included.

On Windows, Docker would run Linux containers through WSL2. Docker isolation on Windows is not wired up yet: the backend mounts the run's worktree at its real host path so the diff gate and path guard line up, and a Windows host path is not a valid Linux container path. Making it work needs a host-to-container path-mapping pass, which is future work. Until then, run natively on Windows - that is the shipped, supported way to use the product. See [Container isolation](/docs/concepts/sandbox) for how the Docker backend works in general.

## Running the test suite on Windows (contributors)

A `windows-latest` GitHub Actions job runs the whole suite (typecheck, build, and test) on every push and pull request as a separate pipeline, plus on demand, so the support is verified, not aspirational. It is decoupled from the required build gate on purpose: a push is never blocked by, and the build never depends on, the slower Windows runner - the Windows pipeline just runs in parallel and reports its own status.

If you are working on Vibestrate itself and run the test suite on Windows, set git's line-ending rewrite off in the repository:

```powershell
git config core.autocrlf false
```

CRLF rewrites change file bytes on checkout, which breaks the byte-exact content assertions in the suite. This is a contributor concern only - it does not affect anyone using Vibestrate to run tasks.

## Next

- [Installation](/docs/getting-started/installation) - the same two commands on every platform.
- [Set up a provider](/docs/getting-started/providers) - point Vibestrate at the CLIs you have.
- [Container isolation](/docs/concepts/sandbox) - the opt-in Docker isolation backend.
