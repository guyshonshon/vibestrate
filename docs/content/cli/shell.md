---
title: Interactive shell
description: The terminal panel `vibe` opens with no arguments - a live status bar, tabbed pages, and an always-on command prompt.
section: cli
slug: cli/shell
---

Running `vibe` with no arguments opens the **interactive shell** - a terminal panel (built on Ink) that keeps the project's context in front of you and gives you a prompt to drive Vibestrate without leaving the keyboard. It runs **full-screen** in the terminal's alternate screen buffer (like `vim` or `htop`): a fixed canvas that never grows or scrolls as you type, and your previous terminal contents are restored when you quit. It needs an interactive terminal; in a pipe or CI it prints a notice and exits.

```bash
vibe
```

## Layout

The panel fills the terminal and is split into three bordered regions, top to bottom:

1. **Header** - the brand, a "where am I" line (project · branch · activity · approvals · budget), the numbered tab menu, and the current page's subtitle.
2. **Context + prompt** - the mode · crew · flow line and the command prompt; its border brightens to cyan while the prompt has focus. It sits **above** the body on purpose: when the autocomplete list opens it shrinks the body below, never the prompt, so the line you're typing on never moves.
3. **Body** - the active page on the left, and on the right a **COMMANDS** panel listing what you can do on this page (e.g. on Runs: `p` pause · `r` resume · `a` abort · `R` re-run; on Roadmap: `e` edit · `n` new · `d` delete · `Q` queue; on Queue: `s` start · `p` pause/resume · `t` cycle policy · `x` remove) plus the global keys. When a prompt command produces output, it takes that pane instead. The body clips to the fixed canvas rather than scrolling the terminal.

## The status bar

A persistent context strip sits at the top, so you always know *where you are* and *what the next run will do*:

- **project** + **branch** - the project name and current git branch. A `⑂ worktree` badge appears when you're inside a linked git worktree (e.g. a run's isolated worktree) rather than the primary checkout.
- **mode** - the safety posture the next run will use: `write` (normal) or `read-only` (investigation only - adds `--read-only`). Press **`m`** to toggle.
- **activity** - live from the snapshot: `idle`, `running · N active`, and a `· N queued` suffix when the scheduler has work waiting.
- **approvals** - a `⏳ N approvals` chip (yellow) appears only when runs are blocked waiting on you, so a decision you owe is visible from any page. Hidden when there's nothing to approve.
- **budget** - today's spend against the daily cap, e.g. `budget $2.30 / $10.00`. It tracks `budget.spendCapDailyUsd`: gray under the warn threshold, **yellow** past it, **red** once exceeded. With no cap configured it shows today's spend only (`$2.30 today`), and nothing at all when that's still `$0`. Spend is summed across all of today's runs (real cost where the CLI reports it, estimated otherwise) and refreshes a few seconds behind live.
- **crew** / **flow** - the session's selected Crew and Flow. These seed the next run you launch from the prompt. Press **`c`** to pick a Crew, **`f`** to pick a Flow (a `↑↓ / Enter` selector). They default to the project's default crew and the `default` flow until you choose.
- **task** - the task text of the most-recently-active run, when one is running.

## The prompt

The prompt sits just under the header, always visible. Press **`i`** (or `!`) to focus it, type a `vibe …` command, and **Enter** to run it - the output streams in place. **Esc** returns to navigation. **↑ / ↓** walk command history.

**Line editing.** The prompt moves like a terminal: **Option+← / Option+→** jump by word, **Ctrl+→** (or **End** / **Ctrl+E**) goes to the end of the line and **Ctrl+←** (or **Home** / **Ctrl+A**) to the start, plain **← / →** move one character, and backspace deletes before the cursor.

**Autocomplete.** As you type, a **ghost list** opens under the prompt with what fits the token at the cursor - read straight from the real CLI tree (plus your project's live ids), so it never drifts. The list lives in a fixed-height slot, so it never resizes the panel as matches narrow. A word completes **subcommands** (`config ` -> `view` / `show` / `get` / `set` / `validate`); a dash completes **flags** (`config show -` -> `--json`); and after a value-taking flag it completes **values** - enums like `--effort low|medium|high`, and live ids for `--crew`, `--flow`, `--profile`, and `--task` (also `--effort=hi` -> `--effort=high`). Id-typed positional arguments complete too (`replay ` -> your run ids; `tasks show ` -> task ids; `flows show ` -> flow ids); free-text arguments like a `run "…"` description never do. **Tab** accepts the highlighted candidate, **↑ / ↓** move the selection, **Esc** dismisses the list (and history stays on ↑ / ↓ while the prompt is empty).

**Config keys show their value + what they do.** For `config set` and `config get`, the list enumerates **every settable key from the schema** with its **current value** inline (`git.mainBranch = main`) and a one-line **description of the highlighted key** beneath the list - so you don't have to remember the keys or look up their state. The descriptions come from one source (the schema's field docs), shared with the published [config reference](/docs/cli/overview), so they never drift.

When you run a `run …` command from the prompt, the shell seeds it with your session selections - it appends `--crew`, `--flow`, and `--read-only` to match the status bar (anything you type explicitly always wins).

```text
▸ vibe config set git.▌
    › git.mainBranch             = main
      git.branchPrefix           = vibestrate/
      git.snapshotRetentionRuns  = 0
    Branch the run merges into (default main).
    ⇥ complete · ↑↓ select · esc dismiss
```

Command **output streams into a scrollable pane on the right** (~30% of the width), not the prompt - so long `--help` text or a `status` dump stays readable. It follows the tail by default; while the prompt is focused, **Tab** / **Shift+Tab** scroll it. When a command's output is **verbose** (many lines, or wide YAML / tables like `config show`), the shell automatically opens the **full-width readable view** so it isn't mangled by the narrow pane - press **`O`** or **Esc** to collapse back.

## Docs browser

Press **`d`** (or `:` → "Browse docs") to open the docs in-terminal: a topic list on the left, the selected page rendered with terminal **Markdown** (headings, code blocks, lists, inline code, links) on the right. **↑ / ↓** (or `j` / `k`) scroll the page, **Space** / **`b`** page down/up, **`[`** / **`]`** switch topic, **`o`** opens the docs website, **Esc** closes. The pages are the same ones published at the docs site, bundled with the CLI.

## Navigation

Single-key, when the prompt isn't focused:

- **`1`–`9`, `0`** - switch tabs (Dashboard, Roadmap, Queue, Runs, Approvals, Suggestions, Notifs, Crew, Skills, Doctor).
- **`:`** - command palette (fuzzy search every action).
- **`Esc`** - back to the previous page.
- **`d`** - open the in-terminal docs browser.
- **`B`** - open Mission Control (the web dashboard) in your browser.
- **`?`** - context-sensitive help. **`q`** - quit.

The pages mirror the same data the [Mission Control](/docs/cli/dashboard) web dashboard shows, read live from `.vibestrate/`. The shell spawns no shell commands itself - the prompt runs the `vibe` binary argv-only (no shell expansion), and it never reads secret-shaped files.
