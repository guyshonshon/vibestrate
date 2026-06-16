---
title: Annotations
description: Pin short notes to your files so the agents read them during a run, without ever touching your code.
section: concepts
slug: concepts/annotation
---

An annotation is a short note you pin to a file in your codebase, telling the agents something they should know before they start work.

It works like a sticky note stuck to a page. The page stays exactly as it was, but anyone reading it sees your note first. Use one to say things like "don't refactor this", "this function is the bug", or "match the pattern in `x.ts`" without editing the file yourself.

You pin annotations from Mission Control's **Codebase** page. They never touch your source. They live in their own file, `.vibestrate/annotations.json`, off to the side. Annotations are entirely optional, and Vibestrate works exactly the same with none.

## What a note pins to

Every note targets a file, and you can point it at a precise spot:

- **Whole file** - leave the line blank.
- **A line** - set a start line, or click the `+` that appears when you hover a line in the file viewer.
- **A range** - set a start and end line.

## When agents see them

Each note has a **Visible to agents** toggle, on by default.

When it's on, the note is shared. The moment a run starts, all open shared notes are added to every agent's prompt under a `# Human Annotations` section, so the whole crew treats them as instructions for the task.

When it's off, the note is private. It stays in the dashboard for you only, and agents never see it.

You can flip the toggle off any time, or **resolve** a note to drop it from future prompts without deleting it. Resolved notes are kept, greyed out, and you can reopen them.

## Add one

1. Open **Codebase** in Mission Control and select a file. Use the **Project** source, since annotations are pinned to the project codebase, not a run worktree.
2. In the right panel, set the anchor (blank for the whole file, or a line or range), type the note, and choose whether it's visible to agents.
3. **Add note.** It shows up in the list, and if it's shared, in the next agent prompt.

## What's kept safe

Notes only ever live in `.vibestrate/annotations.json`, and your source files are never modified.

Because notes get added straight into agent prompts, they follow the same no-secrets rule as everything else. You can't annotate secret-like files (`.env`, `*.key`, …), and note bodies are scanned for secret-shaped tokens and refused if any turn up. Paths are guarded too: project-relative only, no traversal.
