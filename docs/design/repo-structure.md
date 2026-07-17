# Repo structure: consolidation + big-file split program

Status: COMPLETE - all four waves executed (A+B 2026-07-16, C+D 2026-07-17).
Wave D outcome: core/'s 65 flat files -> 11 root hubs + 6 evidence-based
clusters (run/ 18, context/ 8, codebase/ 8, metrics/ 7, validation/ 7,
stores/ 6). state-machine.ts deliberately stays at root: it is the run
domain's shared type vocabulary (97 importers) - moving it would have been
95 rewrites for taxonomy purity. Every stay-root file has a stated reason
(cross-cutting primitive or fixed coupling). 467 specifiers rewritten via
the codemod, extended to cover inline import("...").Type nodes.
Wave C outcome: api.ts 2,759 -> 102-line barrel over 25 lib/api/ slices
(239/239 methods byte-identical, composition-guard test added); six pages
extracted into components/<domain>/ (FlowBuilder 2,497->976, TaskDetail
1,871->454, Crew 1,727->394, Metrics 1,487->177, ProvidersView 1,472->426,
Board 1,443->608); duplicated Toast/toneForId/FormField/IconBtn/formatters
hoisted to design/; reviews seams extracted (checkPatchSafety -> safety/,
patch-apply.ts, smart-apply.ts). Rendered click-through of all six pages
verified, both themes, zero console errors.
Wave B outcome: orchestrator.ts 7,876 -> ~5,200 lines, 12 modules under
core/run-engine/ (types, signals, helpers, flow-run-state, flow-outputs,
resume-seeder, validation, report, approval-gate, budget-governor,
resilient-provider, saga-turns); notify monkey-patch replaced by a typed
field; RunContext named; dead core/run-context.ts and the unused
permissionModeEvaluators re-export deleted. Adversarial diff review vs main
(all 8 risk seams attested, 4,069 diff lines swept): no BLOCKER, no MAJOR.
The runners (runFlowSequence/runGraphFrontier/runRole) stay in the class by
design - split only if a future need arises.

## Context

`src/` accreted into 37 flat sibling directories (631 ts/tsx files, ~153k
lines; ~211k including tests and scripts). Half are fragments (1-5 files)
whose domain lives elsewhere; a few files are monsters
(`core/orchestrator.ts` alone is 7,876 lines - ~5% of src). The goal is a
minimal, honest layout: every top-level directory is a real domain, every
file small enough to read, with zero behavior change.

This is a four-wave program. Each wave is one branch, verified
(typecheck/test/build, plus `scripts/verify-pack.sh` for Wave A) and merged
before the next starts.

## What exists (grounded)

- All imports are relative with `.js` extensions; no path aliases in use
  (the `@/*` alias exists for `src/ui` but has zero users). Rewrites are
  mechanical, but must cover dynamic `import("...")` literals too.
- Depth-coupled resolvers: ~10 files locate `dist/` by counting `..` hops
  from `import.meta.url` (`core/detached-run.ts`, `server/server.ts`,
  `scheduler/*` x3, `workspace/workspace-runtime.ts`,
  `shell/ink/runner/command-runner.ts`, `cli/commands/{tasks,doctor}.ts`).
  None of these files move in Wave A; moved files keep their depth or have
  no such resolver.
- Hard couplings requiring paired edits: `tsup.config.ts` entries
  (`src/cli/index.ts`, `src/core/run-entry.ts` - neither moves),
  `package.json files[]` ships `src/roles/default-prompts` and
  `src/ui/lib/types.ts`, and `roles/default-roles.ts` walks for the literal
  segments `["src","roles","default-prompts"]`.
- `tests/` holds ~1,300 hardcoded `../src/<domain>/` imports; test files do
  not mirror src dirs and do not need to move - only their specifiers.
- `scripts/` is gitignored (`.gitignore:52`) yet referenced by
  `package.json` (`docs:generate`, `demo`) - a fresh clone cannot run those.
  Pre-existing bug, surfaced separately; scripts are still rewritten locally
  so the pnpm scripts keep working.
- `scripts/generate-docs-metadata.ts:372` emits paths under
  `src/agents/default-prompts/` which does not exist today (stale). The
  Wave A `agents/` consolidation makes this path correct.

## Wave A - directory consolidation (37 -> 23)

Fold every fragment into its natural parent. No new nesting layers except
where a fragment becomes a subdirectory of its domain. No behavior change.

| Move | Into | Why |
|---|---|---|
| `platform/` (2) | `utils/` | pure OS helpers; consumers are low-level |
| `notes/` (1) | `core/` | a per-run store like every other core store |
| `telemetry/` (1) | `core/` | reads core's metrics-store; 1 file |
| `assist/` (2) | `core/assist/` | shared primitive with 8 consumer dirs |
| `feature/` (5) | `core/saga/` | it IS the saga machinery; "feature" says nothing |
| `execution/` (4) | `core/execution/` | run-execution backends |
| `workflow/` (4) | `core/workflow/` (3) + delete `workflow-runner.ts` | the runner facade has ZERO importers (verified) - plain dead code |
| `pickup/` (2) | `core/` | its only consumers are `core/orchestrator.ts` + `core/run-brief.ts`; the import graph has no roadmap edge |
| `integration/` (3) | `git/` | merge-preview is git-domain |
| `permissions/` (3) | `safety/` | access-policy = the guardrail cluster |
| `mcp/` (3) | `providers/mcp/` | MCP server config for provider processes |
| `roles/` + `crews/` + `profiles/` + `skills/` (13 + prompts) | `agents/` (new) | one config chain: crew -> role -> profile -> skills |
| `orchestrator/` (11) | `supervisor/` (rename) | it is the supervisor decision layer (personas, archetypes, lenses, sizing); kills the clash with `core/orchestrator.ts` |

Unchanged: `cli`, `server`, `shell`, `ui`, `core`, `flows`, `providers`,
`project`, `roadmap`, `git`, `reviews`, `safety`, `policies`, `scheduler`,
`setup`, `notifications`, `consult`, `spec-up`, `terminal`, `workspace`,
`utils`.

During the move, `feature/supervisor.ts` is renamed to
`core/saga/saga-supervisor.ts` so the repo doesn't end up with three modules
named `supervisor.ts` (`src/supervisor/`, the saga one, and
`cli/commands/supervisor.ts`).

Paired edits in the same commit (expanded by adversarial review):
- `package.json:23` files[] -> `src/agents/default-prompts`.
- `agents/default-roles.ts` literal segments -> `["src","agents","default-prompts"]`.
- `tests/default-prompts-resolution.test.ts` - layout-coupled in 3 places
  (tmp fixture path, repo stat-check, files[] assertion).
- `tests/guided-merge.test.ts:340-353` - live-greps the repo and asserts
  the literal path `src/integration/integration-service.ts`.
- `docs/content/architecture/directory-map.md` - shipped handwritten doc of
  the src layout; rewrite for the new map (it was ALREADY stale from a past
  rename - it documents a nonexistent `src/agents/agent-schema.ts`).
- `scripts/generate-docs-metadata.ts:286` prose says
  `src/workflow/default-workflow.ts` (goes wrong); `:372` says
  `src/agents/default-prompts` (goes right); regenerate `docs/generated/`.
- Rewrite all static + dynamic relative imports across `src/`, `tests/`,
  `scripts/` via an AST codemod (TS compiler API over module specifiers +
  ImportCall arguments) - NOT sed; multiline dynamic imports exist (e.g.
  `server/routes/tasks.ts:363`). Post-pass: grep every retired dir name
  across file CONTENTS (not just import lines) in src/tests/scripts.
- `.vibestrate/CODEBASE.md` is a regenerable cache; regenerate or let
  `vibe learn` refresh it.

Explicitly NOT moving: `consult`/`spec-up`/`terminal`/`workspace` (small but
cohesive, real domains; an umbrella `features/` dir would be a junk drawer),
`policies` (user-facing rules feature, distinct from safety enforcement),
`setup`, `skills`-as-standalone (absorbed into `agents/` instead).

## Wave B - split `core/orchestrator.ts` (7,876 lines)

External surface is only 6 symbols used by 3 files (`Orchestrator`,
`makeRunId`, `OrchestratorInput/Output`, `ResumeFromInput`, `ResumeStage`) -
keep them re-exported from `orchestrator.ts` so no consumer changes.

Extraction order (each step verified before the next):
1. Pure, zero-`this`: types (~150 L), control-flow signals (~95 L), helpers
   (~80 L). `permissionModeEvaluators` moves to the pure module and STAYS
   exported - `tests/permission-modes.test.ts:8` imports it (the "no external
   importer" scout claim was src-only and wrong); repoint that test's import.
2. `flow-run-state.ts`: the RunState transforms (`patchFlowStep` has 20 call
   sites - extract as free functions).
3. `flow-outputs.ts` (~440 L), `resume-seeder.ts` (~240 L),
   `orchestrator-validation.ts` (~230 L), `orchestrator-report.ts` (~170 L),
   `approval-gate.ts` (~280 L).
4. Prerequisite for the hard core: name the inline `ctx` object (redeclared
   in ~6 signatures) as an explicit `RunContext` type, and replace the
   `(this as any).notify` monkey-patch with an explicit dependency.
5. `budget-governor.ts` (stateful: owns the spend/turn counters),
   `resilient-provider.ts` (~250 L), `saga-turns.ts` (~430 L).
6. The runners (`runFlowSequence` ~2,080 L, `runGraphFrontier` ~823 L,
   `runRole` ~964 L) stay in the class last; splitting them is optional and
   only after 1-5 shrink the file to its core.

Result target: `orchestrator.ts` drops from ~7,900 to ~3,500 lines (the two
runners + `run()` bootstrap), with ~10 focused modules in a sibling
directory. Naming note from review: `core/orchestrator/` (dir) beside
`core/orchestrator.ts` (file) re-creates the exact name clash Wave A's
supervisor rename kills - name the module dir `core/run-engine/` (or fold
the remaining file in as the directory's index) when Wave B lands.

The external surface (~50 test files also import from `orchestrator.js`,
not just the 3 src consumers) stays safe because every extracted symbol is
re-exported from `orchestrator.ts`.

## Wave C - split the big UI/service files

- `ui/lib/api.ts` (2,759): barrel split - transport to `lib/api/http.ts`,
  the ~239 methods sliced along existing section dividers into
  `lib/api/<domain>.ts`, re-spread into `export const api = {...}` so all
  197 call-site forms stay untouched. Move the 43 stranded DTO types to the
  types home. Highest-value split in the batch.
- `ui/lib/types.ts` (2,332): pure type bag - leave (near-zero maintenance
  cost; hand-splitting touches 84 importers). Optional barrel-split later.
- Route pages (`FlowBuilderPage` 2,543, `TaskDetailPage` 1,871, `CrewPage`
  1,752, `MetricsPage` 1,487, `ProvidersView` 1,472, `BoardPage` 1,443):
  extract the audited section clusters into their existing `components/<domain>/`
  homes. Presentational-only; no behavior change.
- Hoist confirmed duplicates into `components/design/`: Toast (x5 files!),
  `toneForId` hash (x2), `FormField` (x2), `IconBtn` (x2), `EmptyState` (x2),
  `fmtCost`/`fmtTokensShort` into `design/format.ts`.
- `reviews/`: move `checkPatchSafety` to `safety/` (its real consumers),
  hoist the byte-identical `relToRun` + shared apply/validate/revert into
  `reviews/patch-apply.ts`, extract `smartApply` (~460 L) to
  `reviews/smart-apply.ts`.
- `flows/catalog/builtin-flows.ts` (1,429): pure data catalog - leave as is.

## The risks that decide success

- Import-rewrite completeness: dynamic `import("...")` literals and
  scripts/ are the miss-prone classes. Mitigation: one codemod that resolves
  every relative specifier to an absolute path and re-relativizes, then a
  post-pass grep for every retired directory name.
- Behavior drift during the orchestrator split: mutable `this` state
  (budget counters, prompt blocks) is shared across methods. Mitigation:
  extraction order above (pure first), full test suite between steps.
- Scope: this program does NOT redesign any behavior, rename product
  concepts, or touch the UI's rendered output. Done = same tests pass, same
  bundles build, `src/` has 23 dirs, no file over ~2,600 lines outside the
  two runners.

## Wave D - sub-organize `core/`

Committed, not optional (review finding: "the findability problem is core/:
62 flat files, and Wave A makes it worse"). After Wave B lands (it changes
core's census), group core's flat files into cohesive subdirectories
(stores, run lifecycle, validation-profiles, services), keeping
`run-entry.ts` (tsup entry) and `detached-run.ts` (depth-coupled resolver)
stable or updating their couplings deliberately.

## Build sequencing

M0 (scout): completed - 4 read-only agents mapped dependencies, seams, and
constraints (2026-07-16). Wave A -> B -> C -> D, one branch each, merged in
order.

## Open decisions

- Tracking `scripts/` in git: DECIDED 2026-07-17. The six load-bearing files
  (generate-docs-metadata.ts, prepublish-trim.mjs, release.sh, verify-pack.sh,
  update-deps.sh, demo-simulation.ts) are tracked via `/scripts/*` plus
  explicit `!` negations, so a fresh clone can run `docs:generate`, `demo`,
  `release`, `update-deps`, and `prepublishOnly`. One-off probe/eval scripts
  stay ignored by default; new scratch files in `scripts/` are ignored unless
  deliberately un-ignored.

## Review trail

Adversarial review (2026-07-16, fresh-context agent, all claims verified
against code): 1 BLOCKER + 4 MAJOR + 7 MINOR, no fatal flaw. Key catches,
all folded in above: `permissionModeEvaluators` IS test-imported;
`tests/guided-merge.test.ts` asserts literal repo paths;
`tests/default-prompts-resolution.test.ts` is layout-coupled x3; shipped
`directory-map.md` + generator prose strings go stale; `workflow-runner.ts`
has zero importers (scout overcount); `pickup` belongs to `core` not
`roadmap`; AST codemod required (multiline dynamic imports); core/ flatness
promoted to committed Wave D. Verified-safe by the review: no filename
collisions on any move, no import cycles created (safety<->permissions,
core/saga, git<-integration, providers<-mcp all one-way), no depth-coupled
resolver in any moved dir except the already-paired `default-roles.ts`, no
vi.mock/require/snapshot coupling to moved paths, packaging + CI unaffected.
