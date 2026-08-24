---
title: Flow YAML, annotated
description: The Default flow written out as the YAML you would author, with every field explained where it appears.
slug: reference/flow-yml
---

## In simple words

A [[flow]] is a recipe: an ordered list of steps, each naming the *kind* of worker it needs rather than a model. This page is the built-in `default` flow written out as the file you would author, with a comment on every field.

Project flows live in `.vibestrate/flows/<id>.yml`. Drop a file there and `vibe flows list` picks it up; a project flow whose id matches a built-in one replaces it.

<div class="docs-callout tip">

**Tip.** Do not start from a blank file. `vibe flows show default --yaml` prints a real flow you can redirect into `.vibestrate/flows/`, and the Flow Builder in the dashboard edits the same YAML with the schema enforced as you type.

</div>

## The whole thing, commented

```yaml
# The flow's own id. Must match the filename (`default.yml`) and be unique
# across built-ins and project flows - a project flow shadows a built-in of the
# same id, which is how you fork one.
id: default

# Bump when you change the shape in a way older runs should not be replayed
# against. Any positive integer; Vibestrate records it on every run.
version: 1

# What a person sees in `vibe flows list` and on the Flows page.
label: Default
description: >-
  The standard plan -> architect -> implement -> validate -> review workflow.
  Review loops back to fix and re-validate until it passes or the bound is hit,
  then a verify gate decides merge-readiness.

# ── Seats ────────────────────────────────────────────────────────────────
# The empty chairs this flow needs filled. A seat is a LABEL, never a model -
# that is what makes a flow portable: download someone else's flow and it runs
# on your models, at your budget, unedited. Your crew decides who sits down.
seats:
  planner:
    label: Planner                       # shown in the UI
    description: Turns the task into a plan.   # optional, <=400 chars
  architect:
    label: Architect
    description: Designs the approach from the plan.
  implementer:
    label: Implementer
    description: Implements the plan and architecture.
  reviewer:
    label: Reviewer
    description: Reviews the diff and decides whether changes are needed.
  fixer:
    label: Fixer
    description: Addresses review findings.
  verifier:
    label: Verifier
    description: Independently verifies the approved result.

# ── Steps ────────────────────────────────────────────────────────────────
# Executed in order. At least one is required.
steps:
  - id: plan                # unique within the flow; used by `needs` and `loop`
    label: Plan             # shown on the run timeline
    kind: agent-turn        # see "Step kinds" below
    seat: planner           # which chair takes this step; omit for non-AI steps
    stage: planning         # coarse phase, and the boundary `--resume-stage` uses
    inputs: [task-brief]    # what this step is given
    outputs: [plan]         # what it must produce, for later steps to consume

  - id: architecture
    label: Architecture
    kind: agent-turn
    seat: architect
    stage: architecting
    inputs: [task-brief, plan]
    outputs: [architecture]

  - id: implement
    label: Implement
    kind: agent-turn
    seat: implementer
    stage: executing
    inputs: [task-brief, plan, architecture]
    outputs: [execution, diff]
    # Skipped on a read-only run. Mark every step that writes code, or that only
    # means anything once code changed.
    skipWhenReadOnly: true

  - id: validation
    label: Validate
    kind: validation        # runs YOUR commands.validate - no model, no seat
    stage: executing
    inputs: [diff]
    outputs: [validation]
    skipWhenReadOnly: true

  - id: review
    label: Review
    kind: review-turn       # the only kind that can produce a review-decision
    seat: reviewer
    stage: reviewing
    inputs: [task-brief, plan, architecture, execution, validation]
    outputs: [findings, review-decision]

  - id: fix
    label: Fix
    kind: response-turn     # answers findings rather than starting fresh
    seat: fixer
    stage: executing
    inputs: [task-brief, plan, architecture, execution, findings, validation]
    outputs: [finding-responses, diff]
    skipWhenReadOnly: true

  - id: revalidation
    label: Re-validate
    kind: validation
    stage: executing
    inputs: [diff]
    outputs: [validation]
    skipWhenReadOnly: true

  - id: verify
    label: Verify
    kind: summary-turn      # the last look; produces the verification verdict
    seat: verifier
    stage: verifying
    inputs: [task-brief, plan, architecture, execution, findings, validation]
    outputs: [verification]
    skipWhenReadOnly: true

# ── The loop ─────────────────────────────────────────────────────────────
# Re-run a contiguous body of steps while a review keeps asking for changes.
# This is why a run can pass on its second attempt without you doing anything.
loop:
  from: review              # first step of the body
  to: revalidation          # last step of the body
  decisionStep: review      # whose CHANGES_REQUESTED restarts it
  maxIterations: 3          # hard bound; 1-8

# ── Selection hints ──────────────────────────────────────────────────────
# Read only when Vibestrate is choosing a flow for you (no --flow, and
# `defaultFlow` unset). Never a promise about behaviour - just how this flow
# describes itself to the picker.
complexity: high            # low | medium | high
capabilities:
  taskKinds: [feature, bugfix, refactor, chore, docs]
  strengths: [general, implementation]
  costClass: medium
  latencyClass: medium
  requires:
    validation: true        # do not pick me for a project with no test commands
  # avoids:
  #   readOnly: true        # do not pick me for an investigation-only run
```

<div class="docs-callout">

**Did you know?** `seats`, `inputs` and `outputs` are validated against each other before a run starts. A step consuming `plan` when nothing produces it is a load error, not a mid-run surprise - which is why a broken flow never costs you a model call.

</div>

## Going deeper

### Step kinds

Only four kinds seat an AI. The rest are machinery, and need no `seat`.

<div class="docs-cards">

**`agent-turn`**
Produces work. The implementer and the planner are both this.

**`review-turn`**
The only kind that can emit `review-decision`, so the only kind a `loop` can hang off.

**`response-turn`**
Answers findings. Given what the reviewer said, not asked to start over.

**`summary-turn`**
The closing verdict. Reads everything and decides.

**`validation`**
Runs your own `commands.validate` in the worktree. No model.

**`approval-gate`**
Stops and waits for you. No model.

</div>

### Optional fields worth knowing

| Field | What it does |
|---|---|
| `instructions` | A short, step-specific line injected into that step's prompt. Two steps can share one seat and take different lenses - correctness on one, security on the other - without inventing a role. |
| `optional` | The step may be skipped without failing the run. |
| `cleanRoom` | This seat does not receive the run's narrative - the brief and the story so far - so a judge reasons without anchoring to how the producer framed it. Keeps ground truth: the spec, your annotations, and declared `inputs`. |
| `skills` | Skill ids attached to this step's prompt only, merged with the role's own. Knowledge bound to a phase rather than a new top-level primitive. |
| `approval` | Turns the step into a gate: `{ reason, requestedAction, userMessage }`. |
| `repeat` | Run this step `times` (2-8) in parallel, for a panel. |
| `skipWhen` | Skip a *checking* step on positive evidence of absence in the real diff - `inert_diff` when the change is prose only. Never on a step that produces work: skipping that on diff evidence is circular. |

### Graph flows

A flow whose steps declare `needs` opts into graph mode, where `needs` is the real dependency edge and the array order only has to be a valid topological sort. Steps sharing a `needs` set may run concurrently, and a step listing them all is the join.

Two fields only apply there: `continueOnError`, so one dead sibling does not take the fan-out down, and `retries` (0-5), for a flaky turn. Control signals - abort, approval, spend cap, denied - are never retried and always propagate.

### Parameters

`params` declares answers a flow needs, asked once and reused. Each has a `description`, `required`, an optional `default`, an optional closed `values` list, `secret` to keep it out of artifacts, and `shared` to reuse the project-level answer. More in [Project parameters](/docs/concepts/project-params).

### From the CLI

```bash
vibe flows list                  # built-in and project flows
vibe flows show default          # seats, steps, and whether your crew covers them
vibe flows validate <file>       # check a flow file before you rely on it
```

The schema lives in `src/flows/schemas/flow-schema.ts`, and [Built-in Flows](/docs/reference/flows) lists every flow that ships.

Next: [the crew configuration](/docs/reference/crew-config) is who fills these seats.
