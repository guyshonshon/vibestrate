---
title: Flow
description: A run recipe — participant slots, the step sequence, gates, loop, and artifacts. The built-in default flow is one; custom flows are others.
section: concepts
slug: concepts/flow
---

**Professional explanation.** A Flow is a structured run recipe — participant slots, step kinds (agent-turn, review-turn, response-turn, validation, approval-gate, summary-turn), optional gates, bounded repeats, and an adaptive review→fix loop. Every run executes a flow through one runner; the built-in `default` flow runs when you don't pick another, and custom flows give a richer choreography for higher-rigor work. Flow definitions are validated against `flowDefinitionSchema` (Zod), live as built-ins under `src/flows/catalog/` or project flows under `.vibestrate/flows/<id>/flow.yml`, and are resolved into an immutable snapshot at run start.

**Simple explanation.** A Flow is a saved playbook for "how to do this kind of work." You name the roles, name the steps, and Vibestrate runs them.

## Why it matters

The default workflow is one shape — good for most edits, fine for refactors. But some work needs more rigor: a multi-perspective review, an explicit approval gate before code is written, a second pass after a challenger raises objections. Flows give you that shape without rewriting the orchestrator.

## Slots vs roles

Where the default workflow has fixed agent roles (`planner`, `executor`, `reviewer`), a Flow has named **slots** — `builder`, `challenger`, `arbiter` — and each step says which slot owns it. You assign providers to slots when starting the run:

```bash
vibe run "Refactor provider permissions" --flow quality-arbitration \
  --flow-slot builder=claude \
  --flow-slot challenger=codex
```

This is the design point that lets you mix vendors deliberately — builder and challenger should *not* be the same model, or the challenger has nothing fresh to contribute.

## A built-in: `quality-arbitration`

The `quality-arbitration` Flow ships with Vibestrate. It runs:

1. **plan** — builder plans the change.
2. **plan-review** — challenger critiques the plan (optional).
3. **implement** — builder writes the code.
4. **validate** — project validation commands run.
5. **implementation-review** — challenger reviews the diff.
6. **challenge-response** — builder addresses the challenger's findings.
7. **second-review** — challenger re-reviews.
8. **decision-summary** — arbiter writes the final summary, including residual disagreement.

The canonical, generated definition (slots, steps, inputs, outputs) is in the [Flows reference](/docs/reference/flows).

## Project Flows

Drop a `flow.yml` into `.vibestrate/flows/<id>/`:

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

Vibestrate validates `flow.yml` against the schema on load — malformed Flows fail loud, not silent.

## Managing Flows in Mission Control

The **Flows** page in the dashboard lists every discovered Flow (built-in +
project) and shows each one's flow at a glance — slots, ordered steps, and which
steps are human approval gates. From there you can **fork** a built-in into
`.vibestrate/flows/<id>/` to customize it, **delete** a project Flow, or open one in
the **Flow Builder** to tune slots/steps before a run. It's the read/curate
surface; the Flow Builder is the edit/run surface. (All of it runs over the
local `/api/flows` routes — the browser never shells out.)

## When to write a Flow

- The same review choreography keeps repeating across tasks.
- A specific kind of change always needs an approval gate at a known point.
- You want to wire in a different model for a specific role (e.g. always run the reviewer on a different vendor).

## When not to write a Flow

- You're trying to make the default workflow "slightly different" — usually skills or a clearer task description do the job better.
- The shape is one-off — just put the steps in the task description.

## Related

- [Workflow](/docs/concepts/workflow) — what Flows override.
- [Built-in Flows reference](/docs/reference/flows).
- [Extending: add a Flow](/docs/extending/add-flow).
