# Legacy-design sweep: pages and components affected

Complete audit of `src/ui` (174 `.tsx` files) against
[`primitives-contract.md`](./primitives-contract.md), with Mission Control as
the reference idiom. Started 2026-07-24, closed 2026-07-25.

The hard-no categories are now enforced by `tests/ui-design-drift.test.ts`, so
this document records *what was found and what was decided* - the build, not
this page, is what keeps them from coming back.

## Where it landed

| Category | Before | After |
|---|---|---|
| Retired token generation (`vibestrate-*`, `fog-*`, `ink-*`) | widespread | **0** |
| `text-chalk-500` (never a defined token) | 6 | **0** |
| Orphaned `--s-*` scene vars (resolved to *no colour*) | 2 files | **0** |
| `var(--popover)` | 1 | **0** |
| `animate-pulse` (the one banned animation) | 1 | **0** |
| White-alpha hairlines/fills (do not invert in light theme) | 5 | **0** |
| Keyword rounding (`rounded-md/lg/sm/xl`) | 11 | **0** |
| Eyebrow kickers | 12 | **3, all verified legitimate** |
| Grey `·` meta lines | 8 | **4, all verified legitimate** |
| Forked flow cards | 3 | **1 shared `design/FlowCard`** |

## Every file changed (87 in src/ui, +2,779 / -2,287)

Generated from `git diff --name-status main..design/legacy-sweep`.

**Pages (14)** - `MissionControlPage`, `RunDetailPage`, `RunComposePage`, `RunsPage`,
`FlowsPage`, `FlowBuilderPage`, `BoardPage`, `ProposalsPage`, `ProfilesPage`,
`ProjectPage`, `WorkspacePage`, `InitScreen`, `InitGate`, `App`.

**Design layer** - `FlowCard` (new; retired 3 forks), `ConfirmDialog` +
`confirm-controller` (new), `Chip`, `EffortScale`, `ErrorState`, `HeroCard`,
`Sparkline`, `Terminal`, `useToast`. `Brand` deleted (dead).

**Runs** - `LiveTimeline`, `LiveOutputPanel`, `RunGapQuestions`,
`SuggestionsPanel`, `ReviewPassPanel`, `ReviewFindingsPanel`, `RunTree`,
`SpecUpReview`, `StepsInspector`, `SupervisorPanel`, `SchedulerQueuePanel`,
`RunHeaderV3`, `InspectorTabs`.

**Layout/shell** - `AppShell`, `Sidebar`, `PanelBoard`, `Breadcrumbs`,
`CliHintOverlay`, `HelpOverlay` (content rewritten).

**Git** - `MergeView`, `MergePlannerPanel`, `ConflictResolver`, `DiffViewer`,
`ChangedFilesList`.

**Tasks/board** - `ChecklistSection`, `DependenciesSection`, `FilesSection`,
`StepDetailDrawer`, `TaskGitActivity`, `BoardColumn`, `MicroStepPipeline`.

**Metrics** - `ActivityHeatmap`, `BudgetControl`, `LeaderboardTable`, `RunsPanel`.

**Control (kiosk route)** - `RunControlPage`, `viz`.

**Other** - `ArtifactList`, `FileTreeView`, `FileViewer`,
`ProfileMaintenancePanel`, `ConsultDock`, `RoleCard`, `MissionComposer`,
`AssistPopover`, `TourOverlay`, `LedgerView`, `ProjectParamsPanel`,
`ReplayPanel`, `StepInspector`, `TerminalPanel`, `FlowGraph`. `WorkflowTimeline`
and `ActiveRoleCard` deleted (dead - no consumers anywhere in src/tests/scripts/docs).

Plus `index.css`, `main.tsx`, and 6 `lib/` files.

## Browser-native dialogs: all 21 replaced

`window.confirm`/`window.prompt` rendered in the browser's chrome, could not be
styled, and every one gated a destructive action. Replaced by
`design/ConfirmDialog`, whose settlement rules live in `confirm-controller.ts`
(pure, unit-tested) and FAIL CLOSED: `true` only via an explicit accept; cancel,
Escape, backdrop, teardown and being superseded all decline; calling outside the
provider throws rather than defaulting.

Two real bugs surfaced during the migration:

1. **Four consent gates failed OPEN.** `typeof window !== "undefined" &&
   !window.confirm(...)` skips its `return` when `window` is undefined, and
   `typeof window === "undefined" || window.confirm(...)` yields `true` - both
   let the destructive action run unconfirmed. Guards removed; the new dialog has
   no `window` dependency.
2. **The replacement was not actually modal.** `window.confirm` blocked the event
   loop, so the app's global hotkeys could not fire; the in-app dialog does not
   block, and those handlers assumed it did. `?` opened help over a live gate,
   `g h` navigated away mid-await, and Cmd-K opened the run switcher *under* the
   scrim and stole focus into an invisible input. Keys are now swallowed at
   capture while a gate is pending (scoped so the prompt field keeps its own),
   and the dialog sits at `z-[110]`, above `HelpOverlay`'s `z-[100]`.

## Verification

`tests/ui-design-drift.test.ts` fails the build on any retired pattern
reappearing. `tests/ui-confirm-controller.test.ts` pins the fail-closed consent
rules. Both mutation-checked in each direction.

DOM-level behaviour of the dialog (Escape, backdrop, focus, z-order) is **not**
covered by a test - this repo has no jsdom and none was added for it. Verified by
reading and by an adversarial review that checked z-order in a real browser.

## The three systemic findings, and what they turned out to be

1. **An orphaned token system was live.** `RunTree.tsx` and `SpecUpReview.tsx`
   were styled against `--s-*` custom properties defined only under
   `[data-scene]` - which **nothing in the app ever set**. `--s-ink`,
   `--s-accent`, `--s-danger` and friends resolved to nothing at render time.
   `SpecUpReview.tsx` had already hardcoded `#f08a8a` as a fallback for the
   undefined `--s-danger`, which was the tell. Both files are now on real
   tokens. `--s-slab`/`--s-line` survive: they are genuinely defined in both
   themes and drive `.deep-scene`.
2. **Five pages never migrated to the page shell.** `RunComposePage`,
   `FlowsPage`, `FlowBuilderPage` and `RunDetailPage` hand-rolled `px-10 py-7`
   canvases with raw `<h1>`s. All are now on `PageShell`/`PageHeader`.
3. **`InitScreen` was a different generation entirely** - `fog-*`/`ink-*`,
   `border-white/10`, `rounded-md` - and it is the first screen a new user ever
   sees. Rebuilt on the current system.

## Pages

| Page | Outcome |
|---|---|
| `RunDetailPage.tsx` | On `PageShell`. Had **two competing heroes** (the header had been rebuilt as a `HeroCard` while `RunStatusSection` below already was one, printing title and status twice). Header is now a compact trail; the hero leads the page. Local `Stat`/`MetaPair` retired for `StatTile`; `cnFileTab` for `SegmentedControl`. |
| `FlowsPage.tsx`, `FlowBuilderPage.tsx` | Migrated to `PageShell`/`PageHeader`; `Breadcrumbs` replaces a hand-rolled back link; `outline` buttons corrected. |
| `RunComposePage.tsx` | On `PageShell`; the banned `8 steps · 6 seats` meta line replaced by `StatTile`s. |
| `InitScreen.tsx` | Rebuilt on coal/chalk + bracket rounding + `design/Button`. Wordmark set as text - `logo-wordmark.png` is a white-glyph asset with no dark variant and was near-invisible in light theme. |
| `MissionControlPage`, `ProposalsPage`, `BoardPage`, `RunsPage`, `WorkspacePage` | Spot fixes only (rounding, a grey meta line, an eyebrow). |
| All other routes | Already compliant. |

## Components

| Component | Outcome |
|---|---|
| `runs/RunGapQuestions.tsx` | A parallel hand-rolled design system: 14 bare buttons -> 12 `design/Button` + 2 sanctioned intent-tinted; re-derived segmented control -> `SegmentedControl`; inline styles and a `<style>` media block removed. |
| `runs/SuggestionsPanel.tsx` | Already migrated; `ApplyMenu` rebuilt on the `FlowCardMenu` idiom - which surfaced a real bug: the menu had **no click-outside handler** and stayed open. |
| `runs/RunTree.tsx`, `runs/SpecUpReview.tsx` | Off the orphaned `--s-*` system onto real tokens; `Chip`/`StatTile`/`ToneDot` reused. |
| `layout/ErrorBoundary.tsx` | Rebuilt on `design/ErrorState`. |
| `layout/PanelBoard.tsx` | Section label was `mono text-[11px] text-chalk-400`; now a 20px extrabold heading. Buttons routed through design components. |
| `design/Terminal.tsx` | Token migration finished; stream state folded from a loose dot + word into one contained control. |
| `design/FlowCard.tsx` | **New.** One card for the catalog and both composers; three forks retired. |
| `mission/AssistPopover.tsx`, `flow-builder/DryRunModal.tsx`, `runs/ProfileSelect.tsx`, `layout/GlobalErrorOverlay.tsx` | Spot fixes. |
| `metrics/BudgetControl`, `codebase/FileViewer`, `runs/LiveOutputPanel`, `runs/ReviewFindingsPanel`, `diff/DiffViewer`, `crew/RoleCard` | Re-derived primitives replaced with `StatTile` / `Button` / `SegmentedControl` / `Chip` / `Select`. |
| `HelpOverlay.tsx` | Content, not styling: it documented the **retired panel-board shell** and shortcuts with no handlers (digit keys, a slash-command block, drag-to-resize, right-click menus). Rewritten against verified source. |

## Deliberately left alone

These trip a naive grep but are correct. Recorded so the next sweep does not
"fix" them:

- **Intent-tinted bare `<button>`s** (`INTENT_BTN`). The contract sanctions
  these at §90-92. `design/Button` has no affirm/emerald or warn/amber variant,
  and `design/cn.ts` is a plain join with **no `twMerge`** - forcing them onto
  `Button` leaves two competing classes whose winner depends on CSS output
  order. A bare-button *count* is not evidence of a violation.
- **Uppercase inside a tinted tag** - `SEV_TAG` (`ReviewFindingsPanel`),
  `CLS_TAG` (`SupervisorPanel`), and `Terminal`'s `LineRow` gutter (simulated
  terminal output). These are tags, not eyebrow kickers.
- **`·` as a list bullet or icon placeholder** (`ConsultAnswerView`,
  `MergeView:407`) - not a joined-facts meta line.
- **`mono` on identifiers** - run ids, commit shas, file paths, branch names,
  step kinds. Mono is wrong only when it labels or heads a region. Likewise
  `mono num-tabular` on plain numbers is an established convention across the
  app; converting it would be inconsistency, not a fix.
- **Dynamic `style={{}}`** - computed tree indentation, tour-card position,
  progress width. Geometry that cannot be a static class.
- **`MergeView.tsx:99` (`TopologyLine`)** - a genuine `·` facts line, kept
  deliberately: a prior commit split it from `TopologyTiles` (the `StatTile`
  version) specifically to keep the dense hub row compact.

## Known remaining

- The panels *inside* the run dashboard (Live metrics, Changed files, the CLI
  output panel) had their headings and chrome corrected, but their internals
  are a lighter touch than a full rebuild.
- `SectionEyebrow.tsx` and the `.eyebrow` class still exist for un-migrated
  consumers; each page retires its own as it migrates.
