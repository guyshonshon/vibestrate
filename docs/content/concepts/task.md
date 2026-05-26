---
title: Task
description: The unit of work Amaco runs. A short prompt that triggers a full plan → build → review → verify cycle.
section: concepts
slug: concepts/task
---

**Professional explanation.** A task is the unit of work submitted to Amaco's orchestrator. It carries a free-form description, optional effort hint, optional provider override, and an optional skill list. The orchestrator transforms the task into a run — a stateful instance of the workflow that owns a worktree, an agent crew, validation results, and artifacts.

**Simple explanation.** A task is the thing you ask Amaco to do, written in plain language. You say *what* you want; Amaco figures out the steps.

## Why it matters

The shape of the task is the only thing the orchestrator has to commit to a flow. A clear task description usually produces a clear plan; a fuzzy task description produces a fuzzy plan. Treat the task like a brief for a colleague — be specific about the file or behavior you mean.

## A good task description

```bash
amaco run "Add structured logging to the settings save handler in src/server/routes/settings.ts. Use the existing logger from src/lib/logger.ts. Include the user id and the changed keys, but never the values."
```

It names the file, names the library to use, and calls out the safety constraint up front.

## A weak task description

```bash
amaco run "Improve logging"
```

The planner will guess what you meant. The reviewer will critique its own guess. You'll get a diff that's plausible but probably not what you wanted.

## Practical tips

- **One outcome per task.** Two unrelated changes in one run make the review noisy and the diff harder to ship.
- **Name the surface.** A file path, a module name, a feature flag — give the planner something concrete to anchor on.
- **State the constraint.** If "don't touch X" matters, say so in the task itself, not after the diff lands.
- **Use skills for context that's stable.** Conventions, security rules, domain language belong in [skills](/docs/concepts/skill), not in every task prompt.

## Related

- [Workflow](/docs/concepts/workflow) — the stages a task moves through.
- [Run state](/docs/concepts/state) — the formal statuses a task accumulates.
- [Worktree](/docs/concepts/worktree) — where a task's edits live before you merge.
