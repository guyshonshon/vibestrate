---
title: Derived flows
description: Builds a flow from the work itself, rather than forcing every task through one fixed recipe.
slug: concepts/derived-flows
---

## In simple words

A [[flow]] is a generic recipe, so a fixed one is always slightly wrong: too heavy for a one-line change, too light for a migration touching money.

**Deriving** builds a flow from the work itself. Give it a task with real parts to it and you get a flow shaped to those parts, rather than the same eight steps regardless.

```
Task: "Add team billing: a teams table, an owner-only invite endpoint, a seat counter"

derived flow
  plan            -> planner
  migrate         -> implementer   (schema change, isolated)
  endpoint        -> implementer
  review:money    -> reviewer      (added because the task touches billing)
  validate        -> your commands
  verify          -> verifier
```

<div class="docs-callout tip">

**Tip.** Deriving **writes nothing**. It prints a flow for you to read, and adopting it is a separate step you take. Treat it as a proposal from something that read your task, not as a decision already made.

</div>

## When to reach for it

<div class="docs-cards">

**The task has distinct parts**
A schema change, an endpoint and a UI are three different risk profiles wearing one title.

**The default feels wrong**
Too many steps for a rename, too few for a migration.

**You want a flow you will reuse**
Derive once, read it, adopt it, and it becomes a normal project flow.

**A part needs a different lens**
Money-touching work can carry a review the rest of the task does not need.

</div>

<div class="docs-callout">

**Did you know?** A derived flow can include a lens that stands itself down. If the work turns out not to touch the thing that lens was added for, the step reports that it found nothing to check rather than manufacturing a finding to justify its own presence.

</div>


## Going deeper

### The model describes the work. It does not design the workflow.

A shaping turn returns a **decomposition**, not a flow: the units of work, what
each one depends on, and what each one is risky about. Deterministic code turns
that into the graph.

That split is the safety property, and it is the same reasoning that makes a
`block` policy owner-only. Every step id, every `needs` edge and every review
lens is computed, so a model can influence *what* gets reviewed only through a
closed vocabulary, and can never remove a gate, reorder one, or write a step
that renders its own verdict. A poor decomposition produces a flow that is
wrong-but-gated, never one that is ungated.

### What it answers that a static flow cannot

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

### A lens that stands itself down

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

### Decomposition is not free

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

### It writes nothing

Deriving prints the units, the compiled graph, the reason for every lens, and
seat coverage against your crew, then stops. Adopting it is a separate, explicit
step: export the derived YAML and import it, the same path any shared Flow takes.
See the Flows CLI reference for the exact invocations.

The coverage check is worth reading before you adopt. A seat reported as
`ambiguous` means two roles in your crew can fill it, and the run will need
`--seat-role` to disambiguate - cheaper to learn here than eight minutes into a
run.
