---
title: Derived flows
description: Build a flow around the task instead of picking one off the shelf - and why the model never authors the graph.
slug: concepts/derived-flows
---

A Flow is a generic layer, so a fixed recipe is always slightly wrong: too heavy
for a one-line change, too light for a migration that touches money. Deriving a
Flow builds one from the work itself.

Give it a task like *"Add team billing: (a) a teams table, (b) an owner-only
members endpoint, (c) a monthly invoice endpoint. c depends on b, b on a.
End-to-end billing tests only run once all three are in."* and it compiles the
graph those sentences describe.

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

## A lens that stands itself down

A risk tag says a unit *might* touch a subject. Whether the finished code
actually does is a different question, and it is answerable from the diff.

So each conditional lens carries a stand-down condition, evaluated against the
run's real changes:

| lens | stands down when |
|---|---|
| authorization | nothing in the change decides who may act |
| injection | no caller-supplied input reaches a sink |
| accessibility | nothing touches the rendered surface |

Correctness has no condition. It is the floor: there is no diff safe to leave
entirely unread.

This is what makes a speculative tag cheap. Tag a unit `auth` because it might
need a permission check, and if the finished code turns out not to have one, the
authorization review costs nothing instead of spending a turn to confirm an
absence.

**Skipping requires positive evidence of absence.** An unreadable diff, an empty
change set, or a read-only run all RUN the step. A wrong call can only ever cause
more review, never less - which is the only safe direction for a mechanism whose
whole job is deciding when a review does not happen.

The patterns are deliberately broad and deliberately not configurable.
Broadening them is harmless; narrowing them silently weakens a gate, and a
config file is the wrong place to disarm a review. The control surface is
`--flow-force <step>`, which forces a step to run whatever its condition says.
There is no inverse, because a lever that turns reviews off is not a control -
it is a hole.

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

Deriving prints the units, the compiled graph, the reason for every lens, and
seat coverage against your crew, then stops. Adopting it is a separate, explicit
step: export the derived YAML and import it, the same path any shared Flow takes.
See the Flows CLI reference for the exact invocations.

The coverage check is worth reading before you adopt. A seat reported as
`ambiguous` means two roles in your crew can fill it, and the run will need
`--seat-role` to disambiguate - cheaper to learn here than eight minutes into a
run.
