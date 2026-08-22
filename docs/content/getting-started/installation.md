---
title: Installation
description: Install Vibestrate and check your environment in two commands.
slug: getting-started/installation
---

You'll need **Node.js 24 or newer** and a git repository. Install the package globally, run `vibe init` inside your project, then `vibe doctor` to check your machine has what a run needs. It runs on macOS, Linux and Windows, no WSL required. On Windows the in-app terminal tab is off - see [Native Windows support](/docs/getting-started/windows).

## Requirements

- **Node.js 24 or newer.** Check yours with `node --version`.
- **git 2.5 or newer.** Vibestrate makes a second checkout of your repo for each run and tears it down after. Older git can't do that.
- **npm or pnpm**, to install the package.
- **At least one coding-agent CLI** on your PATH: Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, or another supported provider. You can add one later, and `vibe doctor` tells you what's missing.

## Install

```bash
npm install -g vibestrate
# or
pnpm add -g vibestrate
```

The `-g` matters. Leave it out and `npm install vibestrate` adds Vibestrate as a dependency of whatever project you're standing in, without ever putting `vibe` on your PATH.

On macOS or Linux you can use an install script instead. It does the same global install, and it's plain text you can read first:

```bash
url=https://raw.githubusercontent.com/guyshonshon
curl -fsSL $url/vibestrate/main/install.sh | sh
```

To pin a version, or to check which one you've got:

```bash
npm view vibestrate versions     # what is published
npm install -g vibestrate@<version>
vibe --version
```

## Set up your project

From the root of any git repository:

```bash
vibe init
vibe doctor
```

`vibe init` creates a `.vibestrate/` directory and touches nothing else in your repo. `vibe doctor` then checks what a run needs: git state, project config, the providers it can find, your validation commands, and permissions. Anything red comes with its fix.

## Inside `.vibestrate/`

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

Add `runs/` to your `.gitignore` yourself, since `vibe init` doesn't touch that file:

```text
.vibestrate/runs/
```

## Next

[Run your first task →](/docs/getting-started/first-run)
