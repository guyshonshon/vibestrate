---
title: Annotations
description: A short note pinned to a file, which agents read before they start work.
slug: concepts/annotation
---

## In simple words

An **annotation** is a short note you pin to a file, telling agents something they should know before they touch it.

It works like a sticky note on a page. The page is unchanged, but anyone reading it sees your note first. Use one to say "do not refactor this", "this function is the bug", or "match the pattern in `x.ts`" without editing the file yourself.

<div class="docs-callout tip">

**Tip.** An annotation is the right tool when the thing you want to say is about *one file*. If it is true across the whole codebase, write a [[skill]] instead - a note pinned to forty files is forty things to keep in sync.

</div>

## When you would pin one

<div class="docs-cards">

**"This is the bug"**
Point the run at the function rather than letting it search.

**"Do not touch this"**
Load-bearing code that looks refactorable and is not.

**"Copy the pattern here"**
Name the file you want imitated.

**"This is generated"**
Stop an agent hand-editing something a script rewrites.

</div>

<div class="docs-callout">

**Did you know?** Annotations marked visible to agents are added to every agent's prompt during a run - your guidance, acknowledged by the whole crew, not just the one worker that happens to open that file.

</div>


## Going deeper

### What a note pins to

Every note targets a file, and you can point it at a precise spot:

- **Whole file** - leave the line blank.
- **A line** - set a start line, or click the `+` that appears when you hover a line in the file viewer.
- **A range** - set a start and end line.

### When agents see them

Each note has a **Visible to agents** toggle, on by default. It decides which of two places the note ends up:

<svg viewBox="0 0 560 126" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A note you pin is either shared and open, in which case it joins every agent's prompt, or private or resolved, in which case it stays in the dashboard only.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="8" width="150" height="38" rx="8"/>
    <rect x="195" y="8" width="170" height="38" rx="8"/>
    <rect x="401" y="8" width="158" height="38" rx="8"/>
    <rect x="195" y="80" width="170" height="38" rx="8"/>
    <rect x="401" y="80" width="158" height="38" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M151 27 h40"/><path d="M186 22 l5 5 l-5 5"/>
    <path d="M365 27 h32"/><path d="M392 22 l5 5 l-5 5"/>
    <path d="M76 46 V99 H191"/><path d="M186 94 l5 5 l-5 5"/>
    <path d="M365 99 h32"/><path d="M392 94 l5 5 l-5 5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="76" y="31">a note you pin</text>
    <text x="280" y="31">shared and open</text>
    <text x="480" y="31">every agent's prompt</text>
    <text x="280" y="103">private or resolved</text>
    <text x="480" y="103">the dashboard only</text>
  </g>
</svg>

When it's on, the note is shared. The moment a run starts, all open shared notes are added to every agent's prompt under a `# Human Annotations` section, so the whole crew treats them as instructions for the task. When it's off, the note stays in the dashboard for you only.

You can flip the toggle off any time, or **resolve** a note to drop it from future prompts without deleting it. Resolved notes are kept, greyed out, and you can reopen them.

### Add one

1. Open **Codebase** in Mission Control and select a file. Use the **Project** source, since annotations are pinned to the project codebase, not a run worktree.
2. In the right panel, set the anchor (blank for the whole file, or a line or range), type the note, and choose whether it's visible to agents.
3. **Add note.** It shows up in the list, and if it's shared, in the next agent prompt.

### What an agent actually reads

A shared, open note reaches the prompt as one line under `# Human Annotations`, carrying its anchor and your text:

```text
# Human Annotations

The user pinned these notes to the codebase.
Treat them as authoritative guidance for this task:

- **src/auth/session.ts:40-58** - don't refactor
  this; the ordering here is load-bearing.
```

A whole-file note shows as `src/auth/session.ts`, a single line as `src/auth/session.ts:40`.
