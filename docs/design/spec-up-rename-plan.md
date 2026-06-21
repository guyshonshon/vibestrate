# Rename "Shape" -> "Spec-up" (full, including internals)

Status: ready-to-execute plan (2026-06-21). Author: design pass; executor: a
fresh session (see the kickoff prompt at the bottom).

## Goal

Rename the product concept currently called **"Shape"** to **"Spec-up"** across
the whole codebase: flow-ids, API routes, CLI command, files, symbols, persisted
config/state fields, UI labels, and docs. The concept = the adaptive
"gather more specifications before building" phase (intake -> spec -> architecture
-> roadmap). Earlier runs' state may break (user explicitly accepted: "we don't
care about earlier runs").

## CRITICAL: this is a CONCEPT rename, NOT a global find-replace

`shape`/`Shape` also appears in the code with meanings UNRELATED to the Spec-up
concept. These must be LEFT ALONE:

- `predictedShape` and "shape of the (merge) tree" - the git-tree/merge feature.
- the `lucide-react` **`Shapes`** icon (imported in `RunGapQuestions.tsx`'s
  `CATEGORY_ICON`) - it's an icon name.
- prose in comments like "shape of the data / conflicts".

The executor MUST review each occurrence, not blind-`sed`. After the sweep, a
`grep -rin shape src tests` should return ONLY these documented unrelated uses.

## Magnitude (measured 2026-06-21)

~150 code files, ~911 lines mention "shape" (includes the unrelated uses above).
The single riskiest item: the persisted **`shaped`** RunSpec/state flag, **67
references** - renaming it is a zod-schema + persisted-state migration.

## Naming map

| Shape form | Spec-up form |
|---|---|
| flow-id `"shape-intake"` | `"spec-up-intake"` |
| flow-id `"shape"` | `"spec-up"` |
| flow-id `"shape-roadmap"` | `"spec-up-roadmap"` |
| `SHAPE_TARGET_FLOW` | `SPEC_UP_TARGET_FLOW` |
| route `/api/shape/*` | `/api/spec-up/*` |
| CLI `vibe shape` | `vibe spec-up` |
| dir `src/shape/` | `src/spec-up/` |
| `shape-chain.ts` / `shape-assist.ts` | `spec-up-chain.ts` / `spec-up-assist.ts` |
| `readShapeQuestions` | `readSpecUpQuestions` |
| `submitShapeAnswers` | `submitSpecUpAnswers` |
| `proceedToShapeSpec` | `proceedToSpecUpSpec` |
| `finalizeShapeSpec` / `decideShapeNext` | `finalizeSpecUpSpec` / `decideSpecUpNext` |
| `startShapeIntake` | `startSpecUpIntake` |
| `approveShapeAndBuild` / `approveShapeAndStartRoadmap` | `approveSpecUpAndBuild` / `approveSpecUpAndStartRoadmap` |
| `isShapingRun` | `isSpecUpRun` |
| `ShapeQuestion` / `ShapeQuestionCategory` | `SpecUpQuestion` / `SpecUpQuestionCategory` |
| `ServedShapeQuestion` / `FlowShapeQuestion` | `ServedSpecUpQuestion` / `FlowSpecUpQuestion` |
| `flowShapeQuestionSchema` / `shapeQuestionCategorySchema` | `flowSpecUpQuestionSchema` / `specUpQuestionCategorySchema` |
| `ShapeChainError` / `ShapeAssistError` | `SpecUpChainError` / `SpecUpAssistError` |
| `shapeAssist` / `shapeSimplify` / `shapeSuggest` / `shapeSuggestAll` | `specUpAssist` / `specUpSimplify` / `specUpSuggest` / `specUpSuggestAll` |
| `shapeAnswerSchema` / `ShapeAnswer` | `specUpAnswerSchema` / `SpecUpAnswer` |
| `registerShapeRoutes` / `buildShapeCommand` | `registerSpecUpRoutes` / `buildSpecUpCommand` |
| `ShapeReview` / `ShapeRunActions` (components + files) | `SpecUpReview` / `SpecUpRunActions` |
| `shapeFlow` / `shapeIntakeFlow` / `shapeRoadmapFlow` | `specUpFlow` / `specUpIntakeFlow` / `specUpRoadmapFlow` |
| `needsShaping` (selection) | `needsSpecUp` |
| `adaptiveShape` (config) | `adaptiveSpecUp` |
| `shapeTargetFlowId` | `specUpTargetFlowId` |
| `shapeRound` | `specUpRound` |
| `shapeRootRunId` | `specUpRootRunId` |
| `shapeRunId` | `specUpRunId` |
| `shapeQuestions` / `shapeMeta` (UI state) | `specUpQuestions` / `specUpMeta` |
| `willShape` | `willSpecUp` |
| persisted **`shaped`** (RunSpec loop-guard flag) | **`specUpPhase`** (boolean: "this run is part of the spec-up pipeline; don't re-enter spec-up") |
| `WorkflowSelectionSource` value `"shaped"` (selection-source enum) | `"spec-up"` (a DIFFERENT concept from the flag: "selection routed this brief into the spec-up chain") |
| proposal-id prefix `` `shape-${runId}` `` (writer + `startsWith("shape-")` reader) | `` `spec-up-${runId}` `` / `startsWith("spec-up-")` |
| flow step id `"shape-review"` (nested step in the `shape` flow) | `"spec-up-review"` |
| sidecar filenames `shape-target-flow.json` / `shape-round.json` / `shape-root-run.json` / `shape-answers.md` / `shape-approved-spec.md` | `spec-up-*` (rename write-sites + read-constants ATOMICALLY) |
| route `/api/runs/:id/shape-questions` (separate from `/api/shape/*`) | `/api/runs/:id/spec-up-questions` |
| audit labels `AUDIT_BUCKET="shape-assist"`, `shape-simplify:` / `shape-suggest:` / `shape-suggest-all` | `spec-up-assist`, `spec-up-simplify:` / `spec-up-suggest:` / `spec-up-suggest-all` |
| UI text "Shape" / "Shaping" | "Spec-up" |
| `markIntakeAnswered` / `runAwaitsInput` | unchanged (no "shape" in the name) |

Decision (made by the executor, 2026-06-21): the persisted flag `shaped` ->
`specUpPhase` (NOT `speccedUp` - that double-c form is hard to grep and people
write it three different ways). The selection-source enum `"shaped"` is a
SEPARATE concept and gets its own name `"spec-up"`. Neither retains the `shaped`
token. Both are in scope; old persisted state with the old keys/values will fail
to parse or fall through to a default - accepted ("we don't care about earlier
runs").

## Surfaces and sequencing

Do them in this order. Run `pnpm typecheck && pnpm test` after EACH surface and
commit per surface (so a break is isolated). Some surfaces must change all
references atomically to keep typecheck green.

1. **Flow-ids + flow definitions.** `src/flows/catalog/builtin-flows.ts`
   (`shapeIntakeFlow`/`shapeFlow`/`shapeRoadmapFlow` + the id strings),
   `SHAPE_TARGET_FLOW`, and every `"shape-intake"` / `"shape"` / `"shape-roadmap"`
   literal across the codebase (incl. `runAwaitsInput`'s `"shape-intake"` check in
   `spec-up-chain.ts`, `willShape` in `run-launcher.ts`, the flow-sizing/select-
   workflow paths, tests).
2. **Persisted config/state fields (RISKIEST).** `shaped` -> `specUpPhase`,
   `shapeTargetFlowId`, `shapeRound`, `shapeRootRunId`, `needsShaping`,
   `adaptiveShape`. These live in zod schemas (`run-launcher.ts` RunSpec, project
   config, `select-workflow.ts`, state). Rename the schema keys + every read/write.
   Old state.json with the old keys will fail to parse - accepted. ALSO in this
   surface: the `WorkflowSelectionSource` enum value `"shaped"` -> `"spec-up"`
   (`select-workflow.ts`, `orchestrator.ts`, `run.ts`, UI `types.ts`,
   `SupervisorPanel.tsx`) - a separate concept that shares the token. AND the
   on-disk **sidecar filenames** (`shape-target-flow.json`, `shape-round.json`,
   `shape-root-run.json`, `shape-answers.md`, `shape-approved-spec.md`): rename the
   write-sites (`orchestrator.ts`) and the read-constants (`shape-chain.ts`)
   ATOMICALLY in the same commit, or an in-flight chain reads a stale sidecar and
   silently resets - no typecheck/unit signal.
3. **Core module.** `git mv src/shape -> src/spec-up`, rename the two files, fix
   all imports, rename the symbols per the map.
4. **API routes.** `src/server/routes/shape.ts -> spec-up.ts`; `/api/shape/* ->
   /api/spec-up/*`; the SEPARATE `/api/runs/:id/shape-questions ->
   /api/runs/:id/spec-up-questions` route (different prefix - easy to miss);
   `registerShapeRoutes -> registerSpecUpRoutes` + `server.ts` registration. THEN
   the UI client `src/ui/lib/api.ts` methods + their `/api/shape/*` AND
   `/api/runs/:id/shape-questions` paths. A path renamed on only one side = a
   typecheck-green 404 at runtime, so do server + client (+ tests) together.
5. **CLI.** `src/cli/commands/shape.ts -> spec-up.ts`; `new Command("shape") ->
   "spec-up"`; `buildShapeCommand -> buildSpecUpCommand`; `src/cli/index.ts`
   registration; all help text.
6. **UI components + types.** `RunGapQuestions.tsx` labels, `ShapeReview ->
   SpecUpReview`, `ShapeRunActions -> SpecUpRunActions` (files + symbols),
   `src/ui/lib/types.ts` (`ShapeQuestion` etc.), all user-facing "Shape"/"Shaping"
   text. KEEP the lucide `Shapes` icon import.
7. **Docs (61 files).** `docs/design/shape-phase.md`, `docs/superpowers/specs/
   *shape*`, README, CHANGELOG, `docs/content/*`. Rename files + content. Update
   `docs/design/task-lifecycle.md` references. Regenerate `pnpm docs:generate`.
8. **Tests.** Rename test files + symbols + fixtures referencing shape.

## Verification (final)

- `pnpm typecheck && pnpm test && pnpm build` all green.
- Grep audit: `grep -rin shape src tests` returns ONLY the documented unrelated
  uses. EXPECT this to be dozens of lines, not a handful: `predictedShape` and the
  merge-tree "shape of the tree"; the lucide `Shapes` icon; and a LOT of prose
  ("secret-shaped", "token-shaped", "high-precision token shapes", "shape of the
  data", "execa shapes", etc.) plus the embedded LLM-prompt text inside
  `tests/fixtures/codex-debug-models.json`. List the categories in the final
  report; the audit passes when every survivor is one of these, NOT when the count
  is zero.
- Smoke: `vibe spec-up start "<idea>"` works; opening that run renders the
  questions screen; the dashboard "Plan first" path still lands on it.

## Next steps after the rename

- CHANGELOG entry + version bump (CLAUDE.md s10).
- Update the auto-memory: the project was renamed Shape -> Spec-up.
- Still-deferred from `docs/design/task-lifecycle.md`: P1 (a real `awaiting_input`
  RunStatus) and P3 (execution-resume-after-process-death). Both remain optional.

## Kickoff prompt (paste into a fresh session)

> Execute the full "Shape" -> "Spec-up" rename per
> `docs/design/spec-up-rename-plan.md`. This is a CONCEPT rename, NOT a global
> find-replace: rename only the Spec-up concept per the naming map, and do NOT
> touch unrelated "shape" uses (`predictedShape`, the lucide `Shapes` icon, prose
> "shape of X"). Work surface-by-surface in the documented order; run
> `pnpm typecheck && pnpm test` after each surface and commit per surface. The
> persisted `shaped` field (surface 2) is the riskiest - it's a schema migration
> and earlier runs may break, which is accepted. Confirm the `shaped ->
> speccedUp` choice (or pick one term and apply consistently). Finish with
> `pnpm build`, a grep audit (only the documented unrelated "shape" uses may
> remain - list them), a CHANGELOG entry + version bump, and a final report. Do
> it on a dedicated branch off `main`.
