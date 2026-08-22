---
title: The guided walkthrough
description: A four-step tour of providers, crew, flows and your first run that you can skip or quit and pick up later.
slug: getting-started/welcome
---

`vibe welcome` sets you up in four steps: providers, crew, flows, then your first run. Quit halfway and it picks up where you stopped. You can skip any step, and `--reset` starts the tour over. It asks you questions, so it needs a real terminal. In a script or in CI it prints the commands to run by hand and exits without touching anything.

```bash
vibe welcome
```

It's the guided version of the setup you'd otherwise do by hand, built on the same pieces: `vibe provider setup`, the crew presets, and the commands the rest of these pages cover.

## The four steps

- **Providers** - the coding CLI that runs the model doing the work, such as Claude Code or Ollama. This step runs `vibe provider setup` for you.
- **Crew** - your team of AI workers. Install a ready-made one (Fast, Thorough, Cheap, or Local), or skip and build your own later.
- **Flows** - a flow is the ordered list of steps a run works through. You'll see how to list the flows you already have, and how to install more from the flows hub, a shared collection you can browse.
- **Your first run** - a small task to try next.

Each step opens with a short explanation, then asks whether to continue, skip, or quit. Skip anything you already know.

## It remembers where you left off

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

## If you're not initialized yet

The tour offers to run `vibe init` for you when the project isn't set up yet. Say no and the tour stops there, leaving you two commands to run yourself:

```bash
vibe init
vibe welcome
```

## From here

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
