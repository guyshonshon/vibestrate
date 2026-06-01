---
title: Interactive shell
description: The terminal panel `vibe` opens with no arguments — a live status bar, tabbed pages, and an always-on command prompt.
section: cli
slug: cli/shell
---

Running `vibe` with no arguments opens the **interactive shell** — a terminal panel (built on Ink) that keeps the project's context in front of you and gives you a prompt to drive Vibestrate without leaving the keyboard. It needs an interactive terminal; in a pipe or CI it prints a notice and exits.

```bash
vibe
```

## Layout

The panel is split into three bordered regions:

1. **Header** — the brand, a "where am I" line (project · branch · activity), the numbered tab menu, and the current page's subtitle.
2. **Body** — the active page. The Dashboard shows two columns separated by a divider: an **interactive** side (active runs) and an **informative** side (recent activity).
3. **Context + prompt** — the mode · crew · flow line and the command prompt; its border brightens to cyan while the prompt has focus.

## The status bar

A persistent context strip sits at the top, so you always know *where you are* and *what the next run will do*:

- **project** + **branch** — the project name and current git branch. A `⑂ worktree` badge appears when you're inside a linked git worktree (e.g. a run's isolated worktree) rather than the primary checkout.
- **mode** — the safety posture the next run will use: `write` (normal) or `read-only` (investigation only — adds `--read-only`). Press **`m`** to toggle.
- **activity** — live from the snapshot: `idle`, `running · N active`, and a `· N queued` suffix when the scheduler has work waiting.
- **crew** / **flow** — the session's selected Crew and Flow. These seed the next run you launch from the prompt. Press **`c`** to pick a Crew, **`f`** to pick a Flow (a `↑↓ / Enter` selector). They default to the project's default crew and the `default` flow until you choose.
- **task** — the task text of the most-recently-active run, when one is running.

## The prompt

The bottom line is an always-visible prompt. Press **`i`** (or `!`) to focus it, type a `vibe …` command, and **Enter** to run it — the output streams in place. **Esc** returns to navigation. **↑ / ↓** walk command history.

When you run a `run …` command from the prompt, the shell seeds it with your session selections — it appends `--crew`, `--flow`, and `--read-only` to match the status bar (anything you type explicitly always wins).

```text
▸ vibe run "add dark mode"
        → launches with the selected crew + flow + mode
```

Command **output streams into a scrollable pane on the right** (~30% of the width), not the prompt — so long `--help` text or a `status` dump stays readable. **PgUp / PgDn** scroll it; it follows the tail by default.

## Docs browser

Press **`d`** (or `:` → "Browse docs") to open the docs in-terminal: a topic list on the left, the selected page rendered with terminal **Markdown** (headings, code blocks, lists, inline code, links) on the right. **↑ / ↓** pick a topic, **PgUp / PgDn** scroll the page, **`o`** opens the docs website, **Esc** closes. The pages are the same ones published at the docs site, bundled with the CLI.

## Navigation

Single-key, when the prompt isn't focused:

- **`1`–`9`, `0`** — switch tabs (Dashboard, Roadmap, Queue, Runs, Approvals, Suggestions, Notifs, Crew, Skills, Doctor).
- **`:`** — command palette (fuzzy search every action).
- **`Esc`** — back to the previous page.
- **`d`** — open the in-terminal docs browser.
- **`B`** — open Mission Control (the web dashboard) in your browser.
- **`?`** — context-sensitive help. **`q`** — quit.

The pages mirror the same data the [Mission Control](/docs/cli/dashboard) web dashboard shows, read live from `.vibestrate/`. The shell spawns no shell commands itself — the prompt runs the `vibe` binary argv-only (no shell expansion), and it never reads secret-shaped files.
