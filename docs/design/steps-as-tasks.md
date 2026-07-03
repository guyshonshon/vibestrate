# Steps-as-tasks

Status: revised-after-review (2026-06-30); UX pivot (2026-07-03)

## UX pivot (2026-07-03) - supervisor-plans-first

Owner feedback after the first cut reframed the surface. The manual per-step
authoring drawer was the wrong emphasis: "should the user really make all those
steps every time? I'd want the supervisor to plan/guide the breakdown." Changes
landed (v0.44.0):

- **Plan-first checklist.** An empty checklist leads with "Let the supervisor
  plan this" (runs the existing `enhance` breakdown from the task brief). Manual
  step authoring is demoted to an "Add manually" escape hatch.
- **Status is run-derived.** The per-step status dropdown is gone (owner: "how
  come you can change the status of a step?"). The only manual transition is a
  done-check (a real V checkbox); `in_progress`/`blocked` are shown read-only,
  driven by the run.
- **Steps read as configurable.** A checklist row is clickable end-to-end with a
  chevron; the drawer says "configure this step" and carries a Board › Task ›
  Step breadcrumb. "Detach into its own card" stays visually distinct.
- **Recursion: still flat.** A step remains a leaf - it does not own sub-steps
  (confirmed with owner). The one-container/one-branch invariant is unchanged.
- **Micro-steps unify with Runs.** The per-run micro-step pipeline renders inside
  its run row, not as a separate task-page section.
- **Context → Brief.** Context sources fold into a single "Brief" block with the
  description as a compact "Grounding" row (no standalone card).

STILL OPEN: wiring the fuller spec-up deep-questioning intake (describe + guided
inputs) as the front door - today "Plan the steps" uses the one-shot `enhance`.
The management-stage model remains the next slice.



## Context (the real goal)

The owner's ask: a checklist step should stop being "a minimal text item" and
become "a task in a task" - a first-class unit of work you can open, ground,
comment on, and watch execute. The literal phrasing was "steps become
first-class CHILD tasks," but the **hard constraint the owner attached changes
what that means**:

> The parent task owns the shared scaffolding - shared context, the flow + crew
> that execute it, runs, git activity, comments, dependencies/blockers - and all
> of it is INHERITED by every step. Steps are the work units; the parent is the
> shared container/context. A supervised run sequences child steps under one
> parent context.

So the goal is not "mint a Task row per step." It is: **give a step a
first-class surface (its own detail view, status, comments, blockers, run
outcome) while the parent remains the single owner of context/crew/git/runs that
every step shares.** That is the reframe this doc is built on.

## What exists vs proposed vs foundation

| Component | State | Evidence |
|---|---|---|
| Step as a rich record (`objective`/`acceptanceCheck`/`fileHints`/`runId`/`outcomeSummary`/`provenance`/`status`) | **EXISTS** | `src/roadmap/roadmap-types.ts:136-160` (`checklistItemSchema`, aliased `Step`) |
| Supervised run sequences the checklist under **one** parent context/branch/worktree | **EXISTS** | `src/core/orchestrator.ts:3256-3327` (extract+overlay), `:3666-3799` (per-item enter/commit), `saga-conductor.md` decision #1 |
| Per-step run + outcome stamped back onto the item | **EXISTS - supervised runs only** | `orchestrator.ts:3753-3765`, gated on `this.sagaMode` at `:3762` with the explicit comment "Non-saga checklist runs leave these fields untouched". A **plain** task's checklist still commits per item (the `Vibestrate-Checklist-Item` trailer is written) but never stamps `runId`/`outcomeSummary`. This asymmetry drives a design decision below. |
| Comments addressable to a step (`target:"step"` + `targetRef`) | **EXISTS end-to-end** (verified by review) | model `roadmap-types.ts:78-87`,`:330-339`; service preserves `roadmap-service.ts:640-642`,`:660-661`; store round-trips `roadmap-store.ts:152-173`; HTTP `server/routes/tasks.ts:27-33,143,218-223`; **UI client already accepts `target`+`targetRef`** `ui/lib/api.ts:1595-1610`. The ONLY gap is the caller: `TaskDetailPage.tsx:167` posts `{taskId, body}` with no `target`. A UI-affordance gap, not a plumbing gap. |
| Parent owns context/crew/git/runs | **EXISTS** | `contextSources` `:324`, `assignedRoles`/`requiredSkills` `:271-272`, `runIds`/`currentRunId` `:276-277`, `branchName`/`worktreePath` `:274-275` |
| `promoteChecklistItem` (item → standalone Task) | **EXISTS but WRONG SHAPE for this goal** | `roadmap-service.ts:849-888`: creates a fresh sibling Task that inherits **nothing** except `roadmapItemId`. Inverts the hard constraint. |
| Per-step **detail view** (open a step, see its grounding/runs/comments/blockers) | **PROPOSED** | - |
| Per-step blockers surfaced as the **parent's** blockers (inherited), not a new inter-step DAG | **PROPOSED** (thin) | Parent-level `dependencies` exist `:268`; inter-step `dependsOn` was deliberately dropped (`saga-conductor.md` #6) |
| `parentId` / child Task rows / parent-child store queries | **NOT BUILT - and we are deciding NOT to build them** (Option B, rejected below) | No `parentId` today (`roadmap-and-sequencing.md` §1) |

**No new FOUNDATION is required.** This is the load-bearing result of grounding:
the one capability that would have been an expensive foundation - "sequence many
sub-units under one shared parent context/branch" - **already shipped as the
Conductor.** Steps-as-tasks is a surfacing + enrichment slice on top of it, not a
new execution subsystem.

## The decision: enrich in-parent (Option A), do not mint rows (Option B)

| | **Option A - enrich the step in place** | Option B - real child Task rows |
|---|---|---|
| What a step is | a richer `ChecklistItem` on the parent + a first-class detail view | a `Task` row with `parentId` |
| Hard constraint | satisfied **by construction** - a step has no own context/crew/git because it lives inside the parent | must actively null-or-inherit every scaffolding field on each child; the schema *invites* the violation |
| Conductor | reuses the shipped one-branch sequencing unchanged | child rows each imply their own `runIds`/`branchName`/`worktreePath` → contradicts `saga-conductor.md` #1 (N branches) |
| Per-step comments/status/run | already in the model | re-plumbed onto rows |
| Store / migration | none (steps already live in `task.checklist`) | new parent/child queries + a store migration |
| Cost | UI + thin API + a few authoring fields | schema + engine + store + migration + UI |

**Decision: Option A.** "First-class" is delivered by a real per-step **detail
surface** and first-class per-step **comments / blockers / status / run
outcome**, all backed by the parent's shared scaffolding. We explicitly do **not**
add `parentId` or child Task rows; `promoteChecklistItem` stays as-is for the
separate "spin this item off into its own independent card" use case (a
different intent: detach, not nest).

**UX guard (from review):** "open this step as a task" (enrich-in-place, this
slice) and "promote this step to its own card" (`promoteChecklistItem`, detach)
are two genuinely different actions that both sound like "make this a task." The
UI must make them unmissably distinct - the step's primary affordance is *open*
(into the detail view); *promote* is a deliberate, secondary, clearly-labelled
"detach into an independent card" action, not a peer button.

## The risks that decide success

- **Scope explosion.** The bundled "management-stage model" (settable
  workflow-stage field + Board reads stage) shares the "tasks have structure"
  theme (`docs/TODO.md` backlog). It is a **sibling slice, not part of this
  one.** This doc designs steps-as-tasks only; the stage model gets its own doc.
  Out of scope here: inter-step dependency DAG, per-step distinct crews, per-step
  branches.
- **Termination / unbounded behavior.** None introduced. Execution stays the
  Conductor's existing bounded loop (`maxSteps`, between-steps budget checkpoint,
  clean-halt). Steps-as-tasks adds no new loop.
- **Plain vs supervised step activity (the real asymmetry).** The rich
  "step-owned activity" the detail view promises (run + curated outcome) is
  stamped **only by supervised runs** (`orchestrator.ts:3762`, `sagaMode` gate).
  A plain task's checklist commits per item but produces no `runId`/
  `outcomeSummary`. This is a deliberate engine choice (the curated outcome is
  the supervisor's product), not a bug. **We do not touch the engine in this
  slice.** The detail view is honest about it: a plain-task step shows status +
  its commit + comments, and an explicit "run this task supervised for per-step
  review + outcomes" empty state instead of faking a run. (See Open decisions for
  the alternative: also stamp bare `runId` in plain mode.)
- **Vocabulary.** `roadmap-and-sequencing.md` §1 reserves "Step" for Flow phases
  and calls checklist entries "items." The code alias `type Step = ChecklistItem`
  (`roadmap-types.ts:161`) has **zero consumers** (verified) - so this is a
  docs + user-facing-copy rename, not a type migration. **Resolution: adopt the
  owner's usage - a checklist entry is a "step."** Update the §1 vocab note in
  the same slice so docs match the owner's language. (Open for veto.)

## The design

### Data (minimal)

Steps already carry everything the execution needs. The enrichment is small and
all on the existing `checklistItemSchema`:

- Add an optional free-text `notes`/`description` for the step's own grounding
  blurb (distinct from `objective`, which is the one-line goal). *Open: is
  `objective` enough? See Open decisions.*
- Reuse `contextSources`? No - context stays **parent-owned**. A step that needs
  extra grounding gets it through the parent's context + its `fileHints`. (This
  is the constraint; do not add `contextSources` to a step.)

No new top-level Task fields. No `parentId`. No store-shape change. No migration
(steps already default losslessly per `roadmap-types.ts:136-160`).

### The per-step detail surface (the heart of the slice)

Opening a step shows, in one view, what makes it "a task in a task":

- **Identity + authoring**: title (`text`), `objective`, `acceptanceCheck`,
  `fileHints`, `provenance` (owner vs conductor). Editable.
- **Inherited scaffolding (read-only, clearly labelled "from parent")**: the
  parent's context sources, flow + crew, branch/worktree, blockers. Shown so the
  step's shared grounding is visible at the step, without implying the step owns
  it. Each row links up to the parent's owning surface to edit.
- **Step-owned activity**: its `status`, its commit (the per-item commit carries
  the `Vibestrate-Checklist-Item: <id>` trailer, `orchestrator.ts:3708` - written
  in **both** plain and supervised runs), its **comments** (`target:"step"`,
  `targetRef=itemId`), and - **for supervised runs only** - its `runId` +
  curated `outcomeSummary`. For a plain-task step the run/outcome block shows the
  honest "run supervised for per-step outcomes" empty state, never a fabricated
  result.
- **Blockers**: the parent's task-level `dependencies` (`roadmap-types.ts:268`),
  inherited and shown as "this step is blocked because its parent is blocked by
  X." There is **no per-step blocking relation and no inter-step DAG**: intra-task
  ordering is purely array position (the Conductor band is strictly linear -
  `Step.dependsOn` was deliberately dropped, `saga-conductor.md` #6), and the
  owner's constraint asks for *inheritance*, not per-step dependencies. If a step
  genuinely needs to block another, that is two tasks with a `dependency`, not
  two steps.

### Flow (no execution change)

A step runs only as part of its parent's **supervised** run - the Conductor
already enters/commits each item in order in one worktree. Steps-as-tasks does
not add a "run this one step" execution path (that would mint the isolated
run/branch the constraint forbids). The detail view's run info is read from the
existing per-item stamping; "run from here" maps to the Conductor's existing
step-by-step / resume controls, not a new engine path.

### API

- `GET` step detail: derivable from `getTask` (the item is in `task.checklist`) +
  `listComments(taskId)` filtered client-side to `target:"step"` & `targetRef=itemId`.
  **No new endpoint** - a UI-side projection. (Review confirmed the GET task
  payload already returns comments with `target`/`targetRef`; the per-step filter
  is O(all-comments-on-task), a non-issue at single-user scale.)
- Step authoring edits reuse the existing checklist-item update path
  (`roadmap.updateChecklistItem`, used at `orchestrator.ts:3753`). Confirm an
  HTTP route exposes it for UI edits; add a narrow one if missing.
- Per-step comment add: `addComment(taskId, {target:"step", targetRef:itemId, ...})`
  already exists (`roadmap-service.ts:644-666`); the UI just needs to pass
  `targetRef`.

## Build sequencing

The review collapsed the original M0 scout: the comment plumbing is proven
client-to-disk, so there is no unproven "exists" to verify first. The real prep
work is one **decision**, not an experiment.

- **M0 (decision, not code).** Lock the plain-vs-supervised step-activity call:
  the rich run/outcome block is **supervised-populated**; plain-task steps show
  status + commit + comments + an honest empty run state. Confirm there is an
  HTTP path to edit a checklist item's authoring fields (`updateChecklistItem` is
  used internally at `orchestrator.ts:3753`; verify/expose a narrow route if the
  server doesn't already). One read + the owner's nod on the asymmetry.
- **M1 (vocab + docs).** Adopt "step" as the checklist-entry noun; update
  `roadmap-and-sequencing.md` §1's vocab note. Docs/copy only (the `Step` alias
  has zero code consumers - no type migration).
- **M2 (per-step detail surface).** Build the step detail view: authoring fields
  (editable, via the checklist-item update path), inherited-scaffolding rows
  (read-only, labelled "from parent", linking up to the parent's owning surface),
  step-owned activity (status / commit / supervised run+outcome with the honest
  plain-mode empty state), per-step comments (the UI caller passes
  `target:"step"` + `targetRef=itemId` - the one real gap at
  `TaskDetailPage.tsx:167`), inherited blockers. Reuse `components/design/*` per
  the primitives contract; render + verify in **both themes**.
- **M3 (entry points + polish).** The *open-step* affordance from the task-detail
  checklist (distinct from *promote*, per the UX guard); empty-state CTAs per the
  contract's law 10a.

Each phase depends only on earlier ones. M0 is a pure decision + read; nothing is
built on an unproven "exists."

## Open decisions

1. **Reframe confirmation (load-bearing).** Option A (enrich in-parent) vs
   Option B (child Task rows). This doc commits to A; owner can veto. If the
   owner truly wants independent rows, the hard constraint has to be relaxed and
   the cost roughly triples.
2. **Bundle the management-stage model?** Designed-together per the TODO, but
   built as a separate slice here. Confirm: separate branches, or one.
3. **Vocab: "step" vs "item."** This doc adopts "step." Confirm, since it touches
   user-facing copy.
4. **`objective` vs a new `notes` field.** Is the existing one-line `objective`
   enough grounding per step, or does a step need a longer free-text body? Lean:
   start with `objective`, add `notes` only if M2 shows it's thin.
5. **Plain-mode run linkage.** This doc keeps the engine untouched, so plain-task
   steps show no `runId`. A cheap alternative is to stamp the bare `runId` (not
   the curated `outcomeSummary`) in plain checklist runs too, so a plain step at
   least links to the run + commit that touched it. Deferred: it edits the core
   commit path (`orchestrator.ts:3762`) the original author deliberately gated.
   Lean: ship supervised-only first; revisit if the empty plain-step run block
   feels too bare.

## Review trail

Independent adversarial review (Opus 4.8, fresh context, 2026-06-30). Verdict:
**"the thesis holds and Option A is the right architecture... I would not switch
to B."** B was confirmed to contradict `saga-conductor.md` #1 (one-branch model)
and to force null-or-inherit on every scaffolding field.

Findings accepted and folded in:

1. **[HIGH] Plain-task steps never get run/outcome** - stamping is gated on
   `sagaMode` (`orchestrator.ts:3762`). The original table's unqualified "EXISTS"
   was wrong. Folded: the activity block is now explicitly supervised-populated
   with an honest plain-mode empty state; the engine is left untouched; the
   alternative (stamp bare `runId` in plain mode) is Open decision #5.
2. **[MED] M0 was mis-scoped** - per-step comments are wired client-to-disk
   already (`ui/lib/api.ts:1595-1610`, `server/routes/tasks.ts:27-33`,
   `roadmap-store.ts:152-173`); the only gap is the UI caller at
   `TaskDetailPage.tsx:167`. Folded: M0 collapsed from a round-trip scout to a
   decision + a single route check.
3. **[MED] Vocab blast radius overstated** - `type Step = ChecklistItem` has zero
   consumers; the rename is docs/copy only. Folded into the Vocabulary risk + M1.
4. **[LOW-MED] Inherited-blockers under-defended** - folded an explicit "array
   position, no per-step blocking relation, the constraint doesn't require one"
   into the Blockers section.
5. **[LOW] Two mental models (enrich vs promote)** - folded the UX guard that
   *open* and *promote* must be unmissably distinct.
6. **[LOW] Comment listing is O(all-comments)** - accepted as a non-issue at
   single-user scale; noted in the API section.

What the review checked and found genuinely safe: the no-migration claim (all new
`checklistItemSchema` fields are `.default()`ed, lossless upgrade), comment
`target`/`targetRef` preserved through every layer, the supervised one-branch
sequencing, band linearity, `promoteChecklistItem` being a relation not a
reparent, and no new unbounded loop / termination change.
