---
title: The guided walkthrough
description: A resumable, skippable tour through providers, crew, flows, and your first run.
section: getting-started
slug: getting-started/welcome
---

If you'd rather be walked through the basics than read about them, run:

```bash
vibe welcome
```

It's a guided tour through the same setup you'd otherwise do by hand: pick a provider, pick a crew, get a feel for flows, then see how to start your first run. Nothing here does anything new - it's a thin sequencer over `vibe provider setup`, crew presets, and the same commands documented elsewhere in these pages. Read the concept pages if you want the full picture; `vibe welcome` is the fast, guided version.

## What it walks through

<div class="docs-flow">
<div><b>Providers</b><span>Pick the AI model behind the work - reuses `vibe provider setup`.</span></div>
<div><b>Crew</b><span>Optionally install a ready-made crew (fast / thorough) or skip and configure your own later.</span></div>
<div><b>Flows</b><span>See the flow Vibestrate runs by default, and how to browse more from the flows hub.</span></div>
<div><b>Your first run</b><span>A worked example of `vibe run "..."` to try next.</span></div>
</div>

Each step opens with a short explanation, then asks: continue, skip, or quit. Nothing is forced - skip anything you already know.

## It remembers where you left off

Quit partway through and `vibe welcome` picks up at the first step you haven't finished next time. Progress is saved to `.vibestrate/welcome-state.json` - a small, disposable file that only tracks which steps you've been through. Deleting it, or running `--reset`, never touches your actual provider, crew, or flow configuration - those changes (if you made any while walking through providers or crew) live in `project.yml` as usual, and stay put.

To start over from the beginning:

```bash
vibe welcome --reset
```

## If you're not initialized yet

`vibe welcome` offers to run `vibe init` first if the project hasn't been set up. It also needs an interactive terminal - in a script or CI, it prints the equivalent commands and exits without changing anything.

## Where to go from here

Once you've been through it (or skipped straight past it), there are three ways to work with Vibestrate day to day:

<div class="docs-flow">
<div><b>CLI</b><span><code>vibe run "your task"</code> - the direct route.</span></div>
<div><b>TUI shell</b><span><code>vibe</code> - an interactive terminal shell for the same commands.</span></div>
<div><b>Dashboard</b><span><code>vibe ui</code> - a local web view of runs, crew, and flows.</span></div>
</div>
