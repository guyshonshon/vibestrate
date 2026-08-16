---
title: Annotations
description: Pin short notes to your files so the agents read them during a run, without ever touching your code.
slug: concepts/annotation
---

An annotation is a short note you pin to a file in your codebase, telling the agents something they should know before they start work.

It works like a sticky note stuck to a page. The page stays exactly as it was, but anyone reading it sees your note first. Use one to say things like "don't refactor this", "this function is the bug", or "match the pattern in `x.ts`" without editing the file yourself.

You pin annotations from Mission Control's **Codebase** page. They never touch your source. They live in their own file, `.vibestrate/annotations.json`, off to the side. Annotations are entirely optional, and Vibestrate works exactly the same with none.

Because a shared note goes straight into agent prompts, it obeys the same no-secrets rule as everything else. You can't annotate a secret-like file such as `.env` or `*.key`, a note body is refused if it contains something shaped like a vendor token, paths are project-relative with no traversal, and a note stops at 4000 characters.

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

## What an agent actually reads

A shared, open note reaches the prompt as one line under `# Human Annotations`, carrying its anchor and your text:

```text
# Human Annotations

The user pinned these notes to the codebase. Treat them as
authoritative guidance for this task:

- **src/auth/session.ts:40-58** - don't refactor this; the
  ordering here is load-bearing.
```

A whole-file note shows as `src/auth/session.ts`, a single line as `src/auth/session.ts:40`.
