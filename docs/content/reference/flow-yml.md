---
title: Flow YAML, annotated
description: The Default flow written out as the YAML you would author, with every field explained where it appears.
slug: reference/flow-yml
---

## In simple words

A [[flow]] is a recipe: an ordered list of steps, each naming the *kind* of worker it needs rather than a model. This page is the built-in `default` flow as the file you would author, with a comment on every field.

A project flow is a **directory** under `.vibestrate/flows/` holding a `flow.yml` (or `flow.yaml`) - `.vibestrate/flows/spike-and-decide/flow.yml`. A loose `.yml` sitting directly in `.vibestrate/flows/` is skipped, not read, and a project flow whose `id` matches a built-in shadows it, which is what forking does.

<div class="docs-callout tip">

**Tip.** The Flow Builder in the dashboard edits this YAML with the schema enforced as you type - **Edit as YAML** in the flow's menu opens the raw file, **Form view** goes back. To start from a real file, `vibe flows export default` prints the flow below to stdout.

</div>

## The whole thing, commented

```yaml
# The flow's own id. Unique across built-ins and project flows - a project flow
# shadows a built-in of the same id, which is how you fork one. Name the
# directory after it; two project flows claiming one id is a load error.
id: default

# Bump when you change the shape in a way older runs should not be replayed
# against. Any positive integer; Vibestrate records it on every run.
version: 1

# What a person sees in `vibe flows list` and on the Flows page.
label: Default
description: >-
  The standard plan → architect → implement → validate → review workflow.
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
# How this flow describes itself. Never a promise about behaviour.
complexity: high            # low | medium | high. Read on EVERY run, not only
                            # an auto-picked one: the run warns when the flow
                            # looks heavier than the task, whatever chose it.
capabilities:               # read only when Vibestrate is choosing a flow for
                            # you (no --flow, and `defaultFlow` unset)
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

**Did you know?** Seats are checked against the steps that use them before a run starts, so a step naming a seat the flow never declared is a load error rather than a mid-run surprise. `inputs` and `outputs` get no such cross-check: a step consuming `plan` when nothing produces it still loads, and at runtime that token arrives marked unavailable and the turn runs without it - so this one costs you the model call.

</div>

## Step kinds

Four kinds seat an AI. The other two are machinery and need no `seat`.

<div class="docs-cards">

**`agent-turn`**
Produces work. The implementer and the planner are both this.

**`review-turn`**
The only kind that can emit `review-decision`, so the only kind a `loop` can hang off.

<div class="docs-callout warn">

**Declare `review-decision` in its `outputs`, or the verdict is ignored.** A run reads the reviewer's `DECISION:` line only off a step that declares `review-decision` (or `finding-resolutions`). Name the output something else - `review` is the obvious guess - and the line is never read: the verdict keeps its fail-closed `BLOCKED` default, so the run ends blocked no matter what the reviewer decided, with an `APPROVED` artifact sitting in the run folder saying otherwise. Nothing warns you. A panel is the one exception: its branches emit findings under different lenses and a `summary-turn` arbiter settles it.

</div>

**`response-turn`**
Answers findings. Given what the reviewer said, not asked to start over.

**`summary-turn`**
The closing verdict. Reads everything and decides.

**`validation`**
Runs your own `commands.validate` in the worktree. No model.

**`approval-gate`**
Stops and waits for you. No model.

</div>

## Optional fields worth knowing

| Field | What it does |
|---|---|
| `instructions` | A step-specific line injected into that step's prompt, so two steps can share one seat and take different lenses - correctness on one, security on the other - without inventing a role. |
| `optional` | The step may be skipped without failing the run. |
| `cleanRoom` | This seat does not receive the run's narrative, so a judge reasons without anchoring to how the producer framed it. Ground truth stays: the spec, your annotations, declared `inputs`. |
| `skills` | Skill ids attached to this step's prompt only, merged with the role's own. |
| `approval` | Turns the step into a gate: `{ reason, requestedAction, userMessage, riskLevel }`. `riskLevel` defaults to `medium`. |
| `repeat` | Run this step `times` (2-8) in parallel, for a panel. |
| `skipWhen` | Skip a *checking* step on positive evidence of absence in the real diff - `inert_diff` when the change is prose only. Never on a step that produces work: skipping that on diff evidence is circular. |

## Graph flows

A flow whose steps declare `needs` opts into graph mode: `needs` is the real dependency edge, and the array order only has to be a valid topological sort. Steps sharing a `needs` set may run concurrently, and a step listing them all is the join. Only read-only seated turns qualify - the resolver refuses a parallel group holding a validation step, an approval gate, or a role whose permission profile can write, since one worktree takes one writer. A wave is capped at four steps.

Two fields apply only there: `continueOnError` keeps one dead sibling from taking the fan-out down, and `retries` (0-5) covers a flaky turn. Control signals - abort, approval, spend cap, denied - are never retried and always propagate.

## Parameters

`params` declares answers a flow needs, asked once and reused. `type` is the only field a param must carry; the rest are optional: a `description`, `required` (false unless you say otherwise), a `default`, a closed `values` list for `type: enum`, `secret` to keep the value out of artifacts, `shared` to reuse the project-level answer, and `generate` to offer a drafted suggestion you review before use. More in [Project parameters](/docs/concepts/project-params).

## Where you edit this

The **Flows** page lists every flow it found, and **Open** on a card lands in the Flow Builder - see [Flow](/docs/concepts/flow) for the editor in full. `vibe shell` carries the same catalog, where `f` forks the selected built-in and `h` opens the hub.

## From the CLI

```bash
vibe flows list                  # built-in and project flows
vibe flows show default          # seats, steps, and whether your crew covers them
vibe flows export default        # the canonical YAML, to stdout
vibe flows import <file-or-url>  # validated on the way in; refused if malformed
```

There is no separate validate command: a flow is checked when written and when read, and one that fails the schema is reported as unloadable in `vibe flows list` and on the Flows page, with the rest of the catalog still loading.

The schema lives in `src/flows/schemas/flow-schema.ts`, and [Built-in Flows](/docs/reference/flows) lists every flow that ships.

Next: [the crew configuration](/docs/reference/crew-config) is who fills these seats.
