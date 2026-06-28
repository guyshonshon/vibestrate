# Design: app-wide design-system rollout

Status: **Phase 1 done (2026-06-27)** - rollout program for migrating the whole
dashboard onto the "coal/chalk" foundation. Foundation merged to `main`
(`f55c8725`). Shipped so far: Phase 2 (runs domain, v0.27.0) and Phase 1 (shared
shell + atoms, v0.28.0) - the body canvas, TopBar, and shared atoms are now on
the new foundation, so every page inherits the new chrome even before its body
is redesigned. Remaining: the per-domain page-body redesigns (Phases 3-6) then
cleanup (Phase 7). Phase 0 landed on branch `design/phase-0-foundation`:
canonical
contract locked ([`primitives-contract.md`](./primitives-contract.md)), dead
shadcn `components/ui/*` set removed, token crosswalk verified against live
Mission Control (below), and a shared reference set captured
([`references/`](./references/)). No screens migrated yet; the page fan-out
(Phase 2+) builds on this contract.

The `feat/shadcn-foundation` work established a new design language (soft-dark
"coal/chalk" + violet, light/dark theme, `EntityIcon`, reframed Mission
Control). It currently covers Mission Control and a few control surfaces. This
doc is the plan to bring the *entire* app onto it.

This is a multi-week program, not a single change: ~111 files reference the old
token system (~928 `vibestrate-*`, ~274 `vibestrate-mono`, ~1,036 `fog-*`, 75
`.eyebrow`). Sequenced below so each phase ships as a small, reviewable branch
and unmigrated screens never break mid-flight.

---

## Goal & non-goals

**Goal:** every screen on the new foundation - theme-aware (light/dark),
violet single-hue, dense, consistent primitives - and the old token system
deleted from `index.css`.

**Non-goal:** a mechanical find-replace of old tokens to new. A token swap
produces theme-correct but design-unimproved screens and would bake in the
patterns we've explicitly rejected (eyebrow slugs, sparse cards, naked
dot+sentence status). Screens get a real redesign pass; only structural
primitives/shell get a verified crosswalk.

## Strategy: hybrid

| Layer | Approach |
| --- | --- |
| Tokens, atomic primitives, app shell | Verified **crosswalk** (old token -> new token), because they're structural and shared. Fast cascade. |
| Each screen / domain | **Per-surface redesign** matching `primitives-contract.md` + the live Mission Control screenshots. Restructure the content (framed rows, labeled stats, status grids) - never a token swap, never invented visuals. |

Keep both token sets alive in `index.css` until a screen is migrated; delete
old tokens only in the final cleanup phase, once grep shows zero consumers.

## Principles (bake into every phase)

- **Canonical idiom:** [`primitives-contract.md`](./primitives-contract.md) is
  the single source for the Tailwind recipes, tokens, and anti-patterns every
  page agent must match. Read it (and [`references/`](./references/)) before
  touching a screen.
- Match the **Mission Control idiom** (the contract recipes + the live screen)
  and **real references** (the user's LOUD / Raycast references) - do not invent
  designs, and do not run a separate design-skill ceremony; the contract is the
  shape.
- Violet single-hue accent; dark default, light supported; rounded surfaces ok.
- Dense, informative cards - never airy/sparse.
- No rounded pill labels. No pulsing/breathing animation on any chrome (the
  consult orb is the only sanctioned animated exception).
- No faint uppercase "eyebrow" kicker above titles; the heading carries the
  page. Retire `SectionEyebrow` / `.eyebrow` / `.vibestrate-mono` uppercase.
- No naked status dot + sentence; fold state into a real framed control.
- UI<->CLI parity preserved; never tell the user to run a CLI as the in-UI fix.
- After UI edits, `pnpm build` so the change shows in the user's served
  `dist/ui` (the dev preview alone isn't what they see).

---

## Token crosswalk (Phase 0 deliverable - VERIFIED 2026-06-27)

Values read from `src/ui/index.css` (dark / light) and checked against the live
migrated Mission Control. Every row is now resolved: `verified` (apply broadly)
or `retire`. Three rows carry an **intentional shift** - the new target is not a
pixel match, it is the deliberately-chosen look; do not "correct" it back.

| Old token (dark / light) | New target | Resolution |
| --- | --- | --- |
| `vibestrate-border` `rgba(255,255,255,.09)` | `--line` | verified - identical |
| `vibestrate-border-soft` `.06` | `--line-soft` | verified - identical |
| `vibestrate-accent` `#a78bfa` / `#6951f0` | `violet-soft` | verified - identical both themes |
| `vibestrate-accent-soft` | `violet-soft/12` (use `/10`-`/12` tints) | verified |
| `vibestrate-info` `#7cc5ff` / `#2563eb` | `sky-glow` | verified - identical |
| `vibestrate-fg` `#f4f5fa` / `#17151c` | `chalk-100` `#f6f6f7` / `#1b1b1f` | verified - near-identical |
| `vibestrate-fg-dim` `#c9ccd9` / `#34323d` | `chalk-300` `#c7c7cb` / `#4b4b53` | verified - near-identical |
| `vibestrate-fg-muted` `#6a7186` / `#6f6c7c` | `chalk-400` `#8e8e96` / `#6e6e76` | verified - **intentional shift**: dark muted gets lighter + neutral; light is near-exact |
| `fog-100` / `fog-200` / `fog-400` | `chalk-100` / `chalk-300` / `chalk-400` | verified - `fog-200`->`chalk-300` (no `chalk-200`); `fog-400` lighter like `fg-muted` |
| `fog-300` `#9aa0b3` | `chalk-400` (closest by lightness) | verified - judgment |
| `fog-500` `#4a5063` (faint ink) | `chalk-400` (accept lighter; no darker chalk) | verified - judgment |
| `vibestrate-panel` `#0e1118` | `--card` (identical dark; `#fff` light) | verified - base card |
| `vibestrate-panel-2` `#13171f` | `coal-800` `#171719` (next elevation) | verified - by elevation, not 1:1 |
| elevated surfaces above card | `coal-700/coal-600` by depth | verified - pick by elevation |
| `vibestrate-canvas` `#06070b` / `#f5f4f8` | `--background` `#0a0c12` / `#f5f4f8` | verified - **intentional**: dark base is a touch lighter than old canvas; light is exact |
| `vibestrate-success` `#4ade80` / `#16a34a` | `emerald` `#34d399` / `#0f9d63` | verified - **intentional shift**: green -> teal-emerald |
| `vibestrate-warn` `#fbbf24` / `#b45309` | `amber-soft` `#fb923c` / `#c2510c` | verified - **intentional shift**: amber/yellow -> orange |
| `vibestrate-fail` `#fb7185` / `#e11d48` | text `rose-300`, fills `rose-500/10`, borders `rose-400/30` | verified - matches Mission Control's error idiom |
| `vibestrate-diff-add/del(-fg)` | **keep** the `diff-*` tokens (well-tuned, theme-aware) | verified - revisit in Phase 5 (diff), not now |
| `.eyebrow`, `.vibestrate-mono` uppercase | **retire** - sentence-case heading | retire - see contract |

Method: resolved from the `index.css` hex pairs above (dark + light) plus the
rendered Mission Control exemplar (the screen already uses the new tokens, so its
on-screen surfaces/text/status are the crosswalk target). The surface/neutral/
status rows were where a blind swap would have shifted color; they are pinned
above. Computed values measured live (dark): `--background #0a0c12`, `--card
#0e1118`, `chalk-100 #f6f6f7`, `chalk-400 #8e8e96`, `violet-soft #a78bfa`,
`emerald #34d399`, `amber-soft #fb923c`, `coal-800 #171719` - all match.

**Live finding:** the `<body>` element still paints `vibestrate-canvas`
`#06070b` (measured), not `--background`. The app *shell/body* is not yet
migrated (that is Phase 1); only Mission Control's own surfaces use new tokens.
This confirms old + new tokens coexist as planned - do not "fix" the body in a
page phase; it belongs to Phase 1 (app chrome).

**Reference implementations (copy these patterns):**
`src/ui/app/routes/MissionControlPage.tsx`, `src/ui/components/mission/RunActions.tsx`,
`src/ui/components/mission/MissionComposer.tsx`, `src/ui/components/control/*`.

---

## Phases (each = one branch off `main`)

### Phase 0 - Foundation contract (no screens)
- Finalize the crosswalk above against `index.css`; decide `fog-*` fate (alias
  to `chalk`/`coal` vs replace).
- Codify the canonical primitives as the building blocks: `Button`, `Chip`/
  `Badge`, `Card`, `Input`/`Select`, `Tabs`, `StatusBadge`, `PageHeader`/
  `SectionHeader`, `EmptyState`, `StatusDot`. Kill anti-patterns at this layer.

### Phase 1 - Shared atoms + app chrome (cascades to every screen)
- Atoms: `design/Button`, `Chip`, `Select`, `EffortScale`, `runs/RunStatusBadge`,
  `mission/runPhase` (PhaseRail).
- Shell: `layout/AppShell` (14), `layout/TopBar` (52), `InspectorPanel`,
  `PanelBoard` chrome (`fog-*`), `ErrorBoundary` / `GlobalErrorOverlay`.
- After this every screen inherits the new chrome before its body is touched.

### Phase 2 - Runs domain (highest traffic + highest burden)
`RunDetailPage` + `runs/*`: `RunHeader` (22), `ReviewPassPanel` (54),
`SuggestionsPanel` (62), `RunWorktreeBlock`, timelines, `StepsInspector`.
Redesign, not swap.

### Phase 3 - Compose / Flows
`RunComposePage` (61), `FlowsPage`, `FlowBuilderPage` (65, YAML editor),
`RunsPage` list.

### Phase 4 - Config / admin
`ProvidersPage` (75), `CrewPage` (61), `ProfilesPage`, `SupervisorsPage`,
`ConfigPage`, `SettingsPage`, `WorkspacePage`, `ProjectPage` (48).

### Phase 5 - Git / diff / merge
`GitPage`, `GitTreePage`, `MergePage`, `diff/*`, `workflow/*`.

### Phase 6 - Specialized panels
`replay/*` (71), `policies/*` (67), `notifications/*`, `codebase/*` (90),
`MetricsPage`, `LedgerPage`, `ConsultPage`, `ProposalsPage`.

### Phase 7 - Cleanup
Delete `vibestrate-*` / `fog-*` / `.eyebrow` / `.vibestrate-mono` from
`index.css` once grep shows zero consumers. Final full-app light/dark +
responsive sweep.

## Per-phase guardrails
- `pnpm typecheck && pnpm test && pnpm build`.
- Browser click-through via the preview; seed run fixtures where a live run is
  needed; rebuild `dist/` so it shows in the served dashboard.
- Update this doc's `Status:` line and the rollout checklist below as phases land.

## Tracking checklist
- [x] Phase 0 - foundation contract + verified crosswalk (branch `design/phase-0-foundation`)
- [x] Phase 1 - atoms + app shell (branch `design/phase-1-shell`, v0.28.0). Body
  canvas -> coal `--background`; `AppShell`/`TopBar`/`PanelBoard`/`GlobalErrorOverlay`
  + shared atoms (`Button`, `Select`, `Chip`, `PhaseRail`, `EffortScale`)
  crosswalked to chalk/coal/violet-soft. Button + Select gained rounded corners
  (square-slab look retired on interactive atoms app-wide). The `.slab`/`--s-*`
  scene system stays for unmigrated page bodies (deleted in Phase 7); only the
  shell + atoms moved. Cascades the new chrome to every page before its body is
  redesigned.
- [x] Phase 2 - runs domain (branch `design/phase-2-runs`, v0.27.0). Pilot shell
  (`RunDetailPage` scaffold + `RunHeaderV3` + `RunStatusSection` + `InspectorTabs`
  + `RunStatusBadge`) then a parallel panel fan-out (Live/Supervisor/Queue
  clusters). Scope finding: 9 of the 24 `runs/*` files were dead (v3-orphaned,
  69% of the old-token burden); 6 deleted, the 3-file review-suggestion set
  (`SuggestionsPanel`/`ReviewPassPanel`/`ProfileSelect`) kept but skipped for a
  future rewire. The 4 `var()`-styled panels (`RunTree`, `RunGapQuestions`,
  `SpecUp*`) carry zero old tokens already.
- [~] Phase 3 - compose / flows. DONE: `RunsPage` (v0.28.3) and `FlowsPage`
  (v0.28.6) - the whole flow catalog + hub marketplace rebuilt on Mission
  Control's flow card (extracted `FlowBars` shared with the composer; no category
  labels; actions are real `<Button>` + an overflow menu, not bare text). PENDING:
  `RunComposePage`, `FlowBuilderPage` (1898-line YAML editor). Also removed the
  `impeccable` skill here - the contract + live Mission Control is the sole design
  reference. RULE (user, hard): compose from our shadcn component layer
  `components/design/*` (Button, Select, ...), never hand-rolled bare `<button>` /
  raw utility elements; buttons must look like buttons; no faint-grey labels.
- [x] Shell unification (branch `design/app-sidebar-shell`, v0.29.0). Mission
  Control's left sidebar became the single app-wide chrome (`layout/Sidebar`);
  the horizontal `TopBar` is **retired and deleted**. `AppShell` (non-`bare`)
  renders the sidebar + `<main>`; Mission Control dropped its private `<aside>`
  and now renders body-only inside the same shell, so there is one sidebar
  implementation, not two look-alikes. The sidebar absorbs every TopBar
  destination (primary rows + a collapsible "More") plus the right-cluster
  utilities (Jump-to, notifications, settings). Supersedes the Phase-1
  intent to keep the TopBar - see [`primitives-contract.md` §0](./primitives-contract.md).
  Also landed `FlowsPage`'s contained, Mission-Control-matched header.
- [ ] Phase 4 - config / admin
- [ ] Phase 5 - git / diff / merge
- [ ] Phase 6 - specialized panels
- [ ] Phase 7 - cleanup + old-token deletion
