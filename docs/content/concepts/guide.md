---
title: Guide
description: A selectable run recipe. Defines participant slots, the step sequence, gates, and artifacts — separately from the default workflow.
section: concepts
slug: concepts/guide
---

**Professional explanation.** A Guide is a structured run recipe that overrides the default workflow with a richer choreography — participant slots, step kinds (agent-turn, review-turn, response-turn, validation, approval-gate, summary-turn), optional gates, and bounded repeats. Guide definitions are validated against `guideDefinitionSchema` (Zod), live as either built-ins under `src/guides/catalog/` or project Guides under `.amaco/guides/<id>/guide.yml`, and are resolved into an immutable snapshot at run start.

**Simple explanation.** A Guide is a saved playbook for "how to do this kind of work." You name the roles, name the steps, and Amaco runs them.

## Why it matters

The default workflow is one shape — good for most edits, fine for refactors. But some work needs more rigor: a multi-perspective review, an explicit approval gate before code is written, a second pass after a challenger raises objections. Guides give you that shape without rewriting the orchestrator.

## Slots vs roles

Where the default workflow has fixed agent roles (`planner`, `executor`, `reviewer`), a Guide has named **slots** — `builder`, `challenger`, `arbiter` — and each step says which slot owns it. You assign providers to slots when starting the run:

```bash
amaco run "Refactor provider permissions" --guide quality-arbitration \
  --guide-slot builder=claude \
  --guide-slot challenger=codex
```

This is the design point that lets you mix vendors deliberately — builder and challenger should *not* be the same model, or the challenger has nothing fresh to contribute.

## A built-in: `quality-arbitration`

The `quality-arbitration` Guide ships with Amaco. It runs:

1. **plan** — builder plans the change.
2. **plan-review** — challenger critiques the plan (optional).
3. **implement** — builder writes the code.
4. **validate** — project validation commands run.
5. **implementation-review** — challenger reviews the diff.
6. **challenge-response** — builder addresses the challenger's findings.
7. **second-review** — challenger re-reviews.
8. **decision-summary** — arbiter writes the final summary, including residual disagreement.

The canonical, generated definition (slots, steps, inputs, outputs) is in the [Guides reference](../reference/guides).

## Project Guides

Drop a `guide.yml` into `.amaco/guides/<id>/`:

```yaml
id: spike-and-decide
version: 1
label: Spike and decide
description: Quick prototype with a built-in stop-and-check gate.
slots:
  prototyper:
    label: Prototyper
    defaultAgent: executor
steps:
  - id: prototype
    label: Prototype
    kind: agent-turn
    slot: prototyper
    inputs: [task-brief]
    outputs: [diff]
  - id: human-check
    label: Human checkpoint
    kind: approval-gate
    approval:
      reason: Decide whether to keep the spike or rewrite.
      requestedAction: continue
```

Amaco validates `guide.yml` against the schema on load — malformed Guides fail loud, not silent.

## When to write a Guide

- The same review choreography keeps repeating across tasks.
- A specific kind of change always needs an approval gate at a known point.
- You want to wire in a different model for a specific role (e.g. always run the reviewer on a different vendor).

## When not to write a Guide

- You're trying to make the default workflow "slightly different" — usually skills or a clearer task description do the job better.
- The shape is one-off — just put the steps in the task description.

## Related

- [Workflow](./workflow) — what Guides override.
- [Built-in Guides reference](../reference/guides).
- [Extending: add a Guide](../extending/add-guide).
