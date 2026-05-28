---
title: Installation
description: Install Vibestrate from npm and verify your environment.
section: getting-started
slug: getting-started/installation
---

Vibestrate runs on macOS and Linux. Windows is not currently supported.

## Requirements

- **Node.js 18.17 or newer.** Check with `node --version`.
- **git 2.5+.** Vibestrate creates and tears down worktrees, which need a modern git.
- **pnpm or npm.** Either is fine for installing the package.
- **At least one local coding-agent CLI** on your PATH (Claude Code, Codex, Aider, Ollama, or OpenCode). You can install one later — `vibe doctor` will tell you what's missing.

## Install globally

One-liner (macOS / Linux) — installs the `vibe` CLI via the `vibestrate` npm package under the hood:

```bash
curl -fsSL https://raw.githubusercontent.com/guyshonshon/vibestrate/main/install.sh | sh
```

Pin a version with `VIBESTRATE_VERSION=0.1.1 sh` after the pipe. Or install with npm / pnpm directly:

```bash
npm install -g vibestrate
# or
pnpm add -g vibestrate
```

Verify:

```bash
vibe --version
```

## Initialize a project

From the root of any git repository:

```bash
vibe init
```

This creates a `.vibestrate/` directory containing the project configuration, agent prompt templates, and the runs folder. It does not modify any of your existing files.

After init, run the environment check:

```bash
vibe doctor
```

Doctor walks through everything that needs to be ready before your first run — git state, project config, available providers, validation commands, permissions. Anything red, it tells you how to fix.

## What got created

```text
.vibestrate/
  project.yml      providers, agents, commands, policies
  rules.md         project instructions agents read on every turn
  agents/          per-role prompt templates you can edit
  skills/          markdown attachments to add domain context
  flows/          your project's run Flows (empty until you add one)
  runs/            run state, artifacts, metrics, events
```

You can commit `.vibestrate/project.yml`, `.vibestrate/rules.md`, `.vibestrate/agents/`, `.vibestrate/skills/`, and `.vibestrate/flows/`. The `runs/` directory holds per-run artifacts and is best left untracked — Vibestrate adds it to your `.gitignore` automatically.

## Next

[Run your first task →](/docs/getting-started/first-run)
