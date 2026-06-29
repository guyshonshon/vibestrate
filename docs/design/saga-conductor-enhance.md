# Saga Conductor - Phase 3: Enhance (design)

Status: implemented (2026-06-30), autonomous path. An adversarial Opus-4.8 review
killed the first recommendation (Option B); this records Option C, which it
surfaced and which shipped. Review trail in §8.

**Build status (v0.41.0, branch `feat/saga-conductor-3-enhance`):** M1 (schema) +
M2 (pure `enhance.ts`) + M3 (the autonomous ENHANCE engine: 3-way verdict, in-place
tail mutation, atomic overlay, escalate-on-structural, resume seeding,
reconcile-on-completion) + read-only dashboard surfacing (`saga.enhance` engagement
mapping) + docs. M4's separate enhance-pass cap was **reasoned out as redundant**
(one enhance per step transition; autonomous add excluded; spend-accounted - already
bounded by `maxSteps`/`maxSpendUsd`). **Deferred to a follow-up phase:** the *manual*
`vibe saga enhance` trigger (CLI + UI), which needs a between-runs execution context
(no active run/worktree) and a UI trigger path that avoids HTTP->shell - a distinct
concern from the autonomous loop. The spec listed manual "first"; the M0 finding
reshaped that (manual-add is the between-runs path), so the autonomous core shipped
first.

This is the design for the supervisor's reserved third verdict, `ENHANCE`: a
plan-only re-ground pass that revises the saga's *pending* steps against the
code as it actually is now, before the conductor continues. Today `ENHANCE`
folds to `PROCEED` + a log line; Phase 3 makes it act.

Authoritative context: [`saga-conductor.md`](./saga-conductor.md) (as-built
decision record), the spec
[`docs/superpowers/specs/2026-06-29-saga-tasks-conductor-design.md`](../superpowers/specs/2026-06-29-saga-tasks-conductor-design.md)
(§5.5, §6.4, §11 design Enhance), and the Phase 2 plan
[`docs/superpowers/plans/2026-06-29-saga-phase-2-conductor.md`](../superpowers/plans/2026-06-29-saga-phase-2-conductor.md)
(M3 reserved `ENHANCE` -> PROCEED+log).

## 1. Context - the real goal

A saga is a planned multi-step feature run. Its plan (the step list) is authored
*before* the code exists. The deeper into the saga, the more the early plan was a
guess about a codebase that has since changed under it (each step commits real
diff). The supervisor already judges "is the saga still on-goal" between steps
(`PROCEED`/`ESCALATE`); `ENHANCE` is the middle verdict it cannot yet act on:
*the plan has diverged from reality - re-ground the pending steps before
building the next one*. Without it the conductor's only options are blindly
proceed on a stale plan or halt the whole saga. Enhance is the "adjust the plan
and keep going" path.

The real goal is **plan fidelity over a long saga**, not a new planner feature.
Enhance is plan-only (it never writes code); its only output is a revised
*pending* step list. Done steps are immutable history.

## 2. What EXISTS / PROPOSED / FOUNDATION

| Component | State | Citation / note |
|---|---|---|
| `SupervisorDecision = PROCEED \| ENHANCE \| ESCALATE` type + strict/lenient parse | **EXISTS** | `src/feature/supervisor.ts:21,26,53` - ENHANCE is already a first-class parsed verdict |
| `ENHANCE` folds to `PROCEED` | **EXISTS (the seam to fill)** | `effectiveSupervisorDecision` `src/feature/supervisor.ts:73-76`; the loop only ever sees the folded value |
| Conductor per-item seam (budget -> supervisor -> proceed/halt) | **EXISTS** | `src/core/orchestrator.ts:4006-4112`; ENHANCE branch slots between 4106 and 4108 |
| `runSagaSupervisorTurn` (returns the *effective* `PROCEED\|ESCALATE`) | **EXISTS, needs widening** | `src/core/orchestrator.ts:5431`; must return the parsed 3-way verdict, not the folded 2-way |
| Run-scoped pending steps (`checklistItems[]`, in-memory) | **EXISTS** | `src/core/orchestrator.ts:3224-3230`, seeded from `task.checklist.filter(status != done)` `:3247` |
| Checklist mutation primitives (add/update/remove/reorder/setStatus) | **EXISTS, but** | `roadmap-service.ts:638,668,697,705,718`. Each is a *separate* `writeTask` (`:634`), and `reorderChecklist` demands a *full* permutation (`:716-734`) - so a naive multi-call apply is non-atomic and can't reorder pending-only. Option C writes the overlay in **one** atomic `writeTask` instead. |
| Invariants ledger (durable, re-injected each step) | **EXISTS** | `task.sagaInvariants` `roadmap-types.ts:252`; `appendSagaInvariants` `roadmap-service.ts:309`; re-injected `packet.ts:89` |
| `maxSteps` ceiling | **EXISTS, but does NOT bound Enhance** | `checkSagaStopConditions` counts **completed** steps (`stepsCompleted = itemIndex+1`, `orchestrator.ts:4025`, `budget.ts:59`). A refine-only ENHANCE never grows `checklistItems.length` and fires every step *uncapped*. The enhance-pass cap is a NEW prerequisite, not an existing guarantee. |
| Run lock (whole-sequence) | **EXISTS, unchanged** | `run-lock.ts:258`; held across the run, so Enhance runs under it for free |
| Resume guard - refuses **any** checklist-id change on `resumeFrom` | **EXISTS, left untouched by Option C** | `orchestrator.ts:3270` (`checklistIdsChanged`); Option B would have relaxed it, Option C does not - see §4 |
| `getSagaStatus` reads `task.checklist` (the persisted list) | **EXISTS** | `saga-status.ts:51-82`; consequence: a run-scoped-only Enhance is invisible to the live dashboard. Option C merges the overlay for display. |
| In-memory pending = positions `> itemIndex` at the seam | **EXISTS (the invariant Option C rides on)** | `checklistItems` filtered to non-done once (`:3247`); items `0..itemIndex` are committed/`done`, `itemIndex+1..` are pending. So in-place *tail* mutation preserves `itemIndex`. M0 confirms this holds. |
| **`ChecklistItem.provenance: "owner" \| "conductor"`** | **FOUNDATION (schema field, required)** | does NOT exist (`roadmap-types.ts:131-148` has no author/source field). Without it `classifyAuthority` cannot tell an owner step from a conductor-added one - the escalate-on-destructive policy is unimplementable. Add + backfill on every mutation path (`addChecklistItem:650`). |
| **`task.sagaPendingRevision` overlay** | **FOUNDATION (schema field)** | new saga-scoped field holding the revised pending plan; the atomic, resume-guard-free home for enhanced steps (§4 Option C). |
| **Enhance step-planner + step-diff parser** | **FOUNDATION (new pure module)** | the spec's "reuse `roadmap-planner` + `proposal-parser`" is wrong granularity - confirmed by review, see below |
| **ENHANCE control-flow branch in the band** | **PROPOSED** | run the pass, tail-mutate in-memory pending + write the overlay atomically, continue |
| **Authority classifier** (auto-apply vs escalate destructive) | **PROPOSED** | spec §11 policy; deterministic on `provenance`, NOT on model prose |
| **Enhance event/surface** (`saga.enhance`, dashboard, CLI) | **PROPOSED** | dashboard-surface-by-default |

### The mis-stated reuse (a foundation the spec hid)

The spec (§5.5) says Enhance "reuses `roadmap-planner` + `proposal-parser`."
Grounded: `generateRoadmapProposal` (`roadmap-planner.ts:49`) and `parseProposal`
(`proposal-parser.ts:247`) produce `ProposalTaskDraft`s - *roadmap tasks*, the
wrong granularity. A saga step carries `objective` / `acceptanceCheck` /
`fileHints` (`orchestrator.ts:3224-3230`), which those drafts do not model. So
Enhance needs **its own pure module** `src/feature/enhance.ts` - a prompt builder
+ a step-diff parser - exactly mirroring `supervisor.ts` (pure, provider-free,
unit-testable). This is a small foundation, not a reuse. [inference: high
confidence from the export shapes; M0 verifies before building.]

## 3. The risks that decide success

- **Persistence vs resume-guard (the fork).** See §4. This single decision sets
  whether Enhance is durable + visible or ephemeral + invisible. Everything else
  is mechanical.
- **Termination.** ENHANCE can *add* steps AND can fire every step without
  adding any (a refine-only re-plan), so it is two unbounded loops. `maxSteps`
  bounds only *completed* steps (`itemIndex+1`), so it caps add-growth indirectly
  but does **not** see refine-only thrash. Required NEW mitigations (a hard
  prerequisite, not a follow-on): (1) a per-saga enhance-pass cap (or "no two
  consecutive ENHANCE without an intervening completed step") in
  `checkSagaStopConditions`; (2) spend-account the enhance provider turn as a
  `saga-enhance` role through `enforceSpendCap`, so the per-saga budget envelope
  covers it exactly like `saga-supervisor`.
- **Authority / destructive change.** Conductor-triggered Enhance applies
  autonomously. It must NOT silently drop an owner-authored pending step or
  mutate the feature goal. Policy (spec §11): a diff containing a deletion of an
  owner-authored pending step, or a goal change, ESCALATES instead of applying.
  Refine/reorder/add of pending steps auto-applies.
- **Scope.** Enhance is plan-only and pending-only. Out of scope: editing done
  steps, editing the goal, touching code, a manual full-plan rewrite UI beyond a
  single "re-ground now" action. The manual trigger (spec §5.5) is a thin CLI/UI
  button that runs the same pass and shows the diff.

## 4. The central fork: where do enhanced steps live?

The resume guard at `orchestrator.ts:3270` compares the run's recorded
`checklistItemIds` against the current `task.checklist` ids and **hard-throws on
any change**. `getSagaStatus` reads `task.checklist` directly. So the question is
where a revised pending plan lives such that it (a) is correct under the live
loop, (b) survives crash/resume, (c) is visible on the dashboard, without
weakening resume-correctness.

The first draft of this doc recommended **Option B** (persist into
`task.checklist`, *relax* the resume guard to a "done-ids stable" check). The
adversarial review (§8) killed it: B still mutates the array the loop addresses
by absolute index (the `itemIndex` skip/re-run bug), the multi-primitive apply is
non-atomic across two files (half-applied plan on crash), and relaxing a
load-bearing resume guard solves a problem a better design never creates. B is
withdrawn.

| | A. Run-scoped only (spec's choice) | B. Persist to checklist + relax guard (withdrawn) | **C. Saga-scoped overlay (recommended)** |
|---|---|---|---|
| Revised plan lives in | in-memory `checklistItems[]` only | `task.checklist`, pending items | new `task.sagaPendingRevision` field |
| Resume guard | untouched | **relaxed** (the risk) | **untouched** |
| Atomicity | n/a | N writes across 2 files | **one `writeTask`** |
| Live dashboard | STALE original steps | enhanced steps | enhanced steps (merge overlay) |
| Crash/resume | enhancement lost | half-apply hazard | enhancement survives, atomically |
| `itemIndex` bug | n/a | present (re-derive shifts) | avoided (in-place tail mutation) |
| Build cost | smallest | medium + resume-correctness risk | medium, no guard change |

**Recommendation: Option C.** The revised pending plan is persisted to a new
saga-scoped field `task.sagaPendingRevision` in a **single atomic write**, never
into `task.checklist` - so the resume guard the whole saga lifecycle depends on
is **left exactly as-is**. The live loop keeps its one in-memory `checklistItems`
array and mutates only the **tail** (`> itemIndex`, which is by construction the
pending region), preserving the absolute-index addressing the band relies on -
no loop rewrite, no `itemIndex` corruption. On resume, `checklistItems` is
rebuilt as `done-items-from-task.checklist ++ overlay.pending`, and the dashboard
(`getSagaStatus`) merges the same way. Id-addressing the loop (the review's
heavier proposal) is the **fallback** if M0 finds the tail-mutation invariant
fragile.

C is strictly safer than B (no guard change, atomic) and strictly better than A
(durable + visible), at roughly A's correctness simplicity. Its real cost is two
schema fields (`sagaPendingRevision` + `provenance`) and the merge-on-read in two
places - cheap, and pre-publish we add fields freely (no back-compat).

### M0 finding (2026-06-30): conductor-triggered Enhance is refine/reorder/remove only

The tail-mutation index invariant **holds** (`checklistItems.slice(itemIndex+1)`
is already the pending region, `orchestrator.ts:5496`; `.length`-based
termination at `:3738` adapts to tail changes). But M0 found a real hole the doc
glossed: `commitChecklistItem` persists per-step done-status via
`updateChecklistItem(taskId, item.id, ...)` **keyed by id**, with a swallowing
`.catch(() => {})` (`:3709-3722`). A conductor-**added** step has a fresh id that
is **not in `task.checklist`**, so its done-status write silently no-ops and the
step has no durable status home - unless we write it into `task.checklist`, which
trips the resume guard (the very thing Option C avoids).

Resolution (keeps C clean, no guard coordination): **the conductor-triggered
(autonomous) Enhance path may only `refine` / `reorder` / `remove` pending steps -
all of which touch *existing* ids, so the overlay maps cleanly onto
`task.checklist` statuses by id and the guard is never touched. ADD is reserved
for the *manual* `vibe saga enhance --apply` path, which runs *between* sequences
(no active run, no resume guard in play), where a new step is a plain
`addChecklistItem` write.** This also satisfies spec §11's "structural changes get
owner review" - adding scope is structural. If autonomous add is later required,
it needs the heavier guard-coordinated id-baseline update (a separate decision).

## 5. The design (Option C)

0. **Schema prerequisites (do first).** Add `ChecklistItem.provenance: "owner" |
   "conductor"` (`roadmap-types.ts`), defaulted `"owner"`, stamped `"conductor"`
   only by the enhance-apply path; backfill on `addChecklistItem`
   (`roadmap-service.ts:650`). Add `Task.sagaPendingRevision?: { pending:
   ChecklistItem[] }` - the atomic home for the revised pending plan. These gate
   everything else: the authority policy and the persistence model are both
   unbuildable without them.
1. **Widen the verdict to control flow.** `runSagaSupervisorTurn`
   (`orchestrator.ts:5431`) returns the parsed 3-way `SupervisorDecision` instead
   of the folded 2-way. The band (`:4082`) keeps `ESCALATE` as-is, adds an
   `ENHANCE` branch before `itemIndex += 1` (`:4108`). Unparseable still folds to
   PROCEED. `effectiveSupervisorDecision` is retired in favor of the 3-way at the
   one call site.
2. **New pure module `src/feature/enhance.ts`** (mirrors `supervisor.ts`):
   - `buildEnhancePrompt({ goal, doneOutcomes, pendingSteps, diff, freshRead, invariants })`
     - all model-prose redacted via `redactSecretsInText`, diff bounded.
   - `parseStepDiff(text): { adds, refines, removes, reorder }` over pending steps,
     a strict line vocabulary distinct from the review/supervisor `DECISION:` line.
   - `classifyAuthority(diff, pendingSteps, mode): "auto" | "escalate"` -
     **deterministic on `provenance`**, never on model prose. In `conductor`
     mode: an `add` in the diff -> escalate (autonomous add is out of scope, see
     M0 finding); a `remove` targeting a `provenance==="owner"` step -> escalate;
     refine/reorder/remove-of-conductor-steps -> auto. In `manual` mode: add is
     allowed (the owner reviews the dry-run diff). Goal changes are unrepresentable
     in the diff vocabulary, closing that hole by construction.
   - Pure + unit-testable; no provider, no fs.
3. **Apply the diff (orchestrator, ENHANCE branch), id-safe + atomic.** On `auto`
   (refine/reorder/remove only - all existing ids): mutate the in-memory
   `checklistItems` **tail only** (`index > itemIndex`): `refine` patches a pending
   entry in place, `remove` splices a `conductor`-provenance pending entry,
   `reorder` permutes only the `> itemIndex` slice. `itemIndex` and all
   `0..itemIndex` (done) entries are never touched, so the band's absolute-index
   addressing stays valid. Then persist the revised pending slice to
   `task.sagaPendingRevision` in **one** `writeTask` (atomic; no `task.checklist`
   write, so the resume guard never trips). On `escalate`: fall through to the
   existing ESCALATE halt with reason `enhance-destructive`.
4. **Resume seeding** (no guard change). On resume, after the existing
   `checklistItems = task.checklist.filter(!done)` build (`:3247`), if
   `task.sagaPendingRevision` is present, **apply the overlay by id** to that
   pending slice: patch refined entries, drop removed ids, apply the overlay's
   ordering. Every overlay id already exists in `task.checklist` (autonomous add
   is excluded), so this is a pure by-id reconciliation - the guard's recorded-id
   check is untouched and any overlay step already completed-and-`done` is simply
   absent from the filtered slice. `getSagaStatus` (`saga-status.ts`) applies the
   same overlay so the dashboard shows the live plan. On clean saga completion the
   overlay is reconciled into `task.checklist` and cleared.
5. **Budget + thrash bound (prerequisite, not follow-on).** Spend-account the
   enhance turn as a `saga-enhance` role through `enforceSpendCap`. Add a per-saga
   enhance-pass cap to `checkSagaStopConditions` (lean: a small integer, or "no
   two consecutive ENHANCE without an intervening completed step") - `maxSteps`
   does not cover refine-only thrash (§3).
6. **Surfaces (parity).**
   - Event: `saga.enhance` with `{ index, applied: adds/refines/removes/reorder, authority, escalated? }`, redacted.
   - CLI: `vibe saga enhance <taskId>` (manual trigger - runs the pass, prints the
     diff; `--dry-run` default, `--apply` to commit); `vibe saga status` surfaces
     the last enhance + the live (merged) plan.
   - HTTP/dashboard: ConductorPanel already filters `saga.*` engagement, so
     `saga.enhance` shows up for free; add the manual "Re-ground plan" action +
     an enhance-diff view, driven through the audited launch path (no new
     HTTP-to-shell).

## 6. Build sequencing (dependency-ordered)

- **M0 - scout (verify, don't build).** Confirm the one assumption Option C rides
  on: that at the ENHANCE seam every pending item is at `index > itemIndex` and
  nothing addresses `checklistItems` by a *pending* item's absolute index outside
  the tail (so in-place tail mutation is safe). If fragile, switch M3 to
  id-addressed step selection. Also re-confirm `roadmap-planner`/`proposal-parser`
  granularity. One read-only pass; settles §4/§5 before code.
- **M1 - schema fields.** `ChecklistItem.provenance` (+ backfill) and
  `Task.sagaPendingRevision`. Smallest, unblocks both the classifier and
  persistence. Verify typecheck/test green before building on them.
- **M2 - pure `enhance.ts`** (prompt + step-diff parser + provenance-keyed
  authority classifier), fully unit-tested. No orchestrator wiring.
- **M3 - verdict widening + ENHANCE branch** (3-way verdict, tail-mutation apply,
  atomic overlay write, resume seeding). The payoff. Resume guard untouched.
- **M4 - budget/thrash bound** (enhance-pass cap + `saga-enhance` spend
  accounting). Prerequisite for letting the conductor trigger Enhance
  autonomously - land before or with M3's auto-apply, not after.
- **M5 - manual trigger + surfaces** (CLI `enhance --dry-run/--apply` + dashboard
  "Re-ground plan" + `saga.enhance` event + status merge +
  docs/changelog/`docs:generate`).
- **M6 - integration tests**: ENHANCE-applies-then-continues (correct next step,
  no skip/re-run); ENHANCE-then-crash-then-resume (overlay survives, resume guard
  does NOT trip, revised plan continues); destructive-remove-of-owner-step
  escalates; enhance-pass-cap halt. Fake providers only.

## 7. Open decisions

- **§4 persistence fork** - **Option C** (saga-scoped overlay) recommended over A
  (run-scoped) and the withdrawn B. Owner's call: accept C, or accept A's
  simplicity-for-invisibility tradeoff. (B is off the table - review-disproven.)
- **Tail-mutation vs id-addressing** - C uses in-place tail mutation pending the
  M0 invariant check; the review preferred a full id-addressed loop. Lean:
  tail-mutation (lighter, same correctness), id-addressing as the fallback M0 may
  force.
- **Thrash bound shape** - a hard enhance-pass cap vs "no consecutive ENHANCE".
  Lean: a small cap (reuses the `checkSagaStopConditions` shape).
- **Manual default** - `vibe saga enhance` dry-run vs apply by default. Lean:
  dry-run (print diff), `--apply` to commit - owner-reviews-first posture.

## 8. Review trail

Adversarial Opus-4.8 review (fresh context, brief: break Option B, verify every
claim against code). Findings accepted, unsoftened:

- **FATAL - `itemIndex` corruption.** *"`checklistItems` is built once... never
  re-filtered mid-run... re-derive from the fresh task drops completed items,
  shifts the remainder, and `itemIndex += 1` points at the wrong element -
  skipping a planned step or re-running a built one."* ACCEPTED. Option C's
  apply no longer re-derives; it tail-mutates in place (§5.3), and M0 verifies the
  invariant. The review's id-addressing is the fallback.
- **FATAL - authority classifier unimplementable.** *"`ChecklistItem` has no
  provenance field (`roadmap-types.ts:131-148`)... `classifyAuthority` cannot
  distinguish owner-authored from conductor-added - a no-op or a vulnerability."*
  ACCEPTED. Added `provenance` as a hard M1 prerequisite; classifier keys on it
  deterministically (§5.0, §5.2).
- **Non-atomic multi-write.** *"N task-file writes + 1 run-state write, non-atomic
  across two files... resume false-passes against a half-applied plan."* ACCEPTED.
  Option C writes one atomic `task.sagaPendingRevision` and touches no run-state
  ids (§5.3).
- **False EXISTS - `maxSteps`.** *"counts completed steps, not added steps or
  enhance passes... refine-only ENHANCE is invisible to this cap."* ACCEPTED.
  Struck the claim (§2, §3); enhance-pass cap + spend accounting are now
  prerequisites (M4).
- **Confirmed - wrong-granularity reuse.** `parseProposal`/`ProposalTaskDraft`
  model card-level fields, none of `objective`/`acceptanceCheck`/`fileHints`. New
  `enhance.ts` justified.
- **Safer alternative - Option C.** *"saga-scoped revision overlay + id-addressing
  + provenance... never weakens resume-correctness, atomic, makes the authority
  policy implementable."* ACCEPTED as the recommendation, with the one refinement
  that tail-mutation can stand in for full id-addressing pending M0 (lighter, same
  correctness invariant).

Reviewer's verdict: *"Option B is not buildable as designed... strongly prefer
Option C."* This doc adopts C.
