---
title: Annotations
description: A short note pinned to a file, which agents read before they start work.
slug: concepts/annotation
---

## In simple words

An **annotation** is a short note you pin to a file, telling agents something they should know before they touch it.

It works like a sticky note on a page: the page is unchanged, but anyone reading it sees your note first, and you never edit the file yourself.

You pin it on the **Codebase** page. `vibe ui` opens the dashboard on `127.0.0.1:4317`, **Codebase** is a row in the sidebar, and its right-hand **Inspector** panel holds the notes for whichever file is open. There is no command for this one: the dashboard is the only surface.

<div class="docs-callout tip">

**Tip.** An annotation is the right tool when what you want to say is about *one file*. If it is true across the codebase, write a [[skill]] instead - a note pinned to forty files is forty things to keep in sync.

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

**Did you know?** A note marked visible to agents is added to every agent's prompt during a run - your guidance, acknowledged by the whole crew, not only the one worker that happens to open that file.

</div>


## Pin one

1. Open **Codebase** on the **Project** source tab. Notes pin to the project codebase, so the panel stands down under **Worktree**.
2. Select a file. The **Annotations** block appears under the Inspector's file stats.
3. Set the anchor: blank for the whole file, a line number for one line, a line plus an end line for a range. Hovering a line in the viewer shows a `+` that fills it in.
4. Type the note, decide whether **Visible to agents** stays ticked, and press **Add note**.

Secret-like files refuse annotation and say so in place of the form.

## When agents see them

**Visible to agents** is on by default, and it decides which of two places the note ends up:

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

A shared note joins every agent's prompt the moment a run starts. A private one stays in the dashboard for you.

Each note carries its anchor, a chip reading `roles` or `private` that flips the sharing, and controls to resolve or delete it. **Resolving** drops a note from future prompts without deleting it: it stays in the list, greyed out and struck through, ready to reopen.

## What an agent actually reads

One line under `# Human Annotations`, carrying its anchor and your text:

```text
# Human Annotations

The user pinned these notes to the codebase. Treat them as authoritative guidance for this task:

- **src/auth/session.ts:40-58** - don't refactor this; the ordering here is load-bearing.
```

Whatever line breaks you typed are collapsed on the way in, so a note reaches an agent as exactly one line however you wrote it. A whole-file note shows as `src/auth/session.ts`, a single line as `src/auth/session.ts:40`.

## Where they live

`.vibestrate/annotations.json`, never inside the source files: your file's bytes do not change, and a note survives it being rewritten. The file sits with the rest of your committed [configuration](/docs/concepts/configuration).
