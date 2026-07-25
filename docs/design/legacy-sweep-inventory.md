# Legacy-design sweep: affected pages and components

Audited 2026-07-24 against [`primitives-contract.md`](./primitives-contract.md),
with Mission Control as the reference idiom. Four independent source audits plus
a rendered pass in the browser. `src/ui` is 174 `.tsx` files; **~30 carry real
leftovers**, the rest already match.

Severity: **BLOCKER** = the contract's named hard-no list. **DRIFT** = legal but
visibly off the Mission Control idiom.

## Status (re-verified 2026-07-25 against the working tree)

Roughly a third of the inventory is closed. Verified by grep, not by memory:

**Closed**

| What | Evidence |
|---|---|
| Banned legacy tokens (`vibestrate-fg`, `-fail`, `-mono`) | 0 occurrences in `src/ui` |
| `text-chalk-500` (an undefined token) | 0 occurrences |
| `animate-pulse` (the one banned animation) | 0 occurrences |
| `fog-*` generation | only `InitScreen.tsx` left |
| `ErrorBoundary` | rebuilt on `design/ErrorState`, 0 bare buttons |
| `TerminalPanel`, `DryRunModal`, `ProfileSelect` | 0 bare `<button>` |
| Page shell | `RunComposePage`, `ProjectPage`, `ProposalsPage`, `BoardPage` on `PageShell` |
| Forked flow cards | one `design/FlowCard` serves catalog + both composers |
| Tour counter / terminal label | off the tiny-uppercase-mono silhouette |

**Still open** (the real remaining backlog)

| What | Where | Size |
|---|---|---|
| Not on `PageShell` | `RunDetailPage` (1,351 lines), `FlowsPage`, `FlowBuilderPage` | RunDetail is a redesign, not a sweep |
| Wholesale legacy generation | `InitScreen.tsx` - and it is the product's first screen | medium |
| Orphaned `--s-*` token system | `RunTree.tsx`, `SpecUpReview.tsx`, defs in `index.css` | medium |
| Bare `<button>` clusters | `RunGapQuestions` (14), `SuggestionsPanel` (10), `PanelBoard` (8), `SpecUpReview` (4), `ReviewPassPanel` (3), `AssistPopover` (3) | large |
| Grey `·` meta lines | 12 sites | small |
| Re-derived primitives | `SegmentedControl` (6x), `MetricCard`, `StatTile`, `Chip`, `Select` | medium |
| Stale *content*, not styling | `HelpOverlay` still documents the retired panel-board shell | small |

## The three systemic findings

1. **An orphaned token system is live.** `RunTree.tsx` and `SpecUpReview.tsx` are
   styled entirely against `--s-*` custom properties. Those are defined only
   under `[data-scene]`, and **no component in the app ever sets `data-scene`**
   (verified by grep). `.deep-scene`/`.board-scene` define only `--s-slab` and
   `--s-line`. So `--s-ink`, `--s-ink-dim`, `--s-accent`, `--s-danger` resolve to
   **nothing** at render time. Where they are defined at all, they alias the
   banned generation directly: `index.css:380` is `--s-ink: var(--color-fog-100)`.
   `SpecUpReview.tsx:185` already hardcodes `#f08a8a` as a fallback for the
   undefined `--s-danger`.
2. **Five pages never migrated to the page shell.** `PageShell`/`PageHeader`/
   `Section` is the canonical canvas (§0a). `RunDetailPage`, `RunComposePage`,
   `FlowsPage`, `FlowBuilderPage` hand-roll `px-10 py-7` canvases with raw
   `<h1>`s; `PoliciesPanel` hand-rolls the same inside a thin route wrapper.
   `FlowsPage` is the file the contract itself cites as the canonical `FlowCard`
   home - the law and its own reference implementation disagree.
3. **`text-chalk-500` is not a defined token.** Only `chalk-100/200/300/400`
   exist. 6 sites silently render as inherited colour.

## Pages

| Page | Shell | Severity | What |
|---|---|---|---|
| `RunDetailPage.tsx` | NO | **BLOCKER** | Bespoke `deep-scene` canvas + `RunHeaderV3` from a pre-PageShell generation, on the busiest page in the app (1,351 lines). Not the sanctioned `bare` exception (that is the `control` route). `deep-scene` hardcodes `--s-slab: #080b11` - a raw hex, not a token. |
| `RunComposePage.tsx` | **now yes** | ~~BLOCKER~~ FIXED | Hand-rolled canvas; defines a local `Section` that shadows the canonical one; `:404,:506` render `${steps} steps · ${seats} seats` in `text-chalk-400` - verbatim the contract's own banned meta-line example. `variant="outline"` buttons on panels (`:472,:630`). |
| `FlowsPage.tsx` | NO | **BLOCKER** | Hand-rolled `px-10 py-7` + raw `<h1>` (`:219-224`). The `FlowCard` anatomy itself (`:944-1008`) is fully compliant. `outline` Import button (`:260`). |
| `FlowBuilderPage.tsx` | NO | **BLOCKER** | Hand-rolled canvas + bare breadcrumb header, no 24px `PageHeader` (`:514`). `outline` Cancel inside a dialog panel (`:961`). |
| `InitScreen.tsx` | n/a | **BLOCKER** | Wholesale legacy - a different token generation entirely (`fog-*`, `ink-*`, `border-white/10`, `rounded-md`). Says so in its own comment. It is the product's first screen. |
| `ProjectPage.tsx` | yes | DRIFT | Uncontained header with a `rounded-full` "live" pill stranded far-right; `flex-1`-stretched full-width stat strip (tiles are content-width); airy single-value cards; green-dominant vs MC violet. Empty states name CLI commands with no in-app action (`:273-278,:381-384`) - breaks the UI/CLI parity rule. |
| `ProposalsPage.tsx` | yes | DRIFT | List row joins origin/status/date with a raw `·` in `text-chalk-400` (`:171-179`). |
| `BoardPage.tsx` | yes | DRIFT | Custom violet pill-shaped bare `<button>` (`:367-376`) - a composed chip, low severity. |
| `App.tsx` | n/a | **BLOCKER** | `text-vibestrate-fg-muted` on the Settings suspense fallback (`:383`). **FIXED** this pass. |

Clean and already migrated: `MissionControlPage`, `RunsPage`, `MetricsPage`,
`ProfilesPage`, `CrewPage`, `ConfigPage`, `ConsultPage`, `SourcePage`,
`SupervisorsPage`, `TaskDetailPage`, `WorkspacePage`, `SettingsPage`,
`CodebasePage`, `CanvasPage`.

## Components

### Un-migrated, pervasive (rewrite targets)

| Component | Severity | What |
|---|---|---|
| `runs/ReviewPassPanel.tsx` | **BLOCKER** | 80+ old-token hits; every action (Preflight/Approve/Reject/Apply/Validate/Revert) is a bare hand-rolled `<button>`; `BundleStatusBadge` re-derives `Chip`. |
| `runs/SuggestionsPanel.tsx` | **BLOCKER** | 90+ old-token hits; bare `<input>`/`<textarea>` instead of `FormField`; `ApplyMenu` is a hand-rolled dropdown with a raw `▾` glyph. |
| `terminal/TerminalPanel.tsx` | **BLOCKER** | 18 old-token hits across nearly every branch; bare `rounded` (4px) instead of the bracket scale; two hand-rolled action buttons. |
| `runs/RunTree.tsx` | **BLOCKER** | Orphaned `--s-*` system, inline styles only, zero reuse of `Chip`/`StatTile`/`RunStatusBadge`. |
| `runs/SpecUpReview.tsx` | **BLOCKER** | Same orphaned `--s-*`; hardcoded `#f08a8a` fallback; bare Edit/Save/Cancel buttons. |
| `runs/RunGapQuestions.tsx` | **BLOCKER** | A fully parallel hand-rolled design system: 8 re-derived button variants, a re-derived segmented control, inline `style={}` throughout, type sizes off the dense scale. |
| `layout/ErrorBoundary.tsx` | ~~BLOCKER~~ FIXED | Predates the system; never migrated onto `design/ErrorState`, which shipped to replace exactly this. Two bare action buttons, off-palette rose shades. |

### Re-derived primitives (the contract says do not re-derive)

| Component | Duplicates |
|---|---|
| `metrics/BudgetControl.tsx:265-284` | `StatTile` sm recipe, by hand |
| `codebase/FileViewer.tsx:246-266` | `Button` subtle recipe, verbatim |
| `runs/LiveOutputPanel.tsx:221-254` | `SegmentedControl` |
| `runs/ReviewFindingsPanel.tsx:110-118` | `Chip` contained variant |
| `diff/DiffViewer.tsx:88-136` | `Button` ghost, four times inline |
| `crew/RoleCard.tsx:349-371` | a native `<select>` beside two correct `design/Select` uses in the same file |

### Spot fixes

| Component | Severity | What |
|---|---|---|
| `layout/PanelBoard.tsx:285-363` | **BLOCKER** (pulse fixed; rounding/tokens open) | `animate-pulse` on a skeleton - the one banned animation. Plus legacy keyword rounding through the toolbar/dropdown (`:285-363`) and `var(--popover)` instead of `bg-coal-700`. |
| `mission/AssistPopover.tsx:97,129` | **BLOCKER** | The retired eyebrow-kicker silhouette rebuilt with new tokens; one-off `color-mix`/`backdrop-blur-xl` surface. |
| `flow-builder/DryRunModal.tsx` | ~~BLOCKER~~ FIXED | Hand-rolled Close duplicating `Button` secondary; `/80` scrim vs the `/70` siblings. |
| `runs/ProfileSelect.tsx` | ~~BLOCKER~~ FIXED | `vibestrate-fg`, `vibestrate-fail`, `vibestrate-mono`. |
| `replay/LazyReplayPanel.tsx` | ~~BLOCKER~~ FIXED | `text-vibestrate-fg-muted` on the Replay tab's loading state. |
| `terminal/LazyTerminalPanel.tsx` | ~~BLOCKER~~ FIXED | Same, on the Terminal tab's loading state. |
| `tasks/StepDetailDrawer.tsx:205`, `tasks/ChecklistSection.tsx:694,769,778`, `tasks/ContextSourcesSection.tsx:75`, `layout/Breadcrumbs.tsx:61` | BUG | `text-chalk-500`, an undefined token. |
| `layout/GlobalErrorOverlay.tsx:54-61` | DRIFT | Bare `×` glyph instead of the lucide `X` icon-button recipe. |
| `providers/ProviderEditor.tsx:359-371` | DRIFT | Grey `·`-separated meta line; off-palette status shades (`:656-694`). |
| `notifications/NotificationsSidebar.tsx:793-818` | DRIFT | "Dismiss" in `text-chalk-400` reads disabled. |
| `codebase/ProfileMaintenancePanel.tsx`, `params/ProjectParamsPanel.tsx` | DRIFT | Hand-rolled inline field labels instead of `FormField`/accent colour; bare `emerald` instead of `emerald-400`. |
| `codebase/CodebaseMapPanel.tsx:149-156` | DRIFT | Hand-rolled dismiss instead of `IconBtn` (IconBtn has no rose-tint variant today - a real gap). |

### Content leftover, not styling

`HelpOverlay.tsx` renders correctly but still documents the **retired
panel-board shell**: "Backlog panel / Ready panel / Queue panel / Approvals
panel / Suggestions panel / Notifications panel", plus drag-to-resize and
collapse-panel interactions. Queue folded into Runs; Approvals and Suggestions
became run-detail inspector tabs; Notifications is the sidebar bell. This is the
first surface a new user opens (`?`).

## Confirmed clean

All of `metrics/` (the best-migrated directory), most of `policies/`,
`providers/` (catalog + view), `artifacts/`, `ledger/`, `diff/` (bar the toolbar),
`approvals/`, `crew/` (bar one select), all of `tasks/` bar the chalk-500 sites,
`layout/AppShell|PageShell|Sidebar|Breadcrumbs`, and the overlays
`TourOverlay`, `ConsultDock`, `CliHintOverlay`, `NotificationBell`,
`NotificationsSidebar`, `InstallWizard`, `RunSwitcher`, `StepDetailDrawer`.
