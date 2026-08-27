---
title: Interactive shell
description: The terminal panel vibe opens with no arguments, with a live status bar, tabbed pages, and an always-on command prompt.
slug: cli/shell
---

## In simple words

The interactive shell is Vibestrate's second surface. [Mission Control](/docs/cli/dashboard) is the primary one; the shell is the terminal-native version of the same screens.

```bash
vibe            # with no arguments
vibe shell      # the same thing, named
```

It reads the same `.vibestrate/` the dashboard does, so the two are always looking at one project.

<div class="docs-callout tip">

**Tip.** The shell is for a working session, not a one-off. To start a single run, `vibe run "..."` is fewer keystrokes and exits when done.

</div>

## What it shows

<div class="docs-cards">

**The project and its status**
Which project, which crew, what is running.

**A live view of the current run**
Steps ticking over without you asking.

**A prompt**
Every `vibe` command, without the `vibe` prefix.

**Your history**
The session remembers what you ran.

</div>

<div class="docs-callout">

**Did you know?** The prompt never goes through a shell. It spawns the `vibe` binary argv-only, so nothing you type is glob-expanded or substituted, and the shell reads no secret-shaped file.

</div>

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

1. **Header.** The brand, a "where am I" line, the numbered tab menu, and the current page's subtitle.

2. **Context and prompt.** The mode · crew · flow line and the command prompt. The border brightens to cyan while the prompt has focus. It sits above the body on purpose: the autocomplete list shrinks the body, never the prompt, so the line you are typing on never moves.

3. **Body.** The active page on the left, the **COMMANDS** panel on the right, plus the global keys. Command output takes that pane instead. The body clips to the fixed canvas rather than scrolling the terminal.

## Filling the window

The shell draws **inline**: it renders where your cursor is and leaves what was above it alone, so your scrollback survives and the last frame is still readable after you quit. On a large window that means a compact app with unused terminal below it.

`vibe shell --full-screen` draws in the terminal's alternate buffer instead, filling the window the way `less` or `vim` do, and restores your screen on the way out.

<div class="docs-callout warn">

**Off by default, and why.** Full-screen has to redraw correctly when you resize, and that is a property of *your* terminal rather than of Vibestrate - VSCode's integrated terminal misbehaved when this was tried. Turning it on by default would trade a cosmetic complaint for a broken shell in an editor a lot of people work in. Try the flag; if resizing behaves, use it.

</div>

Whatever happens, the terminal is handed back. The restore is armed on a normal exit, on a crash, and on Ctrl+C or a kill signal, because a shell that exits still in the alternate buffer has hidden your scrollback - worse than any layout it was fixing.

## The pages

Ten pages carry a number key, in this order:

```text
1 Dashboard   4 Profiles   7 Suggestions   0 Doctor
2 Flow        5 Runs       8 Skills
3 Crew        6 Approvals  9 Roadmap
```

Three more - **Notifs**, **Config** and **Consult** - have no number key and open from the `:` palette.

Each mirrors a dashboard surface, read live from `.vibestrate/`:

- **Dashboard** is the live overview: active runs, queue depth, the attention inbox, recent activity.
- **Runs** puts the scheduler queue strip - what is queued, what is running - above every run, active and finished. The strip is read-only; drive the queue from the `:` palette or `vibe queue`.
- **Roadmap** is the kanban backlog, where work begins: `n` for a new task, `Enter` or `r` to run one, `Q` to enqueue it.
- **Flow** forks a builtin into your project (`f`), sets the project default (`Enter`), or installs one from the hub (`h`).
- **Profiles** cycles a profile's model and effort in place (`m`/`M`, `e`/`E`).
- **Approvals** and **Suggestions** are the two inboxes: `a` approves, `r` rejects.
- **Doctor** re-runs the diagnostics (`r`) and applies the safe fixes (`f`).

The COMMANDS panel changes with the page:

```text
Runs      p pause · r resume · a abort · R re-run
Roadmap   e edit · n new · d delete · Q queue
```

## Navigation

Single-key, and active when the prompt is not focused.

```text
1-9 / 0   switch pages
:         the command palette
Esc       back to the previous page
d         the in-terminal docs browser
b / B     Mission Control in your browser
m         toggle write / read-only mode
c / f     pick the session's crew / flow
?         context-sensitive help
q         quit
```

The command palette fuzzy-searches every action.

## The status bar

A context strip sits at the top at all times: where you are, and what the next run will do.

- **project** and **branch.** A `⑂ worktree` badge appears inside a linked git worktree rather than the primary checkout.
- **mode.** The posture the next run will use: `write`, or `read-only`, which adds `--read-only`. Press **m**.
- **activity.** `idle`, `running · N active`, with a `· N queued` suffix when the scheduler has work waiting.
- **approvals.** A yellow `⏳ N approvals` chip, only when runs are blocked on you, so a decision you owe is visible from any page.
- **budget.** Today's spend against `budget.spendCapDailyUsd`: grey under the warn threshold, yellow past it, red once exceeded. With no cap, today's spend alone, and nothing while that is `$0`. Real cost where the CLI reports it, estimated otherwise, a few seconds behind live.
- **crew** and **flow.** The session's selections, seeding the next run you launch from the prompt. Until you pick, the run falls back to the project's `defaultCrew` and `defaultFlow`; `defaultFlow` is unset by default, so the orchestrator chooses per task.
- **task.** The task text of the most-recently-active run.

## The prompt

Press **`i`** (or `!`) to focus it, type a `vibe …` command, press **Enter**. Output streams in place. **Esc** returns to navigation, **↑ / ↓** walk command history.

The line moves like a terminal: **Option+←/→** by word, **Ctrl+→** / **End** / **Ctrl+E** to the end, **Ctrl+←** / **Home** / **Ctrl+A** to the start.

A `run …` command from the prompt is seeded with your session selections - `--crew`, `--flow`, `--read-only` - to match the status bar. Anything you type explicitly wins.

## Autocomplete

A ghost list opens under the prompt with what fits the token at the cursor, read from the real CLI tree plus your project's live ids, so it cannot drift. It sits in a fixed-height slot and never resizes the panel.

A word completes **subcommands**, a dash **flags**, a value-taking flag its **values**, an id-typed argument **live ids** from your project:

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

Free-text arguments, like a `run "…"` description, never complete.

**Tab** accepts the highlighted candidate, **↑ / ↓** move the selection, **Esc** dismisses the list. History stays on ↑ / ↓ while the prompt is empty.

For `config set` and `config get` the list enumerates every settable key from the schema, with its current value inline and a one-line description of the highlighted key beneath, taken from the schema's own field docs - the source the published [config reference](/docs/reference/config) uses.

```text
▸ vibe config set git.▌
    › git.mainBranch             = main
      git.branchPrefix           = vibestrate/
      git.snapshotRetentionRuns  = 0
    Name of the main/trunk branch (default main).
    ⇥ complete · ↑↓ select · esc dismiss
```

Output streams into a scrollable pane on the right, not the prompt, so a long `--help` or `status` dump stays readable. The pane follows the tail; while the prompt is focused, **Tab** / **Shift+Tab** scroll it. It is narrow and truncates, so output past 16 lines or 64 columns opens the full-width view automatically. **`O`** toggles it yourself, **Esc** collapses back.

## Docs browser

Press **`d`** (or `:` → "Browse docs") for the docs in-terminal: a topic list on the left, the selected page in terminal Markdown on the right. These are the same pages published on the docs site, bundled with the CLI.

```text
↑ / ↓  or  j / k   scroll the page
Space / b          page down / up
[ / ]              switch topic
o                  open the docs website
Esc                close
```
