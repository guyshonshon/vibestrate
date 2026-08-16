---
title: Installation
description: Install Vibestrate and check your environment in two commands.
slug: getting-started/installation
---

Vibestrate needs **Node.js 24 or newer** and a git repository. Install the package globally, then run `vibe init` inside your project and `vibe doctor` to check the environment. It runs natively on macOS, Linux, and Windows. The one Windows-only exception is the in-app terminal tab - see [Native Windows support](/docs/getting-started/windows).

## Requirements

- **Node.js 24 or newer.** Check with `node --version`.
- **git 2.5 or newer.** Vibestrate creates and tears down worktrees, which need a modern git.
- **npm or pnpm**, to install the package.
- **At least one coding-agent CLI** on your PATH: Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, or another supported provider. You can add one later, and `vibe doctor` tells you what is missing.

## Install

```bash
npm install -g vibestrate
# or
pnpm add -g vibestrate
```

The `-g` matters. Vibestrate is a command-line tool, not a library: a plain `npm install vibestrate` adds it as a dependency of whatever project you are standing in and never puts `vibe` on your PATH.

On macOS or Linux there is an install script that does the same global install. It is plain text you can read before running it:

```bash
url=https://raw.githubusercontent.com/guyshonshon
curl -fsSL $url/vibestrate/main/install.sh | sh
```

To pin a version, or to check which one you have:

```bash
npm view vibestrate versions     # what is published
npm install -g vibestrate@<version>
vibe --version
```

## Initialize a project

From the root of any git repository:

```bash
vibe init
vibe doctor
```

`vibe init` creates a `.vibestrate/` directory and changes nothing else in your repo. `vibe doctor` then checks what a run needs: git state, project config, available providers, validation commands, and permissions. Anything red comes with the fix.

## What got created

```text
.vibestrate/
  project.yml  providers, profiles, crews
               (roles), commands, policies
  rules.md     project instructions agents
               read on every turn
  rules/       optional extra instruction
               files, composed onto rules.md
  roles/       one JSON role file per role,
               holding its instructions
  skills/      markdown attachments that add
               domain context
  flows/       your project's run Flows
               (empty until you add one)
  runs/        run state, artifacts, metrics,
               events
```

<svg viewBox="0 0 560 104" width="100%" style="max-width:560px;height:auto" role="img" aria-label="vibe init writes project.yml, rules.md, rules/, roles/, skills/ and flows/ inside .vibestrate/ - commit those - plus runs/, which is local run history you add to .gitignore.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="18" width="558" height="72" rx="10"/>
    <rect x="14" y="44" width="330" height="40" rx="8"/>
    <rect x="356" y="44" width="190" height="40" rx="8"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="14" y="36">.vibestrate/</text>
    <text x="179" y="61" text-anchor="middle">commit these</text>
    <text x="451" y="61" text-anchor="middle">runs/</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="179" y="77">project.yml, rules.md, rules/, roles/, skills/, flows/</text>
    <text x="451" y="77">local history - gitignore it</text>
  </g>
</svg>

Add `runs/` to your `.gitignore` yourself - `vibe init` does not edit the file:

```text
.vibestrate/runs/
```

## Next

[Run your first task →](/docs/getting-started/first-run)
