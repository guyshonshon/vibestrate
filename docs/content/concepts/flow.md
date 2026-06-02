---
title: Flow
description: A run recipe - required Seats, the step sequence, gates, loop, and artifacts. The built-in default flow is one; custom flows are others.
section: concepts
slug: concepts/flow
---

# Flow

## Basically

A Flow is the recipe: what should happen, step by step.

## Example

```bash
vibe run "Refactor provider permissions" --flow quality-arbitration --crew default
```

The Flow declares the **Seats** it needs; your **Crew** supplies the Roles that
fill them.

## At a glance

A Flow is a recipe with empty, labelled chairs. It can come from the shared
**hub**, or you can write your own. Either way it names *seats*, never your
models - which is exactly what lets you download someone else's Flow and run it
with your own crew:

```text
  FLOW HUB  (shareable recipes)
     │  vibe flows hub install <ref>
     ▼
  ┌────────────────────────────────────────────────┐
  │  FLOW  "quality-arbitration"                     │
  │  the recipe your Task runs through, top to bottom │
  │                                                  │
  │   1. plan        →  seat: builder                │
  │   2. plan-review →  seat: challenger             │
  │   3. implement   →  seat: builder                │
  │   4. validate       (no seat - runs your commands)│
  │   5. decide      →  seat: arbiter                │
  └────────────────────────────────────────────────┘
     │  a seat is an empty chair: "this step needs a builder."
     │  the Flow never names a model - your Crew does that.
     ▼
  YOUR CREW fills each seat with one of your Roles:
     builder     ←  Executor   (Opus, max effort - it writes the code)
     challenger  ←  Reviewer   (a different vendor, so it sees fresh)
     arbiter     ←  Verifier   (cheap - it only writes the summary)
```

Read top to bottom: the Flow lays out the steps and the seats each one needs;
your Crew decides who sits in them and how much each one costs to run. Swap the
Flow and the steps change; swap the Crew and the cast changes; neither touches
the other.

## More Detail

A Flow is a structured run recipe - required **[[seat]]s**, step kinds
(agent-turn, review-turn, response-turn, validation, approval-gate, summary-turn),
optional gates, bounded repeats, and an adaptive review→fix loop. Every run
executes a Flow through one runner; the built-in `default` Flow runs when you
don't pick another, and custom Flows give richer choreography for higher-rigor
work. Definitions are validated against `flowDefinitionSchema` (Zod), live as
built-ins under `src/flows/catalog/` or as project flows under
`.vibestrate/flows/<id>/flow.yml`, and are resolved into an immutable snapshot at
run start.

### Seats, not local roles

A Flow has named **Seats** - `builder`, `challenger`, `arbiter` - and each step
says which Seat owns it. A Flow **never names your local Role ids or Profiles**,
which is what keeps it shareable. At run time the [[crew]] matches each Seat to a
Role (via the Role's `seats` list), that Role's [[profile]] picks the runtime, and
the Profile names the [[provider]]. To run a single step on a stronger Profile
without changing the Role:

```bash
vibe run "Implement auth crypto" --flow quality-arbitration \
  --step-profile implement=opus-deep
```

Mixing vendors is deliberate - builder and challenger should *not* be the same
model, or the challenger has nothing fresh to contribute. Express that by giving
those Roles different Profiles in your Crew.

## A built-in: `quality-arbitration`

The `quality-arbitration` Flow ships with Vibestrate. It runs:

1. **plan** - builder plans the change.
2. **plan-review** - challenger critiques the plan (optional).
3. **implement** - builder writes the code.
4. **validate** - project validation commands run.
5. **implementation-review** - challenger reviews the diff.
6. **challenge-response** - builder addresses the challenger's findings.
7. **second-review** - challenger re-reviews.
8. **decision-summary** - arbiter writes the final summary, including residual disagreement.

The canonical, generated definition (seats, steps, inputs, outputs) is in the [Flows reference](/docs/reference/flows).

## Project Flows

Drop a `flow.yml` into `.vibestrate/flows/<id>/`:

```yaml
id: spike-and-decide
version: 1
label: Spike and decide
description: Quick prototype with a built-in stop-and-check gate.
seats:
  prototyper:
    label: Prototyper
    description: Builds a throwaway prototype.
steps:
  - id: prototype
    label: Prototype
    kind: agent-turn
    seat: prototyper
    inputs: [task-brief]
    outputs: [diff]
  - id: human-check
    label: Human checkpoint
    kind: approval-gate
    approval:
      reason: Decide whether to keep the spike or rewrite.
      requestedAction: continue
```

Vibestrate validates `flow.yml` against the schema on load - malformed Flows fail loud, not silent.

## Managing Flows in Mission Control

The **Flows** page in the dashboard lists every discovered Flow (built-in +
project) and shows each one's flow at a glance - seats, ordered steps, and which
steps are human approval gates. From there you can **fork** a built-in into
`.vibestrate/flows/<id>/` to customize it, **delete** a project Flow, or open one in
the **Flow Builder** to tune seats/steps before a run. It's the read/curate
surface; the Flow Builder is the edit/run surface. (All of it runs over the
local `/api/flows` routes - the browser never shells out.)

## When to write a Flow

- The same review choreography keeps repeating across tasks.
- A specific kind of change always needs an approval gate at a known point.
- You want to wire in a different model for a specific role (e.g. always run the reviewer on a different vendor).

## When not to write a Flow

- You're trying to make the default workflow "slightly different" - usually skills or a clearer task description do the job better.
- The shape is one-off - just put the steps in the task description.

## Related

- [[seat]] - what a Flow step needs filled.
- [[crew]] - the local Roles that fill a Flow's Seats.
- [[profile]] - how strong/expensive each filled Seat runs.
- [Built-in Flows reference](/docs/reference/flows).
- [Extending: add a Flow](/docs/extending/add-flow).
