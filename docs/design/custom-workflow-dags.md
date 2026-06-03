# Custom workflow DAGs + parallel agents within a task

Status: **Phase A + B SHIPPED (0.7.0, orchestrator Slice 4); Phase C + D on
paper.** The *product framing* here is superseded by
`responsible-orchestrator.md`: DAGs are an execution primitive the orchestrator
*chooses*, not the product identity. This doc remains the graph execution design.

What shipped in the A+B slice (Slice 4):

- `FlowStep.needs` (DAG edges) + optional per-step `instructions`, with load-time
  graph validation (acyclic, topological order, distinct outputs across a
  parallel group, `MAX_PARALLEL_FANOUT` width cap, and rejection of `needs`
  combined with loop / checklistSegment / fixed repeat). Helpers `isGraphFlow` /
  `parallelGroupsOf`. (`src/flows/schemas/flow-schema.ts`)
- Read-only guarantee enforced at **resolve** time: every member of a parallel
  group must bind to a read-only permission profile, else `resolveFlow` throws.
  (`src/flows/runtime/flow-resolver.ts`)
- A bounded-concurrency **frontier scheduler** (`Orchestrator.runGraphFrontier`):
  ready read-only groups run concurrently (parallel-compute / serial-commit,
  stateless turns), everything else runs solo. The linear runner is byte-for-byte
  unchanged for non-graph flows.
- Built-in **`panel-review`** flow (3 lensed reviewers -> arbiter join).
- Fan-out cost warning (`flowFanoutAdvice`, surfaced by `vibe run` +
  `POST /api/runs`) and `flow.graph.started` / `flow.frontier.scheduled` /
  `flow.graph.completed` events.
- `timeoutMs` wired end to end: an overrunning turn's whole process group is
  tree-killed (it was advisory/dead in the spawn path before). `MetricsStore`
  mutators are serialized so concurrent turns can't lose updates.

Phase C (write-parallelism) and Phase D (checklist-DAG / continue-past-failure)
remain deferred and kept on paper below.
This answers the TODO backlog item "Custom workflow DAGs + parallel agents within
a single task (also the home for checklist-DAG + continue-past-failure + parallel
item execution)." Companion docs: `flows-unification.md` (one runner),
`pickup-execution.md` (the per-item band - the closest precedent), and
`roadmap-and-sequencing.md` (sequencing).

This revision folds in four decisions made after the original spike: the
**merge model** is agent-driven (not human-driven), there is an explicit
**opaque-box** model for nested/provider-internal agency, **fan-out cost** is
surfaced loudly, and the parallel-write isolation sits behind the
**execution-backend** seam so Docker/VM/cloud drop in later without touching the
graph.

## What we have today (grounded)

A Flow is a **linear list of steps**, plus two contiguous-band specials:

- `flowDefinitionSchema.steps: FlowStep[]` (`src/flows/schemas/flow-schema.ts`) -
  array order *is* execution order. Each step has `inputs: token[]` and
  `outputs: token[]` (artifact tokens like `plan`, `diff`, `validation`).
- `runFlowSequence` (`src/core/orchestrator.ts`) walks `snapshot.steps` with a
  plain `while (stepIndex < steps.length)` loop and keeps an
  `outputs: Map<token, FlowContextOutput>`. A step's `inputs` choose which prior
  artifacts get injected into its prompt. **So inputs/outputs already encode data
  dependencies - but they drive prompt context, not scheduling.**
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

Process teardown is already tree-safe on POSIX: `src/execution/command-runner.ts`
spawns **detached** (its own process group) and, on abort, sends
`process.kill(-pid, SIGTERM)` then `SIGKILL` to the **whole group** after a grace
window. This matters a lot below.

## The hard problem: writes collide, reads don't

"Parallel agents within a task" is really two very different features:

1. **Parallel read-only steps** - several reviewers, planners, or analysts over
   the *same* code, no file writes. Fan out, then join. Safe, cheap, and the
   high-value 80%: it is the "judge panel" / multi-perspective pattern applied
   inside one task. No worktree collision because nobody writes.
2. **Parallel write steps** - two executors editing files at once. In a single
   shared worktree this corrupts state. It needs real isolation (a worktree per
   branch, then a merge back) and it carries a risk that no amount of plumbing
   removes: **semantic conflict** (see "Merge model" below). This is the heavy
   lift; it leans on the execution-backend seam for stronger isolation.

Treating these as one feature is the trap. The design splits them, ships the
read-only half first, and stays skeptical about the write half.

## Proposed shape

```text
  TODAY (linear)              PROPOSED (DAG, opt-in)
  ---------------             -----------------------
  plan                        plan
   |                           |
  review                +------+------+         <- fan out (read-only)
   |                 review-a review-b review-c
  implement              +------+------+
   |                         arbiter            <- join (consumes all three)
  validate                     |
   |                        implement
  decide                       |
                            validate
                               |
                            decide
```

A Flow opts into graph scheduling per step. **Absent that, the linear array
semantics are preserved byte-for-byte** - every existing flow keeps running the
way it does now, through the untouched linear loop.

## Phased plan

**Phase A - explicit dependencies (the DAG substrate), runner unchanged.**
Add an optional `FlowStep.needs: stepId[]`. Validate: every id exists, the graph
is acyclic, and the declared array order is a valid topological order (so today's
linear flows are trivially valid). The runner still executes linearly. Nothing
runs in parallel yet - this just *records* the graph and makes it inspectable.
Shippable on its own, zero behavior change.

**Phase B - read-only parallel fan-out / join.** A parallel group is a set of
steps that share their `needs` and run concurrently; a join step lists them all
in its `needs`. The runner gains a **bounded-concurrency frontier scheduler**
(reuse the cross-run cap idea): when the snapshot has edges it runs the ready
frontier instead of a for-loop; non-graph flows keep the existing linear loop
verbatim, so all the `loop`/`checklistSegment` behavior is untouched and
isolated from this change. **Group members are constrained to read-only steps**
and that is enforced at **resolve time** (see "Read-only guarantee"). The diff
gate never trips (no writes); Action Broker, validation, and approval gates are
unchanged. Ship with the built-in `panel-review` flow (N reviewers in parallel
-> one arbiter). **Ship one flow, not a framework** (see "Discipline").

**Phase C - parallel write steps via isolation + agent-driven merge.** Each
parallel write branch runs in its own ephemeral worktree (a mini-run) forked
from a **shared base**, then an **integrator step merges the siblings back** and
validation gates the result. Deferred until B proves the model; designed below
but built later, behind the execution-backend seam. Stays narrow and skeptical
because of semantic conflict.

**Phase D - continue-past-failure, per-item retries, checklist-DAG.** Once steps
carry explicit deps and the runner is a scheduler (not a for-loop), these stop
being special cases: "continue past a failed independent branch" is a graph
policy, "retry item N times" is a per-node policy, and the checklist becomes a
DAG of items (item B `needs` item A) instead of a linear list.

## Nested agency: the opaque box (bounds and restrictions)

The hardest conceptual issue is **nested agency**. When Vibestrate spawns a turn
(e.g. `claude -p ...`), that process can spawn its *own* subagents that we do not
see, cannot scope, and cannot individually await. Any provider, any model, may do
this. The design answer is a deliberate **two-layer** split:

- **Our layer is static and bounded.** Vibestrate's fan-out is *declared in the
  flow* - three reviewer steps with the same `needs`. We know the exact count
  before the run, validate a width cap, render it, and cost it. We never let an
  agent dynamically decide "spawn N siblings." That is the "dynamic is hard, but
  possible with bounds and restrictions" line: our layer is the bounded one.
- **The provider's layer is dynamic and opaque, and we do not reach into it.** A
  turn is a **black box**. We do not track its internal subagents and do not try
  to, because **the process *is* the join**: awaiting a turn already means
  awaiting that agent and everything it spawned. We need no handle on the
  children; the parent's exit is the barrier.

What keeps the black box safe is the bounds around it:

- **Teardown is tree-wide.** On abort/timeout we already signal the whole process
  group (`process.kill(-pid, ...)`, POSIX), so provider-internal subagents are
  reaped with the parent - orphans do not leak and keep spending. Parallel
  fan-out makes leak-avoidance more important, and this already holds on
  macOS/Linux.
- **Two honest gaps to close as part of this work:**
  - **Windows** kills only the direct child (no group kill) - the known E1 gap.
    Parallel fan-out worsens leaks there; gate or document graph flows on Windows.
  - **`timeoutMs` must actually fire that abort.** We recently found the profile
    `budget` was advisory (read by nothing). `timeoutMs` deserves the same audit:
    verify it is wired to trigger the abort signal for CLI turns, and wire it if
    not - same "only real knobs" rule. An internally-fanned-out box with no live
    timeout could hang unbounded.
- **Our concurrency cap counts turns, not real agents.** If we cap at N
  concurrent turns and each turn spawns its own subagents, the machine runs a
  multiple of N. So the cap bounds *our* fan-out; the real footprint is larger
  and unknowable. The width cap is therefore deliberately **small**, because each
  unit is itself heavy and may multiply.

## Cost: fan-out multiplies spend, say so loudly

A 3-way panel is ~3x the review spend plus the arbiter, and because each box may
internally parallelize, the *real* footprint is a multiple we cannot precisely
predict. Silent fan-out reads as "free." So:

- **Extend the flow-complexity warning (C1)** to account for fan-out width, with
  an explicit honesty line: "this flow runs N agents in parallel; each may itself
  parallelize, so real spend can exceed the estimate." Printed by `vibe run`,
  returned as `flowAdvice` from `POST /api/runs`.
- **Conservative width cap** by default - precisely because each unit is opaque
  and heavy.
- **Live spend summing.** The spend-cap enforcer must sum across concurrent turns,
  not per-turn. Honest caveat: for CLI providers we often cannot measure tokens at
  all (the deferred A7 item), so there the cap is wall-clock + turn-count bounded,
  not token-bounded - and the warning must say so.

## Merge model (revised): agents merge themselves; humans gate main

The original spike routed every intra-task conflict to a human. That overweights
the human. The revised model:

- **Siblings fork from a shared base.** All parallel write branches fork from the
  run worktree's HEAD at the moment of fan-out. Merging siblings back onto *that
  base* means any conflict is **within the task's own assignment** - the
  integrator has full context to resolve it.
- **The join is just another turn.** An `integrator` seat/role (an agent) does
  the merge, exactly like Claude Code resolving its own conflicts. No human in
  that loop.
- **Validation gates the merge.** The merged result must pass the existing
  validation step (the ground-truth tiebreak). Agent resolves -> validation runs
  -> green proceeds, red escalates. This is "agents merge themselves, gated by
  tests," not blind auto-merge.
- **Humans gate only where they already do:**
  - **Merge to main** - already human-gated (no auto-merge, no auto-push).
    Unchanged.
  - **Irrelevant collision** - main moved underneath, or another run touched the
    same files. That only surfaces at the *merge-to-main* boundary, which is
    already the human's call. Inside the task, siblings share a base, so they
    cannot collide with unrelated new work - that is structurally later.

**The honest limitation (do not oversell).** Validation is not complete. Two
write agents forking from the same base can produce changes that **merge cleanly
textually but are semantically wrong** (different files that must agree;
overlapping logic). Tests catch some of this, not all. **Semantic conflict is the
real ceiling on write-parallelism**, and it is the main reason Phase C stays
deferred, narrow, and skeptical: for many tasks the coordination/merge cost plus
the semantic-conflict risk will exceed the speedup, and that is an acceptable
reason to leave a task linear.

## Execution-backend seam (future Docker / VM / cloud)

`execution.backend` already exists (`local-worktree` today). The parallel-write
isolation must sit **behind that interface**: local = a worktree (a process) per
branch; later Docker/VM/cloud = a container/microVM per branch - **same
orchestration graph, same merge model, same bounds**; only *where the box runs
and how hard the isolation wall is* changes. The merge logic is plain git, so it
is backend-agnostic. Designing the isolation boundary as an interface in Phase C's
paper design (not code) means the container backend drops in later without
touching the graph or merge code. Not built now; the seam is kept clean.

## Schema sketch (additive, back-compat)

- `FlowStep.needs?: stepId[]` - default empty. **Opt-in rule:** if no step in a
  flow declares `needs`, the runner uses today's linear path verbatim. A flow
  that declares any `needs` opts the whole flow into graph scheduling, and
  validation then requires the array order to be a topological sort (keeps YAML
  readable and resume reasoning sane).
- Parallel grouping is **derived implicitly**: steps with identical `needs` whose
  resolved roles are read-only *may* run concurrently. No new `parallelGroup`
  token - parallelism is implied by the DAG plus read-only-ness, keeping the
  schema small.
- **First-slice restriction:** a flow may not combine `needs` with `loop` or
  `checklistSegment`. Those interactions (a DAG crossed with the adaptive loop or
  the per-item band) are Phase D; validate and reject the combination for now with
  a clear message.
- The resolved snapshot (`resolvedFlowSnapshotSchema`) gains the edge set + any
  group membership so the graph is frozen at resolve time, same as seats today.

### Read-only guarantee (where it is enforced)

Flows are crew-agnostic, so the **schema cannot** know who writes. Enforcement is
two-layered:

- **Load time (schema `superRefine`):** graph structure only - acyclicity,
  topological order, every `needs` id exists, distinct `outputs` tokens across
  concurrent steps, width cap, and the no-`loop`/no-`checklistSegment` restriction.
- **Resolve time (`resolveFlow`):** binds seat -> role -> **permission profile**
  (`src/permissions/permission-profiles.ts`: `read_only`/`review_only` have
  `allowWrite:false`; `code_write` has `allowWrite:true`). **Every member of a
  parallel group must resolve to `allowWrite:false`.** A panel of writers is
  rejected before the run starts. This upholds the one-writer-per-worktree
  invariant.

## Invariants to preserve (non-negotiable)

- **One writer per worktree.** Read-only steps may share the run worktree; write
  steps never run concurrently in the same worktree.
- **Distinct output tokens.** Two concurrent steps must not write the same
  `outputs` token; the join consumes each by name. Validate at load.
- **All existing safety holds.** Action Broker gates every effect; the post-turn
  diff gate guards each write turn; validation stays the ground-truth tiebreak;
  no auto-merge - the merge to main stays human-gated.
- **Bounded, tree-killable boxes.** Every turn runs under a wall-clock timeout and
  an abort that reaps the whole process group; the fan-out width is hard-capped.
- **No silent fan-out cost.** The flow-complexity warning accounts for fan-out and
  states that providers may parallelize internally.

## Discipline: ship one flow, not a framework

The DAG adds a second axis of complexity on top of an already-rich flow model
(seats, loops, checklist segments, stages, resume). It earns that complexity only
if: (a) it stays strictly opt-in with the linear path byte-for-byte unchanged, and
(b) the first shipped artifact is **one concrete, useful flow (`panel-review`)**,
not a general graph toolkit nobody uses. Generalize only when real demand appears.
Building a speculative graph engine is the failure mode to avoid.

## Open questions / risks

- **Resume & rewind.** `--resume-stage` assumes a linear spine; "a stage" is not a
  point on a DAG. **First slice: graph flows opt out of mid-DAG resume** (resume
  only at the graph boundary) rather than fake it. A proper rule (resume from a
  node and re-run its descendants) is future work.
- **Semantic conflict** between parallel writers (above) - the ceiling on Phase C.
- **Event log & Mission Control rails** assume an ordered sequence of phases;
  concurrent turns need an interleave-safe representation and a UI that shows
  branches (Flow Builder must visualize the graph - UI/CLI parity).
- **Token budget** is shared across concurrent turns - accounting and the
  spend-cap enforcer must sum live, not per-turn; CLI token visibility is partial.
- **Provider session reuse.** Providers that reuse a session across turns cannot
  share one session across parallel turns; the participant ledger already tracks
  `sessionReuse` per seat - parallel members likely force fresh sessions.

## Recommended first slice

Ship **Phase A + Phase B together**, behind a built-in `panel-review` flow (N
read-only reviewers in parallel -> one arbiter join). It delivers genuine
multi-perspective review/planning inside a single task with **no
worktree-collision risk**, and lays the validated-DAG substrate that Phases C and
D require. Defer write-parallelism (C) and the checklist-DAG (D).

**What lands in the A+B slice even though it is read-only** (because fan-out
exists there): the fan-out cost warning + conservative width cap; verification
that the bounds are real for parallel turns (process-group teardown on abort -
already there on POSIX - and that `timeoutMs` actually fires it, audited like
`budget` was); and live spend summing across the concurrent frontier. The merge
model and the backend seam stay on paper until Phase C, but are written here so
the A substrate does not foreclose them.

## Surfaces (when B lands - UI/CLI parity)

- CLI: `vibe run` already takes `--flow`; a graph flow needs no new flag. Flow
  validation errors must name the bad edge ("step X needs unknown step Y" /
  "cycle: X -> Y -> X") and the read-only/restriction violations clearly.
- Flow Builder (web) + shell flow detail: render the DAG, not just a step list.
- Mission Control: phase rails that can show concurrent branches and their join.
