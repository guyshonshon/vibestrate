# Pickup: resume-from-item (and why per-item retries is mostly already built)

Status: design, pre-implementation. Tier-2 (touches the per-item commit loop in
the run path; partial-write risk). 2026-06-24.

## Scope

Two TODO follow-ups under "Pickup":

1. **resume-from-item** - resume a checklist (`pickup` / `pickup-review`) run at a
   specific item instead of re-running the whole checklist. THIS is the real
   build.
2. **per-item bounded retries** - investigated and found **already substantially
   covered**; see "Per-item retries" below. We do NOT build redundant machinery.

This doc designs (1) and records the finding on (2).

## Current state (verified in `src/core/orchestrator.ts`)

The per-item band runs `checklistItems` through a loop with an `itemIndex`
cursor. Per item:

- `enterChecklistItem(i)` - writes the item brief, sets
  `state.checklistProgress = { total, completed: i, currentItemId, currentIndex: i }`,
  marks the roadmap item `in_progress`, emits `checklist.item.started`.
- the band runs (writer; on a review band, a bounded review-fix loop
  `for (itn = 0; itn < maxItns; itn++)` at `:3611`).
- `commitChecklistItem(i)` - **commits that item's work** via `stageAndCommitAll`
  with trailers `Vibestrate-Run: <runId>` and `Vibestrate-Checklist-Item:
  <item.id>`; records a `ChecklistItemOutcome` (status `done`, `commitSha`,
  `filesTouched`, `summary`, `fixIterations`); updates the roadmap item to
  `{ status: "done", commitSha }`; sets `checklistProgress.completed = i + 1`;
  emits `checklist.item.completed`.

So **each item is its own commit**, and "done" is durably recorded in TWO places:

- **Git**: one commit per item, tagged with the `Vibestrate-Checklist-Item`
  trailer (in the run worktree).
- **Roadmap/task**: the task's checklist item carries `status: "done"` +
  `commitSha` (via `roadmap.updateChecklistItem`).

**Resume today** (`:3350`): resuming *into* a per-item band is **refused** for a
checklist+graph flow -

> "Cannot resume into the per-item band ... landing the cursor between segFrom
> and segTo would seed a partial band and stall (a band root's `needs` is
> unsatisfied). Resume at or before `segFrom` ... or after `segTo`."

Resuming at/before `segFrom` re-enters the band and **re-runs every item from
index 0** (wasteful and non-idempotent: it re-generates and re-commits work that
was already committed). There is no "start at item N, skip the done ones".

## Per-item retries - the finding (build nothing, or near-nothing)

"Per-item bounded retries" is already covered by existing machinery:

- **Review-fix loop**: `maxItns`-bounded loop per item that feeds the arbiter's
  consolidated must-fix findings back to the writer (`per-item-findings` input).
- **Resilience retries**: run-level rate-limit / transient retries (U-series)
  apply to every turn, including a per-item writer turn.
- **fixIterations** is recorded per item (W2).

The only conceivable gap is "retry an item whose own validation/acceptance check
failed" - but per-item validation isn't a band feature today, and adding a retry
for a failure class that doesn't exist is speculative. **Decision: do not build a
separate per-item retry mechanism.** If a concrete need appears (an item-level
validation gate that should retry), it rides the existing review-fix loop's
`maxItns` budget rather than a new loop. Logged as a no-build with reasons.

## resume-from-item - design

### Trigger / surface

- CLI: `vibe run --resume-from <runId> --resume-item <itemIdOrIndex>` (extends the
  existing `--resume-from` / `--resume-stage`). Without `--resume-item`, behavior
  is unchanged (re-runs from `segFrom`).
- API/UI: the rewind modal gains a "resume at item N" option when the run is a
  checklist run with at least one done item. (UI parity; same gated launcher.)

### The done-set (authoritative source)

At resume, compute `doneItemIds: Set<string>` = the checklist items already
committed. **Authoritative source = git**, because git is what actually holds the
committed work the resume must not redo: scan the run worktree's history for
commits carrying `Vibestrate-Checklist-Item: <id>` trailers reachable from HEAD.
The roadmap task status is a **corroborating** source (and what the UI shows), but
git is the floor - an item is "done for resume" iff its work is committed in the
worktree. This avoids the failure where the roadmap says done but the commit is
absent (or vice-versa).

If the two disagree, **fail closed toward re-running** (treat as not-done) for any
item whose commit is missing - re-running a done item is wasteful but safe
(idempotent-ish: the writer regenerates, the commit is a near-no-op if the work
is identical); skipping a not-actually-committed item would LOSE that item's work.
So: `doneItemIds` = items with a reachable commit trailer, intersected with the
requested resume point.

### Entry: skip, don't partial-band

Do NOT land the cursor inside the band (that's the refused partial-band path).
Instead:

- Resume the run at `segFrom` (the band entry) exactly as the safe path does -
  the band root's `needs` are satisfied, no stall.
- Change the **item loop's start index**: `itemIndex` starts at the first item
  whose id is NOT in `doneItemIds` (call it `firstPendingIndex`), instead of 0.
- Seed `itemOutcomes` from the recorded `item-<n>-summary.md` artifacts (or
  re-derive minimal outcomes from the commit trailers) for the skipped items, so
  `buildPriorItemsContext` and the holistic postlude still see them.
- `checklistProgress.completed` initializes to `firstPendingIndex`.

This keeps a single source of truth for commit (the band still commits each
pending item exactly once) and never seeds a partial band.

### `--resume-item N` semantics

- `--resume-item` names an explicit restart point. If the user asks to resume at
  item K, items `[0, K)` are treated as the intended-done prefix. SAFETY: refuse
  if any item in `[0, K)` is NOT actually committed (a gap) - that would skip
  un-built work. Error: "item J in the resume prefix has no commit; resume at or
  before item J." This makes the operation honest about what it skips.
- Without `--resume-item`, default `K = firstPendingIndex` (auto-skip exactly the
  committed prefix) - the safe, zero-surprise default.

### Idempotency + abort safety

- The skipped items are never re-entered, so their commits are untouched.
- A pending item that was *half-written* before the crash: its work may be
  uncommitted in the worktree (no per-item commit yet, since commit is the last
  step). On resume the writer re-runs that item from the brief; the worktree's
  uncommitted partial work is overwritten by the fresh run and then committed.
  Net: at most the in-flight item is redone, never a committed one. No
  partial-band, no double-commit of a done item.

## Failure modes

| Failure | Mitigation |
| --- | --- |
| Partial band stall | Never resume into the band; enter at `segFrom`, only the item loop's start index moves. |
| Skip an un-built item (lost work) | `doneItemIds` is git-trailer-derived; `--resume-item K` refuses a non-committed prefix. Fail closed toward re-running. |
| Double-commit a done item | Done items are never re-entered. |
| Roadmap/git disagreement | Git is authoritative for resume; roadmap is display only. |
| Half-written in-flight item | Re-run from brief overwrites uncommitted work, then commits once. |
| Non-checklist run gets `--resume-item` | Reject with a clear error (flag only valid for checklist runs). |

## Test plan

- Pure helper `computeChecklistResume({ items, doneItemIds, requestedItem })` ->
  `{ startIndex }` or `{ error }`. Unit-test: auto-skip committed prefix; explicit
  K honored; K with a gap in the prefix refused; non-existent item refused;
  all-done -> proceed to postlude.
- Done-set derivation from commit trailers: temp git repo with N item commits,
  assert the trailer scan recovers the right id set, incl. a missing-commit gap.
- Integration (fake provider): a 3-item checklist run, abort after item 2's
  commit, resume - assert items 1-2 are not re-committed (HEAD unchanged for them)
  and item 3 runs + commits.

## Tier-2 review outcome (2026-06-24) - the git-scan design is DEAD

An independent Opus-4.8 adversarial review killed the central mechanism of the
design above. Recorded here so it isn't re-attempted:

- **The git-trailer done-set cannot work.** A resumed run is a FRESH run with a
  FRESH worktree materialised from a parentless tree snapshot
  (`phase-snapshots.ts:108`, `diff-gate.js:13` = `read-tree` + `checkout-index`),
  NOT from the source run's commit history. So "scan commits reachable from HEAD
  for `Vibestrate-Checklist-Item` trailers" reads a worktree with **zero** per-item
  commits - `doneItemIds` would always be empty. The "git is the floor" premise
  never checked where resume gets its worktree.
- **A zero-diff item leaves no commit/trailer at all** (`stageAndCommitAll` returns
  null when nothing changed; the outcome is still `status: done, commitSha: null`),
  so a git-authoritative done-set can never see it as done.
- **The done-set already exists and is already applied.** `checklistItems =
  task.checklist.filter(c => c.status !== "done")` (`orchestrator.ts:3150`). Done
  items are filtered out before the loop, every run.

**Verified consequence (the big finding): the core of resume-from-item ALREADY
WORKS.** A checklist run commits each item AND sets that item's roadmap status to
`done` (`commitChecklistItem`, `:3486`). A resumed run re-reads the task
(`roadmap.getTask`, `:3146`) and the existing filter excludes the committed items,
so the loop runs only the still-pending ones - as long as the resume enters the
band at `segFrom` (the `:3355` guard only refuses landing INSIDE the band). So
"skip already-committed items on resume" is not a feature to build; it falls out
of commit-per-item + roadmap-status + task-reload.

### Revised scope - the only genuine gaps

1. **`prior-items` context on resume (quality).** On resume `itemOutcomes` starts
   empty, so `buildPriorItemsContext` shows nothing and the still-pending items run
   without the done items' summaries (loss of cross-item coherence; the holistic
   postlude sees a partial ledger). Fix: seed `itemOutcomes` for the already-done
   items from the SOURCE run's `flows/checklist/item-<n>-summary.md` artifacts
   (the `sourceStore` pattern at `:2162` already exists), so the ledger is whole.
2. **Checklist-fingerprint guard (safety edge).** If the task's checklist is edited
   between the abort and the resume (delete+re-add gives a new id; the filter then
   skips/re-runs the wrong item), refuse with a clear error rather than silently
   acting on a changed list. Item ids ARE stable when unedited
   (`roadmap-service.ts:552`, persisted not regenerated), so this only guards the
   edited-between-runs case.
3. **Explicit `--resume-item N` (niche) - NOT building.** Forcing a restart at an
   earlier item (re-doing committed work) is a niche need and reintroduces the
   index-vs-id and gap-refusal hazards the reviewer flagged. Auto-skip-done covers
   the real use case. Logged as a no-build.

## Out of scope

- Resuming into a *graph* band at a specific item (the partial-band case stays
  refused; resume-from-item operates at the item-loop granularity, entering at
  `segFrom`).
- Mid-loop profile downgrade (separate deferred follow-up).
- Per-item retries (already covered; see above).
