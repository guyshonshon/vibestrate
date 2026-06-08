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

## A built-in graph flow: `panel-review`

Most Flows are a linear list of steps. A Flow can also declare a **dependency
graph**: a step lists the steps it `needs`, and steps that share the same
`needs` run **concurrently**. `panel-review` is the first such flow:

1. **plan -> architect -> implement -> validate** - the usual spine.
2. **review-correctness · review-tests · review-risk** - three read-only
   reviewers inspect the *same* diff and validation evidence from distinct lenses
   (`needs: [validation]` on all three, so they fan out **in parallel**).
3. **arbiter** - `needs` all three reviewers, reads their findings, and renders
   one verdict (the join).

Two rules keep fan-out safe, both enforced in code (not by prompt):

- **Read-only only.** Every step in a parallel group must resolve to a read-only
  role - a panel of writers is refused before the run starts (one writer per
  worktree). The reviewers share the read-only `reviewer` seat.
- **Bounded + costed.** Group width is capped, and `vibe run` / `POST /api/runs`
  print a fan-out warning ("runs N agents in parallel; each may itself
  parallelize, so real spend can exceed the estimate").

**Resilient fan-out (continue-past-failure).** The three reviewers are
**best-effort** (`continueOnError`): if one lens's provider fails or errors out,
that step is marked `failed` and recorded (an event + a FAILED line in the run
brief), and the arbiter still renders a verdict from the surviving lenses - one
flaky reviewer doesn't sink the whole panel. Control signals (a user abort, an
approval rejection, the spend cap) and required (non-best-effort) steps still
stop the run. `continueOnError` is a graph-flow, turn-step flag, validated at
load time.

**Retries.** A graph-flow turn can also declare `retries: N` (0-5). A flaky
turn that fails or errors is re-run up to N more times before its outcome is
final - so a transient hiccup is recovered rather than recorded as a failure.
Retries run *before* `continueOnError` decides, so the two compose (retry first,
then tolerate-or-abort). Control signals are never retried, and each attempt is
a real provider call, so its cost shows up in the metrics. Every retry emits a
`flow.step.retried` event.

The orchestrator picks `panel-review` only when a task warrants the extra spend
(security-sensitive, broad/architectural, low validation confidence, or you ask).
There's no fix loop here yet - the panel surfaces a verdict + findings; combining
a graph with the adaptive review->fix loop is deferred. See the
[custom workflow DAGs design](https://github.com/guyshonshon/vibestrate) note for
the roadmap (write-parallelism stays deferred).

## A graph inside the per-item band: `pickup-analysis`

A graph can also live **inside the per-item band** of a checklist pick-up, so
each checklist item runs as a mini-DAG instead of a straight line. The built-in
`pickup-analysis` works a card item-by-item, and for each item two read-only
**analysts** (risk/impact + test-surface) study it **in parallel** before the
implementer writes that item - "think in parallel, then build", a commit per
item. The analysts are read-only (one writer per worktree) and best-effort (one
failing lens doesn't sink the item); a read-only or instant (N=1) run still fans
them out. The graph must stay confined to the band - the holistic plan (before)
and review (after) run once and stay linear. (A per-item *review* panel is a
planned follow-up.)

**Seeing the graph.** A graph flow renders the same way on every surface: a
top-down layout where dependency layers stack vertically and a concurrent
fan-out is drawn as a boxed `parallel ×N` group with the join below it. You get
it in the dashboard (the Flow Builder and, status-tinted, live on run detail),
in the terminal shell's Flow page, and as a `needs` annotation plus a "Parallel
groups" section from `vibe flows show`. One shared layout module backs all
three, so they stay in lockstep. A checklist + graph flow is zoned into
prelude -> per-item band (marked as repeating) -> postlude, so the iteration is
visible alongside the fan-out.

**Editing the source.** The Flow Builder has an "Edit as YAML" toggle: flip
between the structured editor + architecture graph and the flow's raw YAML, then
save (built-in flows are view-only until you fork them into the project). Saving
runs the same validation + secret/size guards as importing a flow file.

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

## Which Flow a run uses (always shown)

Every run resolves a Flow and **shows it** - the CLI prints `Flow: <name> · <source>`
before it starts, so the choice is never hidden. The precedence:

1. **`--flow <id>`** - forced for this one run.
2. **The default/session Flow** - set it with `vibe flows use <id>` (stored as
   `defaultFlow` in config). Applied to every run that doesn't pass `--flow`.
   Clear it with `vibe flows use --clear`.
3. **Orchestrator selection** - opt in with `vibe run "..." --select` and the
   responsible orchestrator picks the Flow for the task (read-only, broker-gated;
   it states a confidence + reasons + risks, may recommend a **crew** and an
   execution **posture**, and records `selection.json` + a `workflow.selected`
   event on the run - surfaced as a **Flow &amp; why** card on run detail).
   Without `--select`, no model call is made.
4. Otherwise the built-in **`default`** Flow.

### Flow capabilities (selection metadata)

A Flow may declare a small `capabilities` block so the orchestrator can choose it
well - it is selection metadata, not a second workflow language:

```yaml
capabilities:
  taskKinds: [feature, refactor, bugfix]
  strengths: [security, architecture, risk]
  costClass: high      # relative spend weight
  latencyClass: high
  requires: { validation: true }
```

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
