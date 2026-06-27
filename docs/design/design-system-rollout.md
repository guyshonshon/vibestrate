# Design: app-wide design-system rollout

Status: **planned (2026-06-27)** - rollout program for migrating the whole
dashboard onto the "coal/chalk" foundation. Foundation merged to `main`
(`f55c8725`); no screens migrated yet beyond the references listed below.

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
| Each screen / domain | **Per-surface redesign** using the `impeccable` skill + real reference screenshots. No invented visuals. |

Keep both token sets alive in `index.css` until a screen is migrated; delete
old tokens only in the final cleanup phase, once grep shows zero consumers.

## Principles (bake into every phase)

- Use the `impeccable` skill + **real references** (the user's LOUD / Raycast
  references) - do not invent designs.
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

## Token crosswalk (Phase 0 deliverable - grounded, verify before bulk apply)

Values read from `src/ui/index.css` (dark / light). Clean 1:1 mappings are
safe to apply broadly; flagged rows need a human eyeball because the shades
differ.

| Old token | New target | Match |
| --- | --- | --- |
| `vibestrate-border` `rgba(255,255,255,.09)` | `--line` (identical) | exact |
| `vibestrate-border-soft` `.06` | `--line-soft` (identical) | exact |
| `vibestrate-accent` `#a78bfa` / light `#6951f0` | `violet-soft` (identical both themes) | exact |
| `vibestrate-accent-soft` | `violet-soft/12` | exact |
| `vibestrate-info` `#7cc5ff` | `sky-glow` (identical) | exact |
| `vibestrate-fg` `#f4f5fa` | `chalk-100` `#f6f6f7` | near - verify |
| `vibestrate-fg-dim` `#c9ccd9` | `chalk-300` `#c7c7cb` | near - verify |
| `vibestrate-fg-muted` `#6a7186` | `chalk-400` `#8e8e96` | **shade differs** - verify |
| `fog-100/200/400` | `chalk-100/300/400` | near - verify |
| `fog-300/500` | interpolate to `chalk-300/400` | judgment |
| `vibestrate-panel` `#0e1118` | `--card` (identical) **but** surfaces in new screens use `coal-600/coal-800` | **judgment** - pick by elevation, not 1:1 |
| `vibestrate-canvas` `#06070b` | `--background` `#0a0c12` / `coal-900` | **darker than coal-900** - verify |
| `vibestrate-success` `#4ade80` | Tailwind `emerald-400` (new screens use emerald) | **differs** - verify |
| `vibestrate-warn` `#fbbf24` | `amber-soft` `#fb923c` | **more orange** - verify |
| `vibestrate-fail` `#fb7185` | Tailwind `rose-300/500` | near - verify |
| `vibestrate-diff-add/del(-fg)` | keep or remap to emerald/rose tints | judgment |
| `.eyebrow`, `.vibestrate-mono` | delete - replace with sentence-case headings | n/a |

Action: prove this table on 2-3 already-migrated reference screens before any
mechanical apply. The surface/neutral/status rows are where a blind swap shifts
color.

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
- [ ] Phase 0 - foundation contract + verified crosswalk
- [ ] Phase 1 - atoms + app shell
- [ ] Phase 2 - runs domain
- [ ] Phase 3 - compose / flows
- [ ] Phase 4 - config / admin
- [ ] Phase 5 - git / diff / merge
- [ ] Phase 6 - specialized panels
- [ ] Phase 7 - cleanup + old-token deletion
