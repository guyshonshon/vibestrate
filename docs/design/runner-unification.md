# Runner unification (D2 phase B) — context, current state, design, plan

> Companion to [`flows-unification.md`](./flows-unification.md), which holds the
> original A/B decision. This doc is the **deeper, current-state** record: what
> exists today, the decisions made so far, the new design constructs, the
> latent bugs surfaced, and the remaining plan. Process rules live in
> [`CLAUDE.md`](../../CLAUDE.md); product behavior in [`docs/content/`](../content).

## The goal

**One concept, one runner.** Today Amaco has two ways to say "who does what, in
what order," each with its own executor:

- the **default workflow** — config `roles:` + a hardcoded plan→build→verify
  sequence in `orchestrator.run()`, and
- **Flows** — a recipe (`slots` + ordered `steps` + gates) run by
  `orchestrator.runFlowSequence()`.

The end state: **a Flow is the only concept.** A flow has steps; each step is
performed by a **role** (a seat) bound to a **provider**. The default workflow
becomes the built-in **`default` flow**, executed by the **same runner** as
every other flow. `run()` is deleted. A plain `amaco run` resolves the `default`
flow and runs it through `runFlowSequence`.

Why: the two paths duplicate intent, drift apart, and double the surface to
test and reason about. Unifying removes a whole class of "works in one runner,
not the other" bugs (we already found two — see below) and makes the default
workflow inspectable, forkable, and editable like any other flow.

## Current flow (as of this branch)

### The default workflow, as `run()` executes it

```
plan (planner)
  → architecture (architect)
  → implement (executor)            ← skipped on read-only runs
  → validate                        ← skipped on read-only runs
  → review (reviewer) ──┐
       │ APPROVED        │ CHANGES_REQUESTED (bounded by workflow.maxReviewLoops, default 2)
       ▼                 ▼
   verify (verifier)   fix (fixer) → re-validate → review …   ← skipped on read-only
       │
       ▼
   merge_ready / blocked
```

`run()` (`src/core/orchestrator.ts`) owns: the fixed stage sequence, the bounded
review→fix loop, per-stage **policy approval gates**, **pause** gates between
stages, **rewind/resume** (seed plan/architecture, skip upstream stages),
**read-only** handling (skip executor + fix + validation + verify), **spend-cap**
enforcement, and the final report. It is the heavily-tested ground truth.

### The flow runner, as `runFlowSequence()` executes it

A resolved flow snapshot is a list of `steps`, each with a `kind`
(`agent-turn`, `review-turn`, `response-turn`, `validation`, `approval-gate`,
`summary-turn`), a `slot`/`roleId`, and `inputs`/`outputs` tokens. The runner
walks the steps, building a context packet per step, running the role via the
shared `runRole` (so **spend-cap**, provider resolution, permission profiles are
shared), recording a participant ledger + arbitration ledger, and handling
**pause** and **policy approvals** per step. The final transition reads the last
review decision + verification decision + validation result.

Both paths share `runRole`, `maybeAwaitApproval`, `applyPauseIfRequested`,
validation, and the final-report writer — so spend-cap, approvals, and pause are
**not** parity gaps. The gaps are the loop, read-only, and rewind (below).

## Decisions made (and the principle behind them)

**Principle: a flow declares its behavior explicitly in the definition, rather
than the runner hardcoding role names or inferring from heuristics.** This keeps
the runner generic and the definition self-documenting. Applied to loops
(`loop`), to read-only (`skipWhenReadOnly`), and proposed for resume (`stage`).

| Phase | Decision | Where |
|---|---|---|
| A-1 | Rename Guide → Flow across code/config/API/UI/CLI/docs | `865dcb6` (main) |
| A-2 | Surface the default workflow as a display card on the Flows page | `9038705` (main) |
| B-1 | **Adaptive-loop construct** in the flow schema + resolved snapshot | `8b1844f`,`5d81560` (main) |
| B-2 | Author the **`defaultFlow`** definition using the loop | `3ec4b0e` (main) |
| B-3a | The flow runner **executes** adaptive loops | `953adea` (branch) |
| B-3b | `defaultFlow` is a **catalog entry**; Flows UI sourced from the real definition | `44bbbf6` (branch) |
| B-3c-i | **Read-only parity** in the flow runner (`skipWhenReadOnly`) | `3326f2a` (branch) |

Branch: `feat/d2-b3-unify-runners` (local, not pushed). Phases A, B-1, B-2 are on `main`.

## New design constructs

### 1. Adaptive loop (`loop`) — the review→fix→re-validate cycle

The fixed `repeat: { times }` couldn't express "re-run until a review stops
asking for changes, up to a bound." The `loop` is that decision contract:

```ts
loop: { from, to, decisionStep, maxIterations }
```

- `from`..`to` is a contiguous body of steps; `decisionStep` (a review-turn
  inside it) gates re-entry.
- **Runner semantics** (`runFlowSequence`): run the body in order. After the
  `decisionStep` runs, **exit past `to`** when its review isn't
  `CHANGES_REQUESTED` or the iteration budget is spent; otherwise finish the
  body and **jump back to `from`**.
- The gate can sit at the **head** of the body (`from === decisionStep`), so an
  early `APPROVED` skips the rest of the body (the default flow's `fix`) — this
  mirrors `run()`'s review-first loop, where the first review can approve and
  skip every fix.
- Schema-validated: `decisionStep` must be a review-turn inside `from..to`;
  loop-body steps can't also carry a fixed `repeat`.
- Events: `flow.loop.iteration`, `flow.loop.decision`.

The default flow uses `loop: { from: review, to: revalidation, decisionStep:
review, maxIterations: 3 }` (3 = the initial review + the default
`workflow.maxReviewLoops` of 2 fix cycles).

### 2. `skipWhenReadOnly` — read-only (investigation-only) runs

A read-only run analyzes but never writes code. `run()` handles this by skipping
the executor, fix loop, validation, and verify. To express that in a flow, each
step carries `skipWhenReadOnly: boolean`. The default flow marks
`implement`, `validation`, `fix`, `revalidation`, `verify`.

Runner behavior on a read-only run:
- Skip flagged steps (status `skipped`, `flow.step.skipped` with `readOnly: true`).
- Traverse the loop body **once** and **never loop back** (re-running would just
  repeat the same review — there's no fix to apply).
- Decide on the review alone: `APPROVED → merge_ready`, `CHANGES_REQUESTED → blocked`.
  No verification decision is produced, so an APPROVED review reaches
  `merge_ready` directly — matching `run()`.

### 3. `stage` tag (proposed, for B-3c-ii rewind)

`run()`'s rewind/resume is **stage**-based (`planning`/`architecting`/
`executing`): seed the upstream artifacts, skip the upstream stages, start at
the resume point. Flows are **step**-based. **Proposed:** an optional `stage`
tag on flow steps (`plan→planning`, `architecture→architecting`,
`implement→executing`) so the runner can map a resume point onto steps
generically — seed the resumed steps' outputs and start the walk after them —
without hardcoding step ids. (Open: see below.)

## Latent bugs surfaced (and fixed) by building the first read-only e2e test

No orchestrator-level read-only e2e test existed before B-3c-i, so two real
bugs in `run()`'s read-only path had never executed:

1. **Wrong permission-profile name.** Read-only runs forced a profile named
   `readOnly`, but the default templates and builtins ship `read_only`
   (snake_case). On any real project this threw "Unknown permission profile:
   readOnly" at the first role. Fixed by forcing the built-in `read_only`
   (always resolvable via the builtin fallback).
2. **Missing state transition.** `reviewing → merge_ready` was not allowed, but
   `run()`'s read-only-approved path (which skips verification) needs it. Allowed it.

Both fixes benefit `run()` today, independent of the unification.

## Parity matrix — `run()` vs. the flow runner

| Capability | `run()` | flow runner | Notes |
|---|---|---|---|
| Stage/step sequence | ✅ | ✅ | |
| Bounded review→fix loop | ✅ | ✅ (B-3a) | |
| Per-stage policy approvals | ✅ | ✅ | shared `maybeAwaitApproval` |
| Pause between steps | ✅ | ✅ | shared `applyPauseIfRequested` |
| Spend-cap | ✅ | ✅ | shared `runRole` |
| Validation as ground truth | ✅ | ✅ | minor: final-decision wiring differs slightly |
| Read-only skipping | ✅ | ✅ (B-3c-i) | via `skipWhenReadOnly` |
| **Rewind / resume** | ✅ | ❌ | `--resume-from` is disallowed with `--flow` — **B-3c-ii** |
| Final-report loop count | ✅ | ⚠️ | flow report hardcodes `reviewLoops: 0` — cleanup |

## Remaining plan

- **B-3c-ii — rewind parity.** Add resume to the flow runner. Decide the
  resume↔step mapping (recommended: the `stage` tag above). Seed upstream step
  outputs, mark them skipped, start the walk at the resume point. Lift the
  `--flow` + `--resume-from` restriction. Also fix the final-report loop count.
- **B-3c-iii — the merge.** Flip routing so a plain `amaco run` (no `--flow`)
  resolves the `default` flow and runs it through `runFlowSequence`. Delete
  `run()` (~700 lines) and migrate the `orchestrator-*.test.ts` suites
  (approval / policy-approval / rewind / spend-cap) onto the unified path.
  **Highest blast radius** — changes behavior for every run and removes the
  most-tested code path. Review-gate this.

## Open questions

- **Resume mapping.** Is the `stage` tag the right abstraction, or should resume
  stay a default-flow-only concept keyed off well-known step ids? The tag keeps
  the runner generic but adds schema surface only the default flow uses today.
- **Implicit-default routing.** When no flow is picked, resolve `default` at the
  CLI/orchestrator boundary, or have the orchestrator default `this.flow` to the
  resolved default flow? The latter centralizes it but touches the constructor.
- **Forking `default`.** Forking the default flow to a project copy is allowed
  today but, pre-B-3c-iii, editing it does **not** change a plain `amaco run`
  (still `run()`). After B-3c-iii it would. Surface this in the UI when it matters.

## Status summary

- **On `main`:** A-1, A-2, B-1, B-2.
- **On `feat/d2-b3-unify-runners` (local):** B-3a, B-3b, B-3c-i. Additive and
  safe — nothing yet changes a plain `amaco run`. `--flow default` runs the full
  workflow (incl. the loop and read-only behavior) through the unified runner.
- **Next:** B-3c-ii (rewind), then B-3c-iii (flip + delete `run()`).
