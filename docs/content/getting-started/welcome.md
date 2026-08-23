---
title: The guided walkthrough
description: A four-step tour of providers, crew, flows and your first run that you can skip or quit and pick up later.
slug: getting-started/welcome
---

## In simple words

`vibe welcome` walks you through setup in four steps: a [[provider]], a [[crew]], your [[flow]]s, then your first [[run]].

```bash
vibe welcome
```

Quit halfway and it picks up where you stopped. Skip any step. `--reset` starts over.

<div class="docs-callout tip">

**Tip.** It asks questions, so it needs a real terminal. In a script or in CI it prints the commands to run by hand and exits without touching anything, rather than hanging on a prompt nobody will answer.

</div>

## What each step settles

<div class="docs-cards">

**Providers**
Which coding-agent CLIs you already have, and which are logged in.

**Crew**
The six workers, and which model each one runs on.

**Flows**
Which recipes this project can run, and which is the default.

**First run**
A real task, start to finish, so the vocabulary lands.

</div>

<div class="docs-callout">

**Did you know?** The tour is resumable because it writes as it goes rather than at the end. Quitting after step two leaves you with a working provider and crew, not a half-written config that has to be started again.

</div>


## Going deeper

### The four steps

- **Providers** - the coding CLI that runs the model doing the work, such as Claude Code or Ollama. This step runs `vibe provider setup` for you.
- **Crew** - your team of AI workers. Install a ready-made one (Fast, Thorough, Cheap, or Local), or skip and build your own later.
- **Flows** - a flow is the ordered list of steps a run works through. You'll see how to list the flows you already have, and how to install more from the flows hub, a shared collection you can browse.
- **Your first run** - a small task to try next.

Each step opens with a short explanation, then asks whether to continue, skip, or quit. Skip anything you already know.

### It remembers where you left off

Quit partway through and `vibe welcome` picks up at the first step you haven't finished.

<svg viewBox="0 0 560 70" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The tour has four steps - providers, crew, flows, and your first run. Quit after the first two and it picks up at flows.">
  <g fill="currentColor" fill-opacity="0.07">
    <rect x="2" y="8" width="127" height="34" rx="8"/>
    <rect x="145" y="8" width="127" height="34" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="2" y="8" width="127" height="34" rx="8"/>
    <rect x="145" y="8" width="127" height="34" rx="8"/>
    <rect x="288" y="8" width="127" height="34" rx="8"/>
    <rect x="431" y="8" width="127" height="34" rx="8"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="66" y="30">providers</text>
    <text x="208" y="30">crew</text>
    <text x="352" y="30">flows</text>
    <text x="494" y="30">first run</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="66" y="60">done</text>
    <text x="208" y="60">done</text>
    <text x="352" y="60">picks up here</text>
  </g>
</svg>

Your progress lives in `.vibestrate/welcome-state.json`, a small file that records which steps you've been through and nothing else. Delete it, or run `--reset`, and your providers, crew, and flows stay as they are. Those settings live in `project.yml`.

```bash
vibe welcome --reset
```

### If you're not initialized yet

The tour offers to run `vibe init` for you when the project isn't set up yet. Say no and the tour stops there, leaving you two commands to run yourself:

```bash
vibe init
vibe welcome
```

### From here

The last step hands you a real task to try:

```bash
vibe run "Add structured logging to the \
settings save handler"
```

After that, you have three ways to work with Vibestrate day to day:

<div class="docs-flow">

<div><b>CLI</b><span><code>vibe run "your task"</code> - the direct route.</span></div>
<div><b>TUI shell</b><span><code>vibe</code> - an interactive terminal shell for the same commands.</span></div>
<div><b>Dashboard</b><span><code>vibe ui</code> - a local web view of runs, crew, and flows.</span></div>

</div>
