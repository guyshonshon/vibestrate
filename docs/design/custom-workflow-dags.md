# Custom workflow DAGs + parallel agents within a task (design spike)

Status: **spike / proposed** - no code yet. This answers the TODO backlog item
"Custom workflow DAGs + parallel agents within a single task (also the home for
checklist-DAG + continue-past-failure + parallel item execution)." It states
what the system does today, the hard problem, a phased design, and the decisions
worth locking before any code. Companion docs: `flows-unification.md` (one
runner), `pickup-execution.md` (the per-item band - the closest precedent), and
`roadmap-and-sequencing.md` (sequencing).

## What we have today (grounded)

A Flow is a **linear list of steps**, plus two contiguous-band specials:

- `flowDefinitionSchema.steps: FlowStep[]` - array order *is* execution order.
  Each step has `inputs: token[]` and `outputs: token[]` (artifact tokens like
  `plan`, `diff`, `validation`).
- `runFlowSequence` (orchestrator) walks `snapshot.steps` in order and keeps an
  `outputs: Map<token, FlowContextOutput>`. A step's `inputs` choose which
  prior artifacts get injected into its prompt. **So inputs/outputs already
  encode data dependencies - but they drive prompt context, not scheduling.**
- `loop {from,to,decisionStep,maxIterations}` - the adaptive review->fix loop.
- `checklistSegment {from,to}` - repeats a contiguous band once per checklist
  item (pick-up execution). Both bands are contiguous, disjoint, single-worktree,
  and traversed linearly.

Parallelism today exists **only across runs**: the scheduler runs separate tasks
in separate worktrees concurrently. *Within* a task, execution is strictly
sequential. The `integration-service` already does cumulative
`git merge --no-ff` of multiple branches into a fresh branch - that is the
machinery for combining parallel work products, and it stops on first conflict
and never pushes.

## The hard problem: writes collide, reads don't

"Parallel agents within a task" is really two very different features:

1. **Parallel read-only steps** - several reviewers, planners, or analysts over
   the *same* code, no file writes. Fan out, then join. Safe, cheap, and the
   high-value 80%: it is the "judge panel" / multi-perspective pattern applied
   inside one task. No worktree collision because nobody writes.
2. **Parallel write steps** - two executors editing files at once. In a single
   shared worktree this corrupts state. It needs real isolation: each write
   branch in its own worktree, then a merge back (reusing
   `integration-service`), with conflicts surfaced to a human. This is the heavy
   lift and it leans on the deferred Docker/sandbox backend (S6) for true
   process-level isolation.

Treating these as one feature is the trap. The design splits them.

## Proposed shape

```text
  TODAY (linear)              PROPOSED (DAG, opt-in)
  ───────────────             ───────────────────────
  plan                        plan
   │                           │
  review                ┌──────┼──────┐         <- fan out (read-only)
   │                 review-a review-b review-c
  implement              └──────┼──────┘
   │                         arbiter            <- join (consumes all three)
  validate                     │
   │                        implement
  decide                       │
                            validate
                               │
                            decide
```

A Flow opts into graph scheduling per step. Absent that, the linear array
semantics are preserved **exactly** - every existing flow keeps running the way
it does now.

### Phased plan

**Phase A - explicit dependencies (the DAG substrate), runner unchanged.**
Add an optional `FlowStep.needs: stepId[]`. Validate: every id exists, the graph
is acyclic, and the declared array order is a valid topological order (so today's
linear flows are trivially valid). The runner still executes linearly. Nothing
runs in parallel yet - this just *records* the graph and makes it inspectable.
Shippable on its own, zero behavior change.

**Phase B - read-only parallel fan-out / join.** Introduce a parallel group:
a set of steps that share their `needs` and run concurrently, plus a join step
that lists them in its `needs`. **Constrain group members to read-only steps**
(role `permissions != code_write`); enforce in the schema's `superRefine`. The
runner gains a bounded-concurrency scheduler (reuse the cross-run cap idea) that
runs a ready frontier instead of a for-loop. The diff gate never trips (no
writes); Action Broker, validation, and approval gates are unchanged. This
delivers multi-reviewer / multi-planner / panel-arbitration *within one task* -
the real win, at low risk. Ship with a built-in example flow (`panel-review`:
three reviewers in parallel -> one arbiter).

**Phase C - parallel write steps via sub-worktrees + merge.** Each parallel
write branch runs in its own ephemeral worktree (a mini-run), then
`integration-service` merges them into the task's worktree. Conflicts -> block
for a human, never auto-resolve. Defer until B proves the model; couple with the
Docker backend (S6).

**Phase D - continue-past-failure, per-item retries, checklist-DAG.** Once steps
carry explicit deps and the runner is a scheduler (not a for-loop), these stop
being special cases: "continue past a failed independent branch" is a graph
policy, "retry item N times" is a per-node policy, and the checklist becomes a
DAG of items (item B `needs` item A) instead of a linear list. The pickup doc
already flags these as "deferred - they need a checklist DAG."

## Schema sketch (additive, back-compat)

- `FlowStep.needs?: stepId[]` - default empty. **Opt-in rule:** if no step in a
  flow declares `needs`, the runner uses today's linear path verbatim. A flow
  that declares any `needs` opts the whole flow into graph scheduling, and
  validation then requires the array order to be a topological sort (keeps YAML
  readable and resume reasoning sane).
- Parallel grouping: prefer deriving it implicitly - steps with identical
  `needs` and no write permission *may* run concurrently - over a new
  `parallelGroup` token, to keep the schema small. Decide during Phase B.
- The resolved snapshot (`resolvedFlowSnapshotSchema`) gains the edge set + any
  group membership so the graph is frozen at resolve time, same as seats today.

## Invariants to preserve (non-negotiable)

- **One writer per worktree.** Read-only steps may share the run worktree;
  write steps never run concurrently in the same worktree.
- **Distinct output tokens.** Two concurrent steps must not write the same
  `outputs` token; the join consumes each by name. Validate at load.
- **All existing safety holds.** Action Broker gates every effect; the post-turn
  diff gate guards each write turn; validation stays the ground-truth tiebreak;
  no auto-merge - intra-task merges of write branches stop on conflict and
  surface to a human.
- **No silent fan-out cost.** A hard cap on group width; the flow-complexity
  warning (C1) must account for fan-out, since parallel agents multiply spend.

## Open questions / risks

- **Resume & rewind.** `--resume-stage` assumes a linear spine; "a stage" is not
  a point on a DAG. Needs its own rule (resume from a node and re-run its
  descendants?). Likely the gating reason to keep Phase A linear.
- **Event log & Mission Control rails** assume an ordered sequence of phases;
  concurrent turns need an interleave-safe representation and a UI that shows
  branches (Flow Builder must visualize the graph - UI/CLI parity).
- **Token budget** is shared across concurrent turns - accounting and the
  spend-cap enforcer must sum live, not per-turn.
- **Provider session reuse.** Providers that reuse a session across turns can't
  share one session across parallel turns; the participant ledger already tracks
  `sessionReuse` per seat - parallel members likely force fresh sessions.

## Recommended first slice

Ship **Phase A + Phase B together**, behind a built-in `panel-review` flow
(N read-only reviewers in parallel -> one arbiter join). It delivers genuine
multi-perspective review/planning inside a single task with **no
worktree-collision risk**, and lays the validated-DAG substrate that Phases C
and D require. Defer write-parallelism (C) and the checklist-DAG (D) until the
read-only scheduler and the graph-aware UI are proven.

## Surfaces (when B lands - UI/CLI parity)

- CLI: `vibe run` already takes `--flow`; a graph flow needs no new flag. Flow
  validation errors must name the bad edge ("step X needs unknown step Y" /
  "cycle: X -> Y -> X").
- Flow Builder (web) + shell flow detail: render the DAG, not just a step list.
- Mission Control: phase rails that can show concurrent branches and their join.
