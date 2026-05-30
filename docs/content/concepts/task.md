---
title: Task
description: The unit of work Vibestrate runs. A short prompt that triggers a full plan → build → review → verify cycle.
section: concepts
slug: concepts/task
---

**Professional explanation.** A task is the unit of work submitted to Vibestrate's orchestrator. It carries a free-form description, optional effort hint, optional provider override, and an optional skill list. The orchestrator transforms the task into a run — a stateful instance of the workflow that owns a worktree, an agent crew, validation results, and artifacts.

**Simple explanation.** A task is the thing you ask Vibestrate to do, written in plain language. You say *what* you want; Vibestrate figures out the steps.

## Why it matters

The shape of the task is the only thing the orchestrator has to commit to a flow. A clear task description usually produces a clear plan; a fuzzy task description produces a fuzzy plan. Treat the task like a brief for a colleague — be specific about the file or behavior you mean.

## A good task description

```bash
vibe run "Add structured logging to the settings save handler in src/server/routes/settings.ts. Use the existing logger from src/lib/logger.ts. Include the user id and the changed keys, but never the values."
```

It names the file, names the library to use, and calls out the safety constraint up front.

## A weak task description

```bash
vibe run "Improve logging"
```

The planner will guess what you meant. The reviewer will critique its own guess. You'll get a diff that's plausible but probably not what you wanted.

## Checklist — breaking a card into items

A task (a planning-board card) can hold an ordered **checklist** of **items** — the concrete breakdown of what the card entails. Items live *inside* the card on purpose, so the context stays in one place instead of scattering across many small cards.

```bash
vibe tasks checklist add  <taskId> "/health returns json"
vibe tasks checklist add  <taskId> "test the endpoint"
vibe tasks checklist list <taskId>
vibe tasks checklist check <taskId> <itemId>      # mark done
vibe tasks checklist status <taskId> <itemId> in_progress
vibe tasks checklist move <taskId> <itemId> 1     # reorder (1-based)
```

The same actions are available in the task detail page of [Mission Control](/docs/cli/dashboard) (add, check off, edit, drag-reorder, remove). Each item carries a status — `pending`, `in_progress`, `done`, or `blocked`.

**Enhance** — instead of writing the checklist by hand, let an AI assist propose one:

```bash
vibe tasks enhance <taskId>            # read-only: prints a proposed checklist
vibe tasks enhance <taskId> --apply    # append the proposed items
```

Enhance is a one-shot, read-only [assist](/docs/glossary#assist) run — it *proposes* an ordered breakdown of the card; you decide whether to add the items (the "Enhance" button on a task previews them, then "Add all" appends). The model never writes to the board on its own.

## Pick-up execution — run the whole checklist

Once a card has a checklist, **pick it up** to execute every item in one run, in one worktree:

```bash
vibe tasks pickup <taskId>          # continuous: items back-to-back
vibe tasks pickup <taskId> --step   # pause between items for review
```

The dashboard's "Run checklist" button on the task does the same. Under the hood this runs the built-in `pickup` [flow](/docs/concepts/flow): a holistic **plan** once, then a per-item band (**micro-plan → implement**) repeated for each item, then a holistic **review**. Each item is committed on its own (stamped with the item id, so a single item can be reverted), and a *compact summary* of each finished item is carried forward so later items have context without re-reading every diff. Item status and the commit sha are written back onto the checklist as the run progresses. Execution is linear and stops on the first failing item.

A checklist item is **not** a Flow [Step](/docs/concepts/workflow): a Step is a phase of the workflow (plan / implement / review); a checklist item is a piece of *what to build*. Don't conflate them.

## Practical tips

- **One outcome per task.** Two unrelated changes in one run make the review noisy and the diff harder to ship.
- **Name the surface.** A file path, a module name, a feature flag — give the planner something concrete to anchor on.
- **State the constraint.** If "don't touch X" matters, say so in the task itself, not after the diff lands.
- **Use skills for context that's stable.** Conventions, security rules, domain language belong in [skills](/docs/concepts/skill), not in every task prompt.

## Related

- [Workflow](/docs/concepts/workflow) — the stages a task moves through.
- [Run state](/docs/concepts/state) — the formal statuses a task accumulates.
- [Worktree](/docs/concepts/worktree) — where a task's edits live before you merge.
