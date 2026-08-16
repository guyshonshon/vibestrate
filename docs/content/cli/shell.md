---
title: Interactive shell
description: The terminal panel vibe opens with no arguments, with a live status bar, tabbed pages, and an always-on command prompt.
slug: cli/shell
---

Running `vibe` with no arguments opens the interactive shell: a terminal panel that keeps the project's context in front of you and gives you a prompt to drive Vibestrate without leaving the keyboard.

Press **i** to focus the prompt and run any `vibe` command, **:** for the command palette, **?** for context-sensitive help, and **q** to quit. Navigation, at the end of this page, lists the rest of the keys.

```bash
vibe
```

The shell is built on Ink and runs full-screen in the terminal's alternate screen buffer, the same way `vim` or `htop` do. The canvas is fixed: it never grows or scrolls as you type, and your previous terminal contents come back when you quit.

It needs an interactive terminal. In a pipe or CI it prints a notice and exits.

The panel fills the terminal and is split into three bordered regions: a header, the context line and prompt, and a body with the active page beside a COMMANDS panel.

## Layout

<svg viewBox="0 0 560 240" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The shell fills the terminal in three stacked regions - a header with the project and status line, the context line and command prompt under it, and a body holding the active page beside a COMMANDS panel.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="558" height="232" rx="10"/>
    <rect x="13" y="13" width="534" height="52" rx="6"/>
    <rect x="13" y="73" width="534" height="52" rx="6"/>
    <rect x="13" y="133" width="386" height="88" rx="6"/>
    <rect x="407" y="133" width="140" height="88" rx="6"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="27" y="36">Header</text>
    <text x="27" y="96">Context and prompt</text>
    <text x="27" y="156">Body</text>
    <text x="421" y="156">COMMANDS</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="27" y="54">project · branch · activity · approvals · budget</text>
    <text x="27" y="114">mode · crew · flow, then the line you type on</text>
    <text x="27" y="174">the active page</text>
    <text x="421" y="174">what this page</text>
    <text x="421" y="190">can do</text>
  </g>
</svg>

1. **Header.** The brand, a "where am I" line (project · branch · activity · approvals · budget), the numbered tab menu, and the current page's subtitle.

2. **Context and prompt.** The mode · crew · flow line and the command prompt. The region's border brightens to cyan while the prompt has focus.

   It sits above the body on purpose. When the autocomplete list opens, it shrinks the body below it, never the prompt, so the line you are typing on never moves.

3. **Body.** The active page on the left, and on the right a **COMMANDS** panel listing what you can do on this page, plus the global keys. When a prompt command produces output, it takes that pane instead. The body clips to the fixed canvas rather than scrolling the terminal.

The COMMANDS panel changes with the page:

```text
Runs      p pause · r resume · a abort · R re-run
Roadmap   e edit · n new · d delete · Q queue
```

Runs also carries the scheduler queue strip at its top - what's queued, what's running, folded in from the old standalone Queue page. The strip is read-only here. Drive it from the `:` command palette or `vibe queue`.

## The status bar

A context strip sits at the top at all times, so you always know where you are and what the next run will do.

- **project** and **branch.** The project name and current git branch. A `⑂ worktree` badge appears when you are inside a linked git worktree (for example a run's isolated worktree) rather than the primary checkout.
- **mode.** The safety posture the next run will use: `write` (normal) or `read-only` (investigation only, which adds the `--read-only` flag). Press **m** to toggle.
- **activity.** Live from the snapshot: `idle`, `running · N active`, and a `· N queued` suffix when the scheduler has work waiting.
- **approvals.** A `⏳ N approvals` chip (yellow) appears only when runs are blocked waiting on you, so a decision you owe is visible from any page. It is hidden when there is nothing to approve.
- **budget.** Today's spend against the daily cap, for example `budget $2.30 / $10.00`. It tracks `budget.spendCapDailyUsd`: gray under the warn threshold, **yellow** past it, **red** once exceeded. With no cap configured it shows today's spend only (`$2.30 today`), and nothing at all when that is still `$0`. Spend is summed across all of today's runs, using real cost where the CLI reports it and estimated otherwise, and refreshes a few seconds behind live.
- **crew** and **flow.** The session's selected Crew and Flow. These seed the next run you launch from the prompt. Press **c** to pick a Crew and **f** to pick a Flow, then move with **↑ / ↓** and press **Enter**. Until you pick one, nothing is seeded: the run falls back to the project's `defaultCrew` and `defaultFlow`. `defaultFlow` is unset by default, so the orchestrator chooses a Flow per task.
- **task.** The task text of the most-recently-active run, when one is running.

## The prompt

The prompt sits just under the header, always visible. Press **`i`** (or `!`) to focus it, type a `vibe …` command, and press **Enter** to run it. The output streams in place. **Esc** returns to navigation. **↑ / ↓** walk command history.

### Line editing

The prompt moves like a terminal:

- **Option+← / Option+→** jump by word.
- **Ctrl+→** (or **End** / **Ctrl+E**) goes to the end of the line.
- **Ctrl+←** (or **Home** / **Ctrl+A**) goes to the start.
- Plain **← / →** move one character.
- Backspace deletes before the cursor.

### Autocomplete

As you type, a ghost list opens under the prompt with what fits the token at the cursor. It is read straight from the real CLI tree (plus your project's live ids), so it never drifts. The list lives in a fixed-height slot, so it never resizes the panel as matches narrow.

What it completes depends on what you have typed. A word completes **subcommands**, a dash completes **flags**, a value-taking flag completes its **values**, and an id-typed positional argument completes **live ids** from your project:

```text
config             view show get set keys validate
config show -      --json
--effort           low | medium | high
--effort=hi        --effort=high
--crew --flow      your crew and flow ids
--profile --task   your profile and task ids
replay             your run ids
tasks show         task ids
flows show         flow ids
```

Free-text arguments like a `run "…"` description never complete.

**Tab** accepts the highlighted candidate, **↑ / ↓** move the selection, **Esc** dismisses the list (and history stays on ↑ / ↓ while the prompt is empty).

**Config keys show their value and what they do.** For `config set` and `config get`, the list enumerates every settable key from the schema, with its current value inline (`git.mainBranch = main`) and a one-line description of the highlighted key beneath the list. So you do not have to remember the keys or look up their state.

Those descriptions come from one source, the schema's field docs, shared with the published [config reference](/docs/reference/config). They never drift.

When you run a `run …` command from the prompt, the shell seeds it with your session selections: it appends `--crew`, `--flow`, and `--read-only` to match the status bar. Anything you type explicitly always wins.

```text
▸ vibe config set git.▌
    › git.mainBranch             = main
      git.branchPrefix           = vibestrate/
      git.snapshotRetentionRuns  = 0
    Name of the main/trunk branch (default main).
    ⇥ complete · ↑↓ select · esc dismiss
```

Command output streams into a scrollable pane on the right, not the prompt, so long `--help` text or a `status` dump stays readable. The pane follows the tail by default. While the prompt is focused, **Tab** / **Shift+Tab** scroll it.

That pane is narrow and truncates. So when output runs past 16 lines or 64 columns - wide YAML or tables like `config show` - the shell opens the full-width view for you, which wraps and scrolls instead. Press **`O`** to toggle it yourself, or **Esc** to collapse back.

## Docs browser

Press **`d`** (or `:` → "Browse docs") to open the docs in-terminal: a topic list on the left, the selected page rendered with terminal Markdown (headings, code blocks, lists, inline code, links) on the right.

```text
↑ / ↓  or  j / k   scroll the page
Space / b          page down / up
[ / ]              switch topic
o                  open the docs website
Esc                close
```

The pages are the same ones published at the docs site, bundled with the CLI.

## Navigation

These are single-key, and work when the prompt is not focused.

```text
1-9 / 0   switch tabs
:         the command palette
Esc       back to the previous page
d         the in-terminal docs browser
B         Mission Control in your browser
?         context-sensitive help
q         quit
```

The tabs, in order, are Dashboard, Flow, Crew, Profiles, Runs, Approvals, Suggestions, Skills, Roadmap and Doctor. The command palette fuzzy-searches every action.

The pages mirror the same data the [Mission Control](/docs/cli/dashboard) web dashboard shows, read live from `.vibestrate/`.

The shell spawns no shell commands itself: the prompt runs the `vibe` binary `argv`-only (no shell expansion), and it never reads secret-shaped files.
