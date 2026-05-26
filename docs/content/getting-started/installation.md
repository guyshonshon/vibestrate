---
title: Installation
description: Install Amaco from npm and verify your environment.
section: getting-started
slug: getting-started/installation
---

Amaco runs on macOS and Linux. Windows is not currently supported.

## Requirements

- **Node.js 18.17 or newer.** Check with `node --version`.
- **git 2.5+.** Amaco creates and tears down worktrees, which need a modern git.
- **pnpm or npm.** Either is fine for installing the package.
- **At least one local coding-agent CLI** on your PATH (Claude Code, Codex, Aider, Ollama, or OpenCode). You can install one later — `amaco doctor` will tell you what's missing.

## Install globally

```bash
npm install -g amaco-os
```

Or with pnpm:

```bash
pnpm add -g amaco
```

Verify:

```bash
amaco --version
```

## Initialize a project

From the root of any git repository:

```bash
amaco init
```

This creates a `.amaco/` directory containing the project configuration, agent prompt templates, and the runs folder. It does not modify any of your existing files.

After init, run the environment check:

```bash
amaco doctor
```

Doctor walks through everything that needs to be ready before your first run — git state, project config, available providers, validation commands, permissions. Anything red, it tells you how to fix.

## What got created

```text
.amaco/
  project.yml      providers, agents, commands, policies
  rules.md         project instructions agents read on every turn
  agents/          per-role prompt templates you can edit
  skills/          markdown attachments to add domain context
  guides/          your project's run Guides (empty until you add one)
  runs/            run state, artifacts, metrics, events
```

You can commit `.amaco/project.yml`, `.amaco/rules.md`, `.amaco/agents/`, `.amaco/skills/`, and `.amaco/guides/`. The `runs/` directory holds per-run artifacts and is best left untracked — Amaco adds it to your `.gitignore` automatically.

## Next

[Run your first task →](/docs/getting-started/first-run)
