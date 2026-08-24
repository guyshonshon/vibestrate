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
  plan                 -> planner
  architecture         -> architect
  implement-migrate    -> implementer   (schema change, isolated)
  implement-endpoint   -> implementer
  implement-seats      -> implementer
  validation           -> your commands
  review-correctness   -> reviewer      (the `money` tag aims the correctness lens)
  fix                  -> fixer
  revalidation         -> your commands
  verify               -> verifier
```

Read the order: validation waits for every unit step, and every review lens waits
for validation. `plan`, `architecture`, `fix`, `revalidation` and `verify` are
emitted whatever the task looks like.

<div class="docs-callout tip">

**Tip.** Deriving is the one flow surface with no dashboard control. It is a terminal command that **writes nothing**: it prints a flow for you to read, and adopting it is the **Import** button on the dashboard's Flows page. Treat the output as a proposal from something that read your task, not as a decision already made.

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

### Deriving one, and adopting it

Two commands and one button. `vibe flows derive "<task>"` prints the units, the
compiled graph, the reason for every lens, and seat coverage against your crew,
then stops.

```bash
vibe flows derive "add team billing" --id billing --yaml > billing.yml
vibe flows import billing.yml
```

`--yaml` is the canonical flow document, `--json` the whole draft including the
shaping turn's rationale. `--crew <id>` checks coverage against a specific crew.

The adopt step also lives on the dashboard: **Flows** in the sidebar, then
**Import**, which takes **Paste YAML** or **From URL** and has an overwrite
checkbox for a project flow of the same id. After that it is an ordinary project
flow - in the catalog, in the flow editor, and selectable under **Flow** on the
**New run** form.

Read the coverage check before adopting. A seat reported as `ambiguous` means two
roles in your crew can fill it, and the run will need `--seat-role` to
disambiguate. Cheaper to learn here than eight minutes into a run.

### The model describes, it does not design

A shaping turn returns a **decomposition**, not a flow: the units of work, what
each one depends on, and what each one is risky about. Deterministic code turns
that into the graph.

That split is the safety property, the same reasoning that makes a `block` policy
owner-only. Every step id, every `needs` edge and every review lens is computed,
so a model influences *what* gets reviewed only through a closed vocabulary, and
can never remove a gate, reorder one, or write a step that renders its own
verdict. A poor decomposition produces a flow that is wrong-but-gated, never one
that is ungated.

### What a fixed flow cannot answer

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

That is what makes a speculative tag cheap: an `auth` tag on code that turns out
to have no permission check costs nothing, instead of a turn spent confirming an
absence.

**Skipping requires positive evidence of absence.** An unreadable diff, an empty
change set, or a read-only run all RUN the step. A wrong call can only ever cause
more review, never less - the only safe direction for a mechanism whose whole job
is deciding when a review does not happen.

The patterns are deliberately broad and deliberately not configurable.
Broadening them is harmless; narrowing them silently weakens a gate, and a config
file is the wrong place to disarm a review. The control surface is
`--flow-force <step>` on `vibe run`, which forces a step to run whatever its
condition says.

`--flow-skip <step>` is its counterpart, and it is narrower than it sounds: a
step can only be skipped where the flow's author marked it `optional`, and a
derived flow marks none of its lenses optional. So no flag on the command line
turns a derived review off - the resolver refuses the step by name. The switch
does have somewhere to bite: the built-in **Quality Arbitration** flow declares
its plan-review step optional, and `--flow-skip plan-review` drops that one.

### Decomposition is not free

Each unit is a separate model turn on the same worktree, and they run one after
another, so the implementation spend scales with the number of units. Splitting
one cohesive change into eight buys eight turns and improves nothing.

Measured on a small CRUD app: an eight-unit decomposition cost **2.6 times the
implementation spend** of the same app built in one turn, and scored slightly
worse. More expensive, and no better. That measurement is written into the
shaping turn's own prompt, so the model doing the splitting has been shown what
splitting costs.

The derive output says how many implement steps it split into, and at four or
more it adds a `COST:` line spelling out the multiplier. `--max-units <n>` is the
hard stop.
