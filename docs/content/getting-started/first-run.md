---
title: Your first run
description: Walk through a complete plan → implement → validate → review → verify cycle on a small task.
section: getting-started
slug: getting-started/first-run
---

This walks through one complete cycle from a fresh init to a `merge_ready` diff.

## Pick a small, well-scoped task

Vibestrate runs best on tasks you'd give a careful colleague: clear scope, a known surface, testable. Don't start with "refactor the whole auth flow" — start with something like "add structured logging to the settings save handler."

## Start the run

```bash
vibestrate run "Add structured logging to the settings save handler"
```

If you want to watch it as it goes, add `--ui`:

```bash
vibestrate run "Add structured logging to the settings save handler" --ui
```

Vibestrate will:

1. Detect your project (language, package manager, validation commands).
2. Create a git worktree under `../.vibestrate-worktrees/<runId>/`.
3. Send the task to the planner agent.
4. Hand the plan to the architect.
5. Hand the architecture to the executor, which edits files in the worktree.
6. Run your validation commands.
7. Have the reviewer read the diff.
8. Either pass to the verifier or loop back through fix → validate → review.
9. Stop at `merge_ready`, `blocked`, or `failed`.

## What you'll see

In the terminal, each phase prints a header, a brief status, and any captured output. With `--ui`, the same information renders as a board with phase rails, agent activity, and validation output.

When the run ends, you'll see something like:

```text
Run abc123 → merge_ready
  worktree: ../.vibestrate-worktrees/abc123-add-structured-logging-to-the-settings-save-handler
  branch:   vibestrate/abc123-add-structured-logging-to-the-settings-save-handler
  artifacts: .vibestrate/runs/abc123/
```

## Inspect the diff

```bash
cd ../.vibestrate-worktrees/abc123-add-structured-logging-to-the-settings-save-handler
git diff main
```

Or, from the dashboard, open the **Git** tab — it renders the same diff inline with file-by-file navigation.

## Merge it (or don't)

Vibestrate never merges for you. The diff sits on its branch in the worktree, ready for you to:

- Open a PR (`gh pr create` or your tool of choice).
- Fast-forward locally if the branch is yours alone.
- Cherry-pick specific commits.
- Abort the run and discard the worktree if the result isn't right.

## When it doesn't end at `merge_ready`

- **`blocked`** — the reviewer or verifier found something that needs a human decision. Read `.vibestrate/runs/<runId>/review.md` and `verification.md`.
- **`failed`** — an unrecoverable error during a stage. Check `.vibestrate/runs/<runId>/events.jsonl` and the provider stream log.

See [Debug a failed run](/docs/workflows/debug-failed) for the practical playbook.

## Next

[Set up a provider →](/docs/getting-started/providers) — Vibestrate picks a sensible default, but knowing how providers are wired up is worth the five minutes.
