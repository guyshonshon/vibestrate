# Runner unification (D2 phase B) — one runner

> Companion to [`flows-unification.md`](./flows-unification.md) (the original A/B
> decision). This is the current-state record. Process rules live in
> [`CLAUDE.md`](../../CLAUDE.md); product behavior in [`docs/content/`](../content).

## Status: shipped

**Amaco has one execution model.** There is no longer a separate "default
workflow runner" and "flow runner". Every run executes a **flow** through one
runner (`Orchestrator.runFlowSequence`):

```
Flow → Steps → Role (seat) → Provider
```

- A plain `amaco run` resolves the built-in **`default` flow** and runs it
  through the flow runner.
- `amaco run --flow default` runs the same flow explicitly.
- `amaco run --flow <custom>` runs any other flow through the same runner.

The hardcoded `Orchestrator.run()` **runner body** (the plan→build→verify
sequence) was deleted; `run()` remains only as the public entry point that
delegates to the unified flow runner — preflight + worktree + state setup, then
it resolves the flow (explicit or `default`) and calls `runFlowSequence`. There
is no second execution engine.

## How it works

### The default flow

The built-in `default` flow (`src/flows/catalog/builtin-flows.ts`) is the fixed
workflow expressed as a real flow:

```
plan (planner)
  → architecture (architect)
  → implement (executor)            ← skipWhenReadOnly
  → validate                        ← skipWhenReadOnly
  → review (reviewer) ──┐
       │ APPROVED        │ CHANGES_REQUESTED      (adaptive loop, ≤ maxIterations)
       ▼                 ▼
   verify (verifier)   fix (fixer) → re-validate → review …   ← skipWhenReadOnly
       │
       ▼
   merge_ready / blocked
```

Roles map 1:1 to slots, so the config `roles:` block is the default flow's
role→provider binding. Editing/forking it works like any other flow.

### Step metadata that drives behavior

A flow declares its behavior **explicitly in the definition** rather than the
runner hardcoding role names. Three first-class step fields:

- **`loop`** (flow-level): the adaptive review→fix→re-validate cycle. `from`..`to`
  is the body; `decisionStep` (a review-turn) gates re-entry — after it runs, the
  runner exits past `to` when the review isn't `CHANGES_REQUESTED` or the
  iteration budget is spent, else finishes the body and jumps back to `from`. A
  head-positioned gate lets an early `APPROVED` skip the rest of the body.
- **`skipWhenReadOnly`**: a read-only (investigation-only) run skips these steps
  (executor/validation/fix/verify), traverses the loop once without re-entering,
  and decides on the review alone (`APPROVED → merge_ready`,
  `CHANGES_REQUESTED → blocked`). No verification is produced.
- **`stage`** (`planning|architecting|executing|reviewing|verifying`): the coarse
  phase, used as the **resume boundary** and to make the run status + policy
  approvals accurate (e.g. the architect turn is `architecting`).

### Resume / rewind (native to the flow runner)

`amaco run --resume-from <runId> [--resume-stage planning|architecting|executing]`
is handled inside the flow runner — no delegation to a separate path:

1. Find the first step whose `stage` matches the resume stage (fails clearly if
   the flow has no step at that stage).
2. Seed the **outputs** of every step before it from the source run's artifacts
   (copying them into the new run), and mark those steps **skipped (resume)** in
   the ledger — visible, not invisible.
3. Start the walk at the boundary step.

`planning` seeds nothing (a normal from-scratch run). `--resume-from` may be
combined with `--flow`.

### Everything runs through the one runner

Approvals (agent + per-phase policy), pause gates, spend-cap enforcement,
validation-as-ground-truth, the adaptive loop, read-only skipping, abort/blocked
handling, and the final report are all in the flow runner. The final report's
review-loop count reflects the real number of fix cycles
(`flow.loop.iteration` / `flow.loop.decision` events back it).

## Latent bugs this surfaced (and fixed)

Building the first orchestrator-level read-only and resume e2e tests exposed
real bugs that never had coverage:

- Read-only runs forced a `readOnly` permission profile the templates never ship
  (they ship `read_only`) → now forces the built-in `read_only`.
- The state machine forbade transitions a real run needs once phases are driven
  by step `stage` (`reviewing → merge_ready` for read-only-approved;
  `created`/`planning`/`waiting_for_approval` → `architecting`;
  `architecting → executing`). All added.

## Key files

- `src/core/orchestrator.ts` — `run()` (entry), `runFlowSequence` (the runner),
  `seedResumedSteps` (resume), `resolveDefaultFlow`.
- `src/flows/catalog/builtin-flows.ts` — the `default` flow (+ `quality-arbitration`).
- `src/flows/schemas/flow-schema.ts` — `loop`, `skipWhenReadOnly`, `stage`.
- `src/core/run-launcher.ts` — `resolveResumeFrom` (validates the source run).
- `src/core/state-machine.ts` — phase transition table.

## Tests

`tests/orchestrator-{approval,policy-approval,spend-cap,rewind}.test.ts` (now
exercise the default flow through the runner) and `tests/flows/{default-flow-run,
flow-adaptive-loop,default-flow}.test.ts` cover: plain run resolves `default`;
`--flow default` and custom flows; approved / changes-then-approved / max-loop /
validation-failure verdicts; read-only (approved, changes, no infinite loop);
policy + pause gates; spend cap; resume from planning/architecting/executing;
report loop count; skipped-on-resume steps in the ledger.

## Compatibility

Pre-production: there is **no back-compat for pre-unification runs**. The runner
reads flow-shaped artifacts (`flows/<step>/output.md`); the old `02-plan.md` /
`04-architecture.md` scheme is not read anywhere, and `resolveResumeFrom` only
validates that a source run exists. Old runs are treated as never having existed.

## Resume support (current limits)

Resume targets the stages with a clean seed boundary: **`planning`,
`architecting`, `executing`**. `reviewing` / `verifying` are intentionally **not**
resumable — they need the executor's code present, and Amaco doesn't snapshot the
per-step worktree yet. The CLI and `--resume-stage` schema reject other values
with a clear message.

## Follow-ups (out of scope, not blocking)

- Resume from `reviewing`/`verifying` (needs a per-step code/worktree snapshot).
- Per-stage worktree snapshots so resume can reuse the executor's code.
