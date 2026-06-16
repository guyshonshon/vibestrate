---
title: Your first run
description: Give Vibestrate one small task and watch it go from idea to a finished, ready-to-merge change.
section: getting-started
slug: getting-started/first-run
---

This walks you through a single task from start to finish: you describe what you want, Vibestrate does the work, and it stops with a finished change waiting for your approval.

## Pick a small, well-scoped task

Vibestrate works best on the kind of task you'd hand a careful colleague: clear scope, a part of the code you can point to, and a way to tell when it's done. Don't open with "refactor the whole login system." Start with something like "add structured logging to the settings save handler."

## Start the run

```bash
vibe run "Add structured logging to the settings save handler"
```

To watch it work as it goes, add `--ui`:

```bash
vibe run "Add structured logging to the settings save handler" --ui
```

From here, Vibestrate does the rest on its own:

<div class="docs-flow">
<div><b>Look</b><span>Reads your project to learn its language, its tools, and how you run your tests.</span></div>
<div><b>Copy</b><span>Makes a separate working copy of your code (a git worktree), off to the side, under ../.vibestrate-worktrees/&lt;runId&gt;/.</span></div>
<div><b>Build</b><span>Plans the change, builds it, runs your tests, then reviews and verifies the result.</span></div>
<div><b>Fix loop</b><span>If the review finds a problem, it loops back, fixes it, and checks again.</span></div>
<div><b>Stop</b><span>Stops at one of three outcomes and leaves the call to you.</span></div>
</div>

The run ends in one of three states:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is ready for you.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>It needs your call.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something went wrong.</span></div>
</div>

## What you'll see

The terminal prints each step as it happens: a header, a short status, and any output. With `--ui`, the same thing shows up as a live board you can watch.

When the run finishes, you'll see something like:

```text
Run abc123 → merge_ready
  worktree: ../.vibestrate-worktrees/abc123-add-structured-logging-to-the-settings-save-handler
  branch:   vibestrate/abc123-add-structured-logging-to-the-settings-save-handler
  artifacts: .vibestrate/runs/abc123/
```

## Look at what it changed

To see every change before you accept anything:

```bash
cd ../.vibestrate-worktrees/abc123-add-structured-logging-to-the-settings-save-handler
git diff main
```

Or open the **Git** tab in the dashboard, which shows the same changes inline, file by file.

## Use it, or don't

<div class="docs-callout">

**Vibestrate never merges anything for you.** The finished change sits on its own branch, ready for you to take or leave. That part is always your call.

</div>

The branch is yours to:

- Open a pull request (`gh pr create`, or whatever tool you use).
- Pull it into your own branch if it's yours alone.
- Take just the parts you want.
- Throw the whole thing away if it isn't right.

## When it doesn't finish clean

- **`blocked`** - the reviewer or verifier flagged something that needs a human decision. Read the notes in `.vibestrate/runs/<runId>/review.md` and `verification.md`.
- **`failed`** - something broke partway through. Check `.vibestrate/runs/<runId>/events.jsonl` and the provider stream log.

See [Debug a failed run](/docs/workflows/debug-failed) for the step-by-step playbook.

## Next

[Set up a provider →](/docs/getting-started/providers) - Vibestrate picks a sensible default, but five minutes on how the AI models are wired up is worth it.
