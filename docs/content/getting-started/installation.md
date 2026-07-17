---
title: Installation
description: Install Vibestrate and check your environment in two commands.
section: getting-started
slug: getting-started/installation
---

Vibestrate runs natively on macOS, Linux, and Windows. The full core loop works the same on every platform; the one Windows-only exception is the in-app terminal tab. See [Native Windows support](/docs/getting-started/windows) for the details.

## Requirements

- **Node.js 18.17 or newer.** Check with `node --version`.
- **git 2.5 or newer.** Vibestrate creates and tears down worktrees, which need a modern git.
- **pnpm or npm**, to install the package.
- **At least one coding-agent CLI** on your PATH: Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, or another supported provider. You can add one later. `vibe doctor` tells you what is missing.

## Install

One line, macOS or Linux:

```bash
curl -fsSL get.vibestrate.com | sh
```

Or with npm or pnpm, on any platform including Windows:

```bash
npm install -g vibestrate
# or
pnpm add -g vibestrate
```

Pin a version through npm, for example `npm install -g vibestrate@0.7.0`. Then check it:

```bash
vibe --version
```

## Initialize a project

From the root of any git repository:

```bash
vibe init
```

This creates a `.vibestrate/` directory with your project config, agent prompt templates, and the runs folder. It touches none of your existing files.

Then run the environment check:

```bash
vibe doctor
```

Doctor checks everything needed before your first run: git state, project config, available providers, validation commands, and permissions. Anything red comes with the fix.

## What got created

```text
.vibestrate/
  project.yml      providers, profiles, crews (roles), commands, policies
  rules.md         project instructions agents read on every turn
  roles/           per-role prompt templates you can edit
  skills/          markdown attachments that add domain context
  flows/           your project's run Flows (empty until you add one)
  runs/            run state, artifacts, metrics, events
```

Commit `project.yml`, `rules.md`, `roles/`, `skills/`, and `flows/`. Leave `runs/` untracked. Vibestrate adds it to your `.gitignore` automatically.

## Next

[Run your first task →](/docs/getting-started/first-run)
