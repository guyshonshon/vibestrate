---
title: The guided walkthrough
description: A four-step terminal tour of providers, crew, flows and your first run that you can skip or quit and pick up later.
slug: getting-started/welcome
---

## In simple words

The dashboard's **More > Setup** page is the primary guided path: numbered steps, live check results, a **Fix what's safe** button. `vibe welcome` is the terminal-native version.

```bash
vibe welcome
```

It walks four steps: a [[provider]], a [[crew]], your [[flow]]s, then your first [[run]]. Quit halfway and it picks up where you stopped. Skip any step. `--reset` starts over.

<div class="docs-callout tip">

**Tip.** It asks questions, so it needs a real terminal. In a script or in CI it prints the commands to run by hand and exits without touching anything.

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

**Did you know?** The tour is resumable because it writes as it goes rather than at the end. Quit after step two and you have a working provider and crew, not a half-written config.

</div>


## Going deeper

### The four steps

- **Providers** - the coding CLI that runs the model, such as Claude Code or Ollama. This step runs `vibe provider setup`.
- **Crew** - your team of AI workers. Install a ready-made one (Fast, Thorough, Cheap, or Local), or build your own later on the **Crew** page.
- **Flows** - the ordered list of steps a run works through. You see the flows you have, and how to install more from the flows hub.
- **Your first run** - a small task to try next.

Each step opens with a short explanation, then asks whether to continue, skip or quit.

### It remembers where you left off

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

A step counts as done only when it succeeds, so a failed step is the one you land on next time. Progress lives in `.vibestrate/welcome-state.json`, which records which steps you've been through and nothing else. Delete it, or run `--reset`, and your providers, crew and flows stay as they are: those settings live in `project.yml`.

```bash
vibe welcome --reset
```

### If the project isn't set up yet

The tour offers to run `vibe init` for you. Say no and it stops there, leaving you two commands:

```bash
vibe init
vibe welcome
```

The dashboard does the same with the Setup page's **Initialise this project** button.

### Three ways to work

<div class="docs-flow">

<div><b>Dashboard</b><span><code>vibe ui</code> - runs, crew, flows, source and setup on 127.0.0.1:4317. The primary surface.</span></div>
<div><b>Interactive shell</b><span><code>vibe</code> - the same surfaces, terminal-native.</span></div>
<div><b>Commands</b><span><code>vibe run "your task"</code> - the automation path, for scripts and CI.</span></div>

</div>

### Next

[Keep the change →](/docs/getting-started/merging) - what to do with the branch your first run leaves behind.
