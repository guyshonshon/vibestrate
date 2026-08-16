---
title: The guided walkthrough
description: A resumable, skippable tour through providers, crew, flows, and your first run.
slug: getting-started/welcome
---

`vibe welcome` walks you through setup in four steps - providers, crew, flows, your first run - and remembers where you stopped, so you can quit and pick it up later. Every step is skippable, and `--reset` starts the tour over. It needs an interactive terminal: in a script or CI it prints the equivalent commands and exits without changing anything.

```bash
vibe welcome
```

It is the guided version of the setup you would otherwise do by hand. Nothing here does anything new - it's a thin sequencer over `vibe provider setup`, the crew presets, and the same commands documented elsewhere in these pages.

## What it walks through

- **Providers** - pick the coding CLI behind the work; reuses `vibe provider setup`.
- **Crew** - optionally install a ready-made crew (Fast, Thorough, Cheap, or Local), or skip and build your own later.
- **Flows** - how to list the flows you already have, and how to install more from the flows hub.
- **Your first run** - a worked task to try next.

Each step opens with a short explanation, then asks: continue, skip, or quit. Nothing is forced - skip anything you already know.

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

Progress is saved to `.vibestrate/welcome-state.json` - a small, disposable file that only tracks which steps you've been through. Deleting it, or running `--reset`, never touches your provider, crew, or flow configuration. Those changes live in `project.yml` as usual, and stay put.

```bash
vibe welcome --reset
```

## If you're not initialized yet

The tour offers to run `vibe init` for you when the project has not been set up. Decline it and the tour stops, leaving you the two commands to run yourself:

```bash
vibe init
vibe welcome
```

## Where to go from here

The last step hands you a real task to try:

```bash
vibe run "Add structured logging to the \
settings save handler"
```

From there, three ways to work with Vibestrate day to day:

<div class="docs-flow">

<div><b>CLI</b><span><code>vibe run "your task"</code> - the direct route.</span></div>
<div><b>TUI shell</b><span><code>vibe</code> - an interactive terminal shell for the same commands.</span></div>
<div><b>Dashboard</b><span><code>vibe ui</code> - a local web view of runs, crew, and flows.</span></div>

</div>
