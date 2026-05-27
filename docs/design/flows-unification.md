# Default flow — unify roles + flows (D2, design-first)

## Decision

There is **no separate "default roles" concept.** The fixed plan→build→verify
workflow becomes the built-in **default flow**, and roles are the seats *inside*
a flow. This removes the duplication between today's two ways of saying "who
does what, in what order":

- the implicit **default workflow** (config `roles:` + a hardcoded sequence in
  `orchestrator.run()`), and
- **Flows** (a recipe with its own `slots` + ordered `steps` + approval gates,
  run by `runFlowSequence()`).

After: **one concept — a Flow.** A flow has steps; each step is performed by a
**role** (a seat) bound to a **provider**. The default flow is just the
built-in one that runs when you don't pick another.

> Naming: **Flow → Flow.** "Flow Builder" already edits these, so the term is
> half-adopted; this *reduces* concepts (Flow/Flow/slot/role → Flow/role).

## Why it's feasible

The flow schema already carries what the default workflow needs:

- `steps[]` with a `kind` (incl. `approval-gate`) — the phases.
- `repeat` (bounded) — the **review→fix loop**.
- `slots` whose `defaultRole` is a role id — roles already live inside the
  recipe.

So the default workflow is expressible as a flow definition. What's *not*
trivial is merging the two runners.

## Two execution paths (the real work)

- `orchestrator.run()` — the fixed workflow: validation phases as ground truth,
  the review→fix loop, spend-cap enforcement, rewind, per-stage approval gates.
  Heavily tested.
- `orchestrator.runFlowSequence()` — a simpler linear step runner.

Fully unifying these (one runner that executes any flow, default included) is
the deep, risky part — the default workflow's control flow + validation +
spend-cap + rewind all live in `run()`.

## Phased plan

**Phase A — model + vocab + UI (lower risk).** Rename Flow→Flow. Ship the
default workflow as the built-in **"Default" flow** in the Flows catalog so the
UI shows *one* list of flows (default + quality-arbitration + …). Crew shows
"the Default flow's roles." Under the hood the default flow still runs through
`run()`; other flows through the flow runner. Config `roles:` stays as the
default flow's role→provider bindings. This **resolves the duplication
conceptually and in the UI** without merging runners.

**Phase B — runner unification (later).** Express the default workflow as an
actual flow definition executed by a single runner (steps + `repeat` loop +
approval gates + validation). Retire the `run()` / `runFlowSequence()` split.
Big; correctness-sensitive; do it on its own once Phase A lands.

## Migration

Pre-release (per project policy): clean change, no back-compat. `roles:` either
stays as the default flow's bindings or moves under a `flows.default` block —
decided when Phase A is built.

## Open question for Phase A

Does `roles:` stay a top-level config block (bindings for the default flow), or
move under the flow definition? Leaning: **keep `roles:` as the default flow's
bindings** (least churn; Crew already edits it), and treat the default flow as a
built-in whose roles you configure there.
