# Pick-up execution (Phase 3)

Status: implemented (v1). The continuous-mode loop that executes a card's
Checklist item-by-item. Locked decisions live in
`roadmap-and-sequencing.md` §1; this doc records how it was built.

## Shape

One run, one worktree. The flow declares a `checklistSegment` — a contiguous
body of steps that repeats **once per checklist item**:

```
ONCE      plan            (holistic — sees the card + every item via the brief)
PER ITEM  micro-plan      (planner, scoped to THIS item)
          implement       (executor, code_write, in the worktree)
          → commit (tagged Vibestrate-Checklist-Item: <id>) + compact summary
          → [between-item gate] continuous: go · step: pause
ONCE      review          (holistic — over the accumulated work)
```

The built-in `pickup` flow is exactly this. Any flow can become checklist-aware
by adding a `checklistSegment: { from, to }`.

## Where it lives

It is **not** a parallel runner — it's woven into the one
`runFlowSequence` (orchestrator), reusing every existing guarantee (diff gate,
Action Broker, validation, pause/resume). The per-item jump-back is the same
mechanism as the adaptive review loop's jump-back; the schema keeps the two
disjoint (a `checklistSegment` must end before any `loop` begins), so they never
collide in the traversal.

## Decisions

- **Every run iterates a checklist; N=1 is the instant task.** With no linked
  checklist (or no `checklistMode`), the segment runs once — today's behavior,
  unchanged. The loop is the general case, not a special path.
- **Forward-carry summaries, not diffs.** After each item, a *compact* summary
  (status, commit, key files, the agent's trimmed implementation note) is written
  and the running ledger is injected into the next item's context as the
  `prior-items` token. Older items fold to one line when the carried ledger
  exceeds its char budget (`buildPriorItemsContext`). This is the make-or-break
  for "item 5 knows what item 2 did" — built and tested first
  (`src/pickup/item-summary.ts`), before the loop.
- **A commit per item, stamped with the item id.** Attribution, single-item
  revert, and per-item board status all fall out of git
  (`stageAndCommitAll` + `--trailer`). The item's `commitSha` is written back to
  the task checklist.
- **Continuous vs step-by-step = one loop + a gate.** Step mode sets
  `pauseRequested` between items; the next segment step's `applyPauseIfRequested`
  holds until a human resumes. No separate code path.
- **Stop-on-failure, linear.** A step that throws mid-item marks that item
  `blocked` and leaves the rest `pending`. (Per-item bounded retries and
  continue-past-failure are deferred — they need a checklist DAG.)
- **Status write-back is best-effort.** Per-item status/commit updates to the
  task never throw into the run's hot path.

## Surfaces

- CLI: `vibe tasks pickup <id> [--step]`; `vibe run --checklist <continuous|step>`
  (needs `--task` + a checklist-aware flow).
- API: `POST /api/runs { taskId, flow: { id: "pickup" }, checklistMode }`.
- UI: "Run checklist" button on the task detail page (continuous, or a
  step-by-step checkbox).
- State: `RunState.checklistMode` + `checklistProgress`; per-item summary
  artifacts under `runs/<id>/artifacts/flows/checklist/`, plus an `outcomes.md`
  table.

## Deferred (v1.1+)

Resume-from-item (a crashed run restarts at the last completed item); per-item
bounded retries; mid-loop profile downgrade on budget pressure; parallel item
execution (worktree-per-item then merge — that's the §3 parallel/merge work).
