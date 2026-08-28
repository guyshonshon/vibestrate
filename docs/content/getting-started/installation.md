---
title: Installation
description: Install Vibestrate, open the dashboard, and let the Setup page take you from an empty folder to a first run.
slug: getting-started/installation
---

## In simple words

You need **Node.js 24 or newer** and a git repository.

```bash
npm install -g vibestrate     # or: curl -fsSL get.vibestrate.com | sh
cd your-project
vibe ui
```

`vibe ui` serves the dashboard on `http://127.0.0.1:4317`, opens your browser and starts the scheduler. The rest happens in **More > Setup**: the `vibe doctor` checks as numbered steps, with **Initialise this project** and **Fix what's safe** on the page.

Works on macOS, Linux and Windows, no WSL required.

<div class="docs-callout tip">

**Tip.** Setting up writes inside `.vibestrate/` and nowhere else. Your source, package manifest and git config are untouched, so trying this in an existing project costs nothing.

</div>

## What setup writes

<div class="docs-cards">

**`project.yml`**
Providers, profiles, crews, flows and validation commands.

**`roles/`**
Six workers, each with its own instructions file.

**`rules.md`**
Guidance stacked into every agent turn.

**`policies/`**
Your own rule files, read on every run. Empty until you write one.

</div>

A codebase map is not part of this. `.vibestrate/CODEBASE.md`, the auto-derived map that starts an agent oriented, comes from `vibe learn`, which `vibe init` runs at the end of the CLI path and the dashboard's initialise skips. Run `vibe learn` once if you want it.

<div class="docs-callout">

**Did you know?** The one thing Windows does not get is the run page's in-app Terminal tab: it needs a POSIX shell. See [native Windows support](/docs/getting-started/windows).

</div>


## Requirements

- **Node.js 24 or newer.** Check yours with `node --version`.
- **git 2.5 or newer.** Each run gets a second checkout of your repo, torn down after; older git can't do that.
- **npm or pnpm**, to install the package.
- **At least one coding-agent CLI** on your PATH: Claude Code, Codex, Gemini, Aider, Ollama, OpenCode or another supported provider. The Setup page names what's missing.

## Install

```bash
npm install -g vibestrate
# or
pnpm add -g vibestrate
```

The `-g` matters. Without it, `npm install vibestrate` installs into the project you're standing in and never puts `vibe` on your PATH.

On macOS or Linux the install script does the same, in plain text you can read first:

```bash
url=https://raw.githubusercontent.com/guyshonshon
curl -fsSL $url/vibestrate/main/install.sh | sh
```

To pin or check a version:

```bash
npm view vibestrate versions     # what is published
npm install -g vibestrate@<version>
vibe --version
```

## Set up in the dashboard

`vibe ui` runs from inside a git repository - a run forks a branch. If the folder isn't a repo yet, `git init` and one commit is enough.

**More > Setup** counts **Status**, **Failures**, **Warnings** and **Checks run** across the top, then walks six numbered steps: a repository, **Initialise the project**, **Connect a model** (with a **Providers** button), **Point it at your tests** (with **Edit config**), everything else doctor checks, and **Start your first run**, which unlocks once the project is initialised and nothing is failing.

**Fix what's safe** appears when something can be repaired without a decision from you: missing directories, a missing skills README, an absent built-in role file. It fills in a provider or validation commands only where that part of the config is empty, never over what you wrote, and lists what it declined under **Skipped**.

## The same thing from a terminal

```bash
vibe init            # scaffold .vibestrate/ (--git-init to create the repo too)
vibe setup           # the wizard, as questions in the terminal
vibe doctor          # the read-only report the Setup page renders
vibe doctor --fix    # the same repair pass as Fix what's safe
vibe doctor --json   # machine-readable, for CI
```

`vibe setup` is the closest thing to the Setup page without a browser: it asks rather than reports. It offers whichever of Claude Code, Codex or Ollama it finds as the project default, offers the validation commands it detected, and can take a custom provider's command and args. It needs a git repository, and answers nothing on your behalf.

`vibe` on its own opens the interactive shell, whose Doctor page has `r` to re-run the checks and `f` to apply the safe fixes.

## Inside `.vibestrate/`

Alongside the four entries above, `rules/` takes extra instruction files composed onto `rules.md`, `skills/` takes markdown attachments that add domain context, `flows/` holds this project's Flows, and `runs/` holds run state, artifacts, metrics and events.

`policies/` is the one to watch: a rule file that fails to parse, or two claiming the same id, stops run creation outright rather than being skipped. `vibe policies doctor` names the file and the reason.

<svg font-family="var(--font-sans)" viewBox="0 0 560 104" width="100%" style="max-width:720px;height:auto" role="img" aria-label="The committed half of .vibestrate/ holds project.yml, rules.md, rules/, roles/, skills/, flows/ and policies/, beside runs/, which is local run history you add to .gitignore.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="18" width="558" height="72" rx="10"/>
    <rect fill="var(--bg-200)" x="14" y="44" width="344" height="40" rx="8"/>
    <rect fill="var(--bg-200)" x="370" y="44" width="176" height="40" rx="8"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="14" y="36">.vibestrate/</text>
    <text x="186" y="61" text-anchor="middle">commit these</text>
    <text x="458" y="61" text-anchor="middle">runs/</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11" text-anchor="middle">
    <text x="186" y="77" font-size="10">project.yml, rules.md, rules/, roles/, skills/, flows/, policies/</text>
    <text x="458" y="77">local history - gitignore it</text>
  </g>
</svg>

Add `runs/` to your `.gitignore` yourself; nothing here touches that file:

```text
.vibestrate/runs/
```

## Next

[Connect a model →](/docs/getting-started/providers) - Vibestrate spawns the coding CLIs you already have, so point it at one before you run anything.
