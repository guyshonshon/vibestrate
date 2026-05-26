---
title: Annotations
description: Pin external notes to files (and lines) in the Codebase page that the orchestrator shares with agents during runs.
section: concepts
slug: concepts/annotation
---

Annotations are short, human-authored notes you pin to your codebase from
Mission Control's **Codebase** page. They live outside your source files — in
`.amaco/annotations.json` — so they never touch the code itself. Their point:
**give the agents guidance they'll acknowledge** ("don't refactor this", "this
function is the bug", "match the pattern in `x.ts`") without editing the files.

Annotations are entirely optional. Amaco works exactly the same with none.

## What an annotation anchors to

Each note targets a file, and optionally a precise spot:

- **Whole file** — leave the line blank.
- **A line** — set a start line (or click the `+` that appears when you hover a
  line in the file viewer).
- **A range** — set a start and end line.

## How agents see them

Every annotation has a **Visible to agents** toggle (on by default):

- **Visible to agents** — when a run starts, all *open* shared annotations are
  injected into every agent's prompt under a `# Human Annotations` section, so
  the whole crew treats them as authoritative guidance for the task.
- **Private** — the note stays in the dashboard for you only; agents never see
  it.

Turn the toggle off any time to make a note private, or **resolve** it to drop
it from future prompts without deleting it. Resolved notes are kept (greyed
out) and can be reopened.

## Add one

1. Open **Codebase** in Mission Control and select a file (use the **Project**
   source — annotations are pinned to the project codebase, not a run worktree).
2. In the right panel, set the anchor (blank = whole file, or a line/range), type
   the note, and choose whether it's visible to agents.
3. **Add note.** It appears in the list and, if shared, in the next agent
   prompt.

## Safety

- Notes are stored only in `.amaco/annotations.json`; source files are never
  modified.
- You can't annotate secret-like files (`.env`, `*.key`, …), and note bodies are
  scanned for secret-shaped tokens and refused — annotations are injected into
  prompts, so they're held to the same no-secrets rule as everything else.
- Paths are guarded: no traversal, project-relative only.
