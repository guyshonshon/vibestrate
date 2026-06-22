# Slice 5 / checklist-DAG Shape B - per-item review panel + arbiter

Status: **DESIGN (approved 2026-06-22).** Builds on Shape A (0.7.28, `pickup-analysis`)
and the whole-flow review panel + arbitration ledger (orchestrator Slice 4).
Product framing: `design/responsible-orchestrator.md`; graph execution design:
`design/custom-workflow-dags.md` (this slice closes its "Shape B on paper" line).

## 1. Scope

In scope (the three approved decisions):

1. **Per-item arbitration ledger** - the collision fix (prerequisite). Approach A
   below: per-item ledger files reusing the existing schema verbatim.
2. **Per-item review panel + arbiter** - after an item's writer produces a diff,
   reviewers fan out over *that item's* diff and an arbiter records a per-item
   verdict. Panel breadth is **configurable, default 2-lens** (correctness +
   risk), persona-driven, overridable per flow/crew.
3. **Bounded per-item fix loop** - on a per-item CHANGES_REQUESTED verdict the
   item gets a bounded fix -> re-review before the band advances. On exhaustion
   with open findings: **cap-and-continue (always)** - record, continue the band,
   cap run merge-readiness, never hard-abort.

Deferred (logged, not lost - keep the `custom-workflow-dags.md` "still on paper"
list honest):

- Serial in-band session reuse (only fan-out members must be stateless). Band
  turns stay **stateless** this slice, consistent with Shape A.
- Per-item suggestion ingest (per-item findings -> suggestion store -> follow-up
  card). The per-item ledger's `suggestionId` field stays `null` this slice.
- Extra specialized per-item panels (security/architecture variants) - "as real
  usage proves value".
- Orchestrator **auto-selection** of `pickup-review`. This slice ships it as a
  selectable builtin (`--flow pickup-review` / `defaultFlow`); the orchestrator
  choosing it from task shape is a follow-up.
- Phase C write-parallelism (separate, blocked on an execution-backend branch
  model).

## 2. Problem + evidence

The whole-flow arbitration ledger (`flows/runtime/flow-arbitration.ts`) is
**strictly run-scoped**:

- One file per run, `runFlowArbitrationPath()` -> `arbitration.json`.
- `flowArbitrationLedgerSchema` (`:97`) has a **singular** `decision`
  (`:108`) and singular `acceptedReviewPassId` (`:109`).
- `recordFlowFindings` (`:141`) dedupes by `record.finding.id === finding.id`
  (`:148`) - replace-in-place on id collision.
- `recordFlowFindingResponses` / `recordFlowFindingResolutions` key by
  `findingId` (`:169`, `:190`).

In a per-item review band the **same review/arbiter step ids run once per
checklist item**. Consequences if the run-level ledger were reused as-is:

- Item N's findings overwrite item N-1's whenever the model reuses a finding id
  (it will - ids like `F1`, `correctness-1` are common). Data loss.
- `decision` is singular: each item's arbiter decision clobbers the prior one;
  only the **last** item's verdict survives.

This is exactly why Shape A used finding-free `agent-turn` analysts. Shape B must
scope arbitration per item.

## 3. Design

### 3.1 Capability + builtin `pickup-review` flow

A flow whose `checklistSegment` band ends in a review/arbiter tail declares a
**per-item review band**. Ships as a new builtin `pickup-review` that **coexists**
with `pickup-analysis` (Shape A is untouched). Per-item band shape:

```
micro-plan -> implement -> [review-correctness, review-risk] -> arbiter
                  ^                                                 |
                  |________ fix loop (if CHANGES_REQUESTED) ________|
```

- `micro-plan`, `implement`: as Shape A (serial writer over the working tree).
- review lenses: **read-only** fan-out (`allowWrite:false`), parallel group,
  `continueOnError:true` (a dead lens never blocks the verdict - mirrors the
  whole-flow panel).
- `arbiter`: read-only join, `needs` the lenses, emits `review-decision` into the
  **per-item** ledger.

The band tail already anticipates an arbiter verdict at `segTo`
(`orchestrator.ts:3438`), so the existing summarize-by-`execution`-token fallback
holds.

### 3.2 Per-item diff scoping (the load-bearing bit)

Reviewers must see **only this item's diff**, not the cumulative diff. Item N
hasn't committed when its review runs, so:

- `enterChecklistItem(i)` (`orchestrator.ts:3354`) gains a capture:
  `itemBaseSha = <current worktree HEAD>` (via `revParseHead(worktreePath)`;
  null on a no-worktree/dry run -> review grounding falls back to the working
  diff as today).
- The review grounding for band lenses is scoped to
  `git diff <itemBaseSha>..<working tree>` (staged + unstaged), bounded + redacted
  by the **existing** review-grounding path (no new diff reader; pass the base to
  the existing one).
- The fix loop amends the **working tree**; the item commits **once** at
  `commitChecklistItem(i)` after the loop settles, so `itemBaseSha..HEAD` for the
  next item naturally excludes this item.

### 3.3 Per-item arbitration ledger (Approach A - chosen)

Reuse `flowArbitrationLedgerSchema` and every pure record function
(`recordFlowFindings/Responses/Resolutions/Decision`) **unchanged**. Store one
ledger per item:

- Path: `artifacts/flows/checklist/item-<i+1>-arbitration.json` (mirrors the
  existing `item-<i+1>-brief.md` / `-summary.md` convention).
- New thin path helper `runChecklistItemArbitrationPath(runId, itemIndex)` beside
  `runFlowArbitrationPath`.
- The band executor loads/saves the **per-item** ledger while in-band; the
  run-level `arbitration.json` is **untouched** and still serves the linear
  postlude panel (zero regression to the shipped, Tier-2-reviewed whole-flow
  path).
- New pure aggregator `collectPerItemVerdicts(input: { runId, itemCount })`
  -> `{ itemIndex, itemId, verdict, openFindingCount, fixIterations }[]`, reading
  the per-item files. Feeds assurance + UI. Pure + tested.

Rejected alternatives: (B) add an `itemId` column + decisions-map to the shipped
schema - mutates the merge-gating path for a band feature, high blast radius;
(C) composite `(itemId, finding.id)` key - same downside, messier semantics.

### 3.4 Per-item review panel + lens config

- Default lenses: `["correctness", "risk"]` + arbiter (3 turns/item/iteration).
- Lens vocabulary is the **closed** `reviewLens` set from
  `orchestrator/review-lenses.ts` (0.19.0). The supervisor persona reshapes
  emphasis exactly as the whole-flow panel does (`composeReviewerStepNotes`); a
  project persona **cannot** inject free-form text into a reviewer (same guard).
- Override precedence (reuse the established pattern): crew override >
  flow `checklistReview.lenses` > default. A new optional
  `checklistReview: { lenses: ReviewLens[] }` field on the flow schema (closed
  enum, load-validated).
- The arbiter is **never** lens-aimed (only the lensed reviewers), per 0.19.0.

### 3.5 Bounded per-item fix loop + cap-and-continue

A per-item loop **scoped to the band**, distinct from the run-level `loop`
(`orchestrator.ts:3340`) which still governs the whole-flow postlude:

```
enterChecklistItem(i): capture itemBaseSha
iteration = 0
repeat:
  run band frontier: implement (iteration 0) / fix (iteration >0) -> lenses -> arbiter
  record findings/decision into item-<i+1>-arbitration.json (per-item ledger)
  if decision != CHANGES_REQUESTED: break        # APPROVED / no open findings
  if iteration + 1 >= maxIterations: break        # budget spent
  iteration += 1
commitChecklistItem(i): commit once; verdict + openFindingCount recorded on the item outcome
```

- `maxIterations` reuses `resolveLoopMaxIterations` (`flow-resolver.ts:51`):
  crew override > global `workflow.maxReviewLoops` ceiling > flow `loop.maxIterations`.
- Iteration >0 writer = the **same `implement` seat** re-run with a new
  `per-item-findings` context token (the open findings from the per-item ledger),
  so it acts as the fixer - no separate fix step, consistent with context-driven
  behavior elsewhere.
- A new `flow.checklist.item.review` event per iteration
  (`itemId`, `iteration`, `verdict`, `openFindingCount`) - honest, deduped.
- **Cap-and-continue:** on break with open findings, the item outcome carries
  `reviewVerdict: "changes_requested"` + `openFindingCount > 0`. The band
  continues. `computeMergeReady` / `safety/run-assurance.ts` gains a
  **per-item-gaps cap**: the run cannot be `merge_ready` if any item ended with
  open findings; lane = `partially_verified` with a per-item note. Never aborts;
  the human reviews the diff before merge (consistent with the whole-flow panel
  and `responsible-orchestrator.md`).

### 3.6 Surfaces (UI <-> CLI parity)

- **RunTree / Control Center**: already render the band + per-item repeat
  (`zonedLayersOf`). Add a per-item review verdict badge + fix-iteration count on
  the item node, fed by `collectPerItemVerdicts`. Static dots only (no pulse).
- **`vibe assurance`**: a per-item-gaps lane - which items ended with open
  findings, the cap reason.
- **`vibe audit`**: per-item findings under each item node.
- No new write/HTTP routes. Read-only `GET /api/runs/:id/checklist-verdicts`
  (the aggregator) for the dashboard, fail-closed like the other run reads.

## 4. Data shapes

- Per-item ledger file: existing `FlowArbitrationLedger`, one per item.
- `ChecklistItemOutcome` (`orchestrator.ts:3442`) gains optional
  `reviewVerdict: "approved" | "changes_requested" | null` and
  `openFindingCount: number` and `fixIterations: number`.
- `collectPerItemVerdicts` return: `{ itemIndex, itemId, verdict, openFindingCount, fixIterations }[]`.
- Flow schema: optional `checklistReview?: { lenses: ReviewLens[] }`.

## 5. File-level change map

- `src/flows/runtime/flow-arbitration.ts` - add `runChecklistItemArbitrationPath`;
  schema + record fns unchanged.
- `src/flows/runtime/per-item-verdicts.ts` (new) - `collectPerItemVerdicts` (pure).
- `src/core/orchestrator.ts` - capture `itemBaseSha` in `enterChecklistItem`;
  per-item band loop; per-item ledger load/save; `per-item-findings` token;
  scope review grounding to the item diff; item-outcome verdict fields.
- `src/flows/catalog/builtin-flows.ts` - new `pickup-review` flow.
- `src/flows/schemas/flow-schema.ts` - `checklistReview.lenses` (closed enum).
- `src/flows/runtime/flow-resolver.ts` - resolve per-item lens set (precedence).
- `src/safety/run-assurance.ts` + merge-readiness - per-item-gaps cap.
- `src/server/routes/runs.ts` - read-only `GET /api/runs/:id/checklist-verdicts`.
- UI: RunTree / Control Center item node verdict; `src/ui/lib/api.ts` + types.
- CLI: `vibe assurance` + `vibe audit` per-item lanes.

## 6. Testing strategy

- **Collision regression (the crux):** two items, both reviewers emit a finding
  with id `F1`; assert item 1's `F1` and item 2's `F1` are in **separate** ledger
  files and neither overwrites the other; assert both per-item decisions survive.
- Pure: `collectPerItemVerdicts` over fixture ledger files; lens-precedence
  resolution; merge-readiness cap when any item has open findings.
- Band smoke (fake provider): a 2-item `pickup-review` run; item 0 clean
  (APPROVED, 0 fix iterations), item 1 CHANGES_REQUESTED then fixed within budget;
  assert per-item commits, per-item ledgers, verdicts, and `merge_ready`.
- Cap smoke: item 1's fix loop exhausts with an open finding; assert the band
  **continues** to item 2 and the run is **not** `merge_ready` (capped,
  partially_verified), not aborted.
- Diff-scoping: assert item N's review grounding diff excludes item N-1's
  committed code (base = `itemBaseSha`).
- Stateless invariant: assert band fan-out reviewers carry no session reuse.

## 7. Security notes

- All per-item ledger writes go through the run's `ArtifactStore` (worktree/
  run-bounded path-guarded writes; no new write surface).
- Review grounding reuses the existing bounded + **redacted** diff path (no new
  secret seam).
- Lens set is a **closed enum** - no free-form persona injection into reviewers
  (preserves the 0.19.0 guard).
- The new HTTP read is fail-closed (token-gated) like the other run reads;
  read-only, no shell, worktree-bounded.

## 8. Risks + open questions

- **Cost.** 2 lenses + arbiter = 3 turns/item/iteration on top of the writer. A
  10-item checklist with one fix iteration each ~ 50+ turns. Mitigated by the
  lean default + crew/flow override; surfaced honestly in docs. The orchestrator
  not auto-selecting `pickup-review` this slice means cost is opt-in.
- **Per-item loop vs run-level loop interaction.** The band loop is separate from
  the run-level `loop`; a `pickup-review` flow has the band loop and the linear
  postlude may also have its own `loop`. Must assert they don't alias
  `loopIteration`/budget. Test explicitly.
- **itemBaseSha on no-worktree / dry runs** - fall back to the working diff (as
  today); the per-item ledger still works, only diff scoping degrades to
  cumulative. Honest, not a hard fail.

## 9. Implementation review gate

The implementation touches the orchestrator run loop (non-trivial control flow,
concurrency-adjacent). It gets a **Tier-2 adversarial review** (fresh Opus
reviewer) before merge - focus: the per-item loop/budget aliasing, the diff-scope
base correctness, the merge-readiness cap, and the stateless-fan-out invariant.
