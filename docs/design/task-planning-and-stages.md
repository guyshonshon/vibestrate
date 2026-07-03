# Task planning front-door + management stages

Status: revised (2026-07-03) - **Slice B (management stages) DROPPED**; only
Slice A (guided plan) proceeds.

## Decision: Slice B dropped

The owner chose "skip manual stage entirely" after an adversarial review, and the
review independently reached the same conclusion. The board already **flows
naturally** from run-status (`coarseColumnOf`), and the **roadmap** (macro
planning) + the auto-derived board (execution position) already carry the
planning-vs-status distinction the owner cares about. A user-settable stage
kanban would (a) require forced manual card moves, which the owner explicitly
rejected ("it is suppose to happen naturally"), and (b) the naive design was
buggy: the seed-from-status migration is **dead code** (`migrateTaskShape`
early-returns for any task without legacy saga keys, `migrate-task.ts:29`), the
`needs_testing` advisory lane would be silently dropped, and drag-set-stage on a
live card reintroduces the risk the "drag is dismiss-only" model avoided. If ever
revived, the safe shape is a nullable `stage` pin with `column = stage ??
coarseColumnOf(task)`, overlays always winning, live cards locked - not a
wholesale column replacement. Not building it now.

Slice B design notes below are retained for the record but are NOT being built.

---


Two related slices under the "tasks have structure" theme. Grounded against the
code (two read-only explorations); the load-bearing findings are cited.

## Slice A - Guided plan (the front door for steps)

### Reframe (from grounding)
The ask was "wire spec-up as the plan front door." But **spec-up does not produce
a task's checklist** - it is a *pre-task* flow: idea → clarifying questions → spec
→ a **proposal of many task cards** (`VIBESTRATE_TASK` blocks → `ProposalService`
→ accept as cards) (`spec-up-chain.ts:638-654`, `builtin-flows.ts:1390-1398`).
That is idea→cards (macro), not one-task→steps (meso). The owner wants one task
broken into steps *after* a few questions - the `enhance` altitude
(`enhance.ts:54-112`, one-shot, writes `task.checklist`).

So we do **not** wire the spec-up chain. We reuse the **generic pieces**:
- the question schema `flowSpecUpQuestionSchema` (`flow-output-contracts.ts:257`)
  - id / question / why / kind(choice|text) / options / category;
- the answer UI idiom (`RunGapQuestions.tsx`);
- the server-owned round discipline (but a **lower cap** - meso needs 1 round,
  not spec-up's 4).

### Design
"Plan the steps" gains a **guided** path:
1. `proposeChecklistQuestions(taskId)` - one model turn over the brief + acceptance
   + context, returns 3-6 structured clarifying questions (reuse the schema). No
   run, no chain - a bounded assist like `proposeChecklist`.
2. UI shows the questions inline in the checklist panel (compact, reusing the
   RunGapQuestions treatment); the user answers.
3. `enhanceChecklist(taskId, { answers })` - the **existing** enhance, with the
   answers injected into its prompt as extra grounding, produces the ordered
   steps.

The plain one-shot "Plan the steps" stays (guided is the richer path, offered
alongside). This is `enhance + a pre-questioning round`, entirely self-contained -
no detached run, no proposal, no card creation.

### Surfaces
- Service: `proposeChecklistQuestions` in `src/roadmap/enhance.ts` (or a sibling);
  extend `proposeChecklist`/`enhanceChecklist` to accept `answers`.
- HTTP: `POST /api/tasks/:id/checklist/plan-questions` + pass `answers` to the
  existing enhance route.
- UI: a "Guided" affordance on the plan CTA → questions panel → enhance.
- CLI parity: `vibe tasks plan <id>` (questions) + answers flow, or fold into
  `vibe tasks enhance --guided`.

## Slice B - Management-stage model (schema change - Tier-2)

### What exists
No stage field today (`roadmap-types.ts` taskSchema). The Board's columns are
**derived** at render from `status + archived + needsTesting` via `coarseColumn()`
(`roadmap-types.ts:384`); drag is **dismiss-only** (→ archive = `cancelTask`,
`BoardPage.tsx:330-350`). `status` is run-driven, not in `patchBody`
(`tasks.ts:81`). New `.default()` fields upgrade old task files losslessly on read
(`migrate-task.ts`, `roadmap-store.ts:108`).

### Design
- **New field** `task.stage` - a user-settable workflow position, **distinct from
  run `status`**. Fixed enum (V1, not user-definable - avoids a config subsystem):
  `backlog | planned | in_progress | review | done`. `archived` stays a separate
  overlay.
- **Board reads `stage`** for its columns (replaces the `coarseColumn` derivation
  on the planning Board). A card's run `status` renders as a **badge** on the card,
  not the column.
- **Drag = set stage** (`setTaskStage` service + `stage` in `patchBody`). Still no
  execution on drag - setting stage is safe metadata (the deliberate "drag never
  runs" safety model holds).
- **Overview panel + card**: show and set stage (this is the "settable status" the
  owner asked for earlier - now honestly a *stage*, not run-status).
- **API/CLI**: `stage` in `patchBody`; `vibe tasks stage <id> <stage>`.

### Initial value for existing tasks (the migration question)
A Zod `.default()` is static, so all pre-existing tasks would land in one stage.
Two options:
- **Static default `backlog`** - simplest; a running/done task shows in Backlog
  until the user drags it. Matches the pre-publish "no backfills" rule.
- **Seed stage from status once** (in `migrateTaskShape`: running→in_progress,
  done→done, review→review, else backlog) - preserves board position, but is the
  kind of derived-backfill the pre-publish rule discourages.
Lean: **seed from status once** (the Board is the owner's primary surface; landing
every in-flight card in Backlog is a worse first impression than a one-time map).
Open for the reviewer + owner.

### How stage and run-status coexist
Stage is **fully user-owned** in V1; run-status does **not** auto-advance stage (a
finished run leaves the card where the human put it - Linear-style). No auto-sync,
no coupling. (A gentle "move to review?" nudge on run completion is a later idea,
not V1.)

## Build sequencing
- **B1 (schema + core, Tier-2 after review)**: `stage` field + default/seed +
  `setTaskStage` + `patchBody` + CLI. Pure data; no UI yet.
- **B2 (Board)**: Board columns read `stage`; drag sets stage; run-status badge on
  the card.
- **B3 (overview/card)**: set stage from the task overview panel.
- **A1 (questions service)**: `proposeChecklistQuestions` + answers→enhance.
- **A2 (UI)**: guided plan panel in the checklist section.
Each depends only on earlier ones; B (self-contained schema) before A (assist).

## Open decisions (owner)
1. **Stage vocabulary**: fixed `backlog/planned/in_progress/review/done` vs another
   set vs user-definable stages.
2. **Board switch**: fully stage-driven columns (recommended) vs stage as a new
   secondary board axis alongside the status-derived one.
3. **Initial stage**: seed-from-status vs static `backlog`.

## Review trail

Independent adversarial review (Opus 4.8, fresh context, 2026-07-03) of Slice B.
Biggest flaw it caught: the "seed stage from status" migration would be **dead
code** - `migrateTaskShape` early-returns for any task without legacy saga keys
(`migrate-task.ts:29`), so every current task skips it and would silently default
to Backlog. It also found `coarseColumn()` has no runtime consumers (the Board
uses a local `coarseColumnOf` mirror), the `needs_testing` lane would be dropped,
`stage` needed adding in three places not one, and live-card drag-to-stage
reintroduces the risk the "drag is dismiss-only" model avoided. Combined with the
owner's "it should happen naturally" - **Slice B was dropped.** The verdict's
safer shape (nullable `stage` pin, `column = stage ?? coarseColumnOf`) is recorded
above for any future revival.

Slice A (guided plan) SHIPPED: `proposeChecklistQuestions` + answers threaded into
`enhanceChecklist` (`src/assist/enhance.ts`), `POST /api/tasks/:id/plan-questions`
+ `answers` on the enhance route, and the guided questions panel in the checklist
section. Verified: backend by fake-runner unit tests (`tests/enhance.test.ts`, +3),
UI panel by a stubbed round-trip in the preview. The live model round-trip needs a
configured provider (not exercisable in the dev preview).
