---
title: Derived flows
description: Build a flow around the task instead of picking one off the shelf - and why the model never authors the graph.
slug: concepts/derived-flows
---

A Flow is a generic layer, so a fixed recipe is always slightly wrong: too heavy
for a one-line change, too light for a migration that touches money. `vibe flows
derive` builds one from the work itself.

```
vibe flows derive "Add team billing: (a) a teams table, (b) an owner-only
  members endpoint, (c) a monthly invoice endpoint. c depends on b, b on a.
  End-to-end billing tests only run once all three are in."
```

## The model describes the work. It does not design the workflow.

A shaping turn returns a **decomposition**, not a flow: the units of work, what
each one depends on, and what each one is risky about. Deterministic code turns
that into the graph.

That split is the safety property, and it is the same reasoning that makes a
`block` policy owner-only. Every step id, every `needs` edge and every review
lens is computed, so a model can influence *what* gets reviewed only through a
closed vocabulary, and can never remove a gate, reorder one, or write a step
that renders its own verdict. A poor decomposition produces a flow that is
wrong-but-gated, never one that is ungated.

## What it answers that a static flow cannot

**"c depends on b."** Each unit becomes its own implement step, wired to the
units it named. Unit steps are also chained in dependency order even when two
units are independent - they share one git worktree and both write the diff, so
running them at once would race.

**"Testing only once a, b and c are made."** Validation waits for every unit
step. A partial tree cannot be meaningfully validated.

**"When do we review, and what?"** Each unit is tagged with what it is risky
about, from a closed set, and each tag maps to a review lens:

| tag | lens |
|---|---|
| `auth` | authorization |
| `untrusted-input` | injection |
| `secrets` | secrets and exposure |
| `data-integrity`, `concurrency`, `money`, `migration`, `public-api` | correctness |
| `ui` | accessibility |
| `performance` | performance |

Several lenses run in parallel and join at an arbiter. A single lens *is* the
decision, so no arbiter is added and no arbiter seat is declared. A task that
declares no risk at all still gets one correctness review: "nothing risky" is a
claim about the work, not a licence to ship it unread.

## Decomposition is not free

Each unit is a separate model turn on the same worktree, and they run one after
another. Splitting one cohesive change into eight units multiplies the
implementation spend eightfold and improves nothing.

Measured on a small CRUD app: an eight-unit decomposition cost **$4.50 and 723
seconds** and scored **107/120**. The same app as a single implement turn cost
**$2.23 and 322 seconds** and scored **110/120** - more expensive, slower, and
slightly worse.

The derive output prints the unit count and a cost note past four units, and
`--max-units <n>` refuses a decomposition over a limit you set rather than
silently merging units behind your back.

## It writes nothing

`derive` prints the units, the compiled graph, the reason for every lens, and
seat coverage against your crew. Adopting it is a separate, explicit step:

```
vibe flows derive "<task>" --id my-flow --yaml > my-flow.yml
vibe flows import my-flow.yml
```

The coverage check is worth reading before you adopt. A seat reported as
`ambiguous` means two roles in your crew can fill it, and the run will need
`--seat-role` to disambiguate - cheaper to learn here than eight minutes into a
run.
