---
title: Picking up a project already underway
description: Adopting Vibestrate on a codebase with history behind it. Your own TODO comments become the backlog you start from.
slug: getting-started/existing-project
---

Most guides assume you're starting fresh. Most projects aren't.

When you run `vibe init` on a codebase that has been going for a year, you get a working setup and an empty Board. That's the awkward part: the project has plenty of work in it, but none of it is written down anywhere Vibestrate can see. You're left staring at a blank page, trying to remember what needs doing.

Except it is written down. It's in the code, in the TODO and FIXME comments people left behind while they were busy with something else.

## What `vibe learn` finds

`vibe learn` scans your codebase and writes a map of it: stack, layout, entry points, routes, tooling. It also collects every `TODO`, `FIXME`, `HACK`, `XXX` and `BUG` comment it can find.

```bash
vibe learn
```

```
✓ Learned the codebase -> .vibestrate/CODEBASE.md
  Type: nextjs
  Package manager: pnpm
  Tracked files: 1313
  TODOs: 42 markers: 34 TODO, 6 FIXME, 2 HACK
  → 35 ready to review: vibe todos
```

`vibe init` runs this for you, so on a fresh setup the count is waiting the first time you look.

Nothing has been created yet. The scan only reads.

## Reviewing them

```bash
vibe todos
```

Markers are grouped by directory, so a large codebase reads as a handful of areas rather than one long list:

```
TODOs: 35 to review, 0 on the board, 0 dismissed

src/api
  a3f91c22  FIXME  The retry budget is read but never applied to the provider call
        src/api/client.ts:88
  71e0dd14  TODO   Paginate the runs list once it goes past a few hundred entries
        src/api/runs.ts:214
```

The same list is on the dashboard under **TODOs in your code**, reachable from the Board and from Proposals.

## Promoting the real ones

Some of those markers are real work. Some are notes to self from three years ago that nobody needs any more. You decide which, one at a time:

```bash
vibe todos promote a3f91c22
```

Leave the fingerprint off and press TAB to pick from the list:

```bash
vibe todos promote
```

On the dashboard, tick the ones you want, adjust the title or priority inline, and promote them together.

**Nothing reaches the Board on its own.** A marker becomes a card only when you say so.

Promoting creates a normal task: a title, a priority derived from the marker (`FIXME` and `BUG` are high, `TODO` medium, `HACK` and `XXX` low), and a link back to the exact `file:line` it came from. From there it behaves like any other card, so you can run it:

```bash
vibe run --task <task-id>
```

## Setting the noise aside

Not every marker deserves a card, and you don't want to be asked again on the next scan:

```bash
vibe todos dismiss 9c2a1f07
```

Dismissals stick. Re-running `vibe learn` won't bring them back. If you change your mind:

```bash
vibe todos undismiss 9c2a1f07
```

## Re-running the scan is safe

`vibe learn` rebuilds the TODO list from scratch every time, and it runs again automatically whenever a run finishes. That would normally mean promoting the same TODO twice, so each promoted card remembers which comment it came from.

The practical effects:

- A marker already on the Board shows as **on the board**, not as new work.
- Editing code above a TODO doesn't confuse it. The identity is the comment's text, not its line number.
- Delete a card and its TODO returns to the review list, which is usually what you want after abandoning something.
- Rewording a comment reads as a new TODO. That's the trade for surviving line drift.

## What counts as a TODO

The scan is deliberately conservative, because a review list full of noise is exactly the chore this is meant to remove.

A marker is collected when:

- it appears in a **comment**, not in a string literal or in prose
- the marker **opens** the comment - `// TODO: fix the parser` counts, `// see the TODO in parser.ts` doesn't
- there's something **substantial** after it. Bare `// TODO` and `// TODO: fix` are counted in the map but never offered for promotion, because they don't say enough to become a card

Detection is line-based, which is honest but not perfect: a marker inside a multi-line block comment can be missed, and one inside a multi-line template string can slip through. Anything that slips through can be dismissed.

Secrets are handled the same way as everywhere else in Vibestrate. Files with secret-like names are skipped entirely, and any token shape inside a comment is redacted before it's written down.

## Where it's kept

The harvest lives in `.vibestrate/roadmap/todos/`, alongside the rest of your roadmap data. It's an internal working file, not something you need to open or edit. Your dismissals are kept separately so a rescan can't wipe them.

## A reasonable first session

1. `vibe init` - set up, and see the marker count
2. `vibe todos` - read what's there
3. Promote the five or six that are genuinely worth doing
4. Dismiss the stale ones so they stop coming back
5. `vibe run --task <task-id>` on the smallest one

You'll have a Board reflecting real work in your codebase, built from what your team already knew needed doing.
