# Interface alignment + compaction plan

Status: proposed (2026-06-30). A hand-off plan for a fresh session to bring
**every** interface onto the Mission Control branding, redesigned to fit it,
**more compact**, **UX-first** - not a token swap.

Read these first (they are the law, this doc does not restate them):
- [`primitives-contract.md`](./primitives-contract.md) - the canonical Tailwind
  idiom, tokens, recipes, and anti-patterns. THE file each page agent reads.
- [`design-system-rollout.md`](./design-system-rollout.md) - the existing rollout
  program + the verified token crosswalk. Phases 0-3 + the shell unification are
  DONE; this plan finishes it and adds what it missed.
- [`references/`](./references/) - the real visual references (Mission Control
  dark+light, LOUD, Raycast). Design from these + the live MC screens; never
  invent (owner rule: "don't invent designs, use references").

## 1. The goal (what "done" means)

Every screen renders on the MC idiom (coal/chalk + violet, both themes, the
sidebar shell, the contract's primitives), the old token system is deleted from
`index.css`, AND two lenses the original rollout under-weighted are applied to
every page:

- **More compact.** Density is the house style. Tighten vertical rhythm, collapse
  redundant chrome, fold facts into `StatTile` grids, remove empty space. Target:
  a page shows meaningfully more on one screen than today without feeling cramped.
- **UX-first.** Each page gets a UX pass BEFORE the visual pass: what is the
  primary action, what is noise, what is 2 clicks that should be 1, what state is
  missing or unclear. The redesign serves the task, not just the tokens.

Non-goal: a mechanical `fog-*`->`chalk-*` find-replace. The rollout doc is explicit
- a swap bakes in rejected patterns (eyebrows, sparse cards, naked dot+sentence).
Every screen gets a real redesign.

## 2. What's already done (do not redo)

Phases 0-3 + shell unification shipped (see the rollout doc's checklist): the
foundation contract + crosswalk, the shared atoms + app chrome, the sidebar-as-
only-shell, the **runs** domain, and the **compose/flows** domain. The body
canvas, sidebar, and shared atoms are on the new foundation.

## 3. The remaining surface (~76 files on old tokens)

Grouped into redesign phases. Each phase is one branch off `main`; within a
phase, pages are independent and can fan out in parallel (one agent per page in
its own worktree).

- **Phase T - Tasks / Board (NEW - the original rollout never phased this; do it
  FIRST, the owner wants it most).** `BoardPage.tsx` (the kanban + roadmap strip +
  stat tiles), `TaskDetailPage.tsx`, `components/board/*` (e.g. `MicroStepPipeline`),
  and the supervised surfaces that live here (`SagaCard`, `ConductorPanel` is
  already on `var()` tokens - verify, don't churn). This is where "make/author/run
  a supervised task" lives, so UX-first matters most here.
- **Phase 4 - Config / admin.** `ProvidersPage`, `CrewPage`, `ProfilesPage`,
  `SupervisorsPage`, `ConfigPage`, `SettingsPage`, `WorkspacePage`, `ProjectPage`.
- **Phase 5 - Git / diff / merge.** `GitPage`, `GitTreePage`, `MergePage`,
  `diff/*`, `workflow/*`.
- **Phase 6 - Specialized panels.** `replay/*`, `policies/*`, `notifications/*`,
  `codebase/*`, `MetricsPage`, `LedgerPage`, `ConsultPage`, `ProposalsPage`,
  plus stragglers (`App.tsx`, `InitGate`/`InitScreen`, `HelpOverlay`,
  `approvals/*`, `artifacts/*`, `consult/*`).
- **Phase 7 - Cleanup.** Delete `vibestrate-*` / `fog-*` / `.eyebrow` /
  `.vibestrate-mono` / `.slab` / `--s-*` from `index.css` once grep shows zero
  consumers. Final full-app dark/light + responsive sweep.

(Run `grep -rlE "fog-[0-9]|vibestrate-|SectionEyebrow|\.slab" src/ui --include=*.tsx`
to get the live list before starting - it shrinks as phases land.)

## 4. Per-page method (the loop each page agent runs)

1. **Read** the primitives contract + the live reference files it cites + the
   `references/` screenshots. Open the page in the dev preview (both themes).
2. **UX audit (first).** Write 3-6 bullets: primary action, what's noise, what's
   too many clicks, what state is unclear/missing, what's sparse. This drives the
   redesign - it is not optional.
3. **Redesign dense on the idiom.** Contained MC-matched header (no eyebrow), facts
   as `StatTile`s not grey meta lines, framed rows not naked dot+sentence, compose
   from `components/design/*` (`Button`/`Select`/... - never bare `<button>` or raw
   utility elements), violet single-hue, rounded surfaces, no pills, no pulse.
   Tighten spacing for compactness.
4. **Verify on RENDERED visuals in BOTH themes** (preview + screenshot). Check the
   UX-audit items are actually addressed. `pnpm typecheck && pnpm test && pnpm
   build` (build so it shows in the served `dist/ui`).
5. **Keep UI<->CLI parity**; never tell the user to run a CLI as the in-UI fix.

## 5. Sequencing for the fresh session

1. Start with **Phase T (Tasks/Board)** - highest owner value, and it exercises
   the supervised-task surfaces just shipped.
2. Then 4 -> 5 -> 6 (each a branch; parallel-fan-out per page inside a phase).
3. **Phase 7 cleanup last** - only after grep shows zero old-token consumers.
4. Each page: its own small reviewable branch or a phase branch with per-page
   commits. Get a design review on the rendered visuals (both themes) before merge
   - the owner judges design on pixels, not diffs.

## 6. Guardrails (from the rollout doc + owner rules)

- The contract + live Mission Control are the SOLE design reference. No invented
  visuals, no separate design-skill ceremony.
- Anti-patterns are hard noes: pill labels, faint grey (`chalk-400`) for
  labels/subtitles, eyebrow kickers, naked status dot + sentence, pulsing/breathing
  animation on chrome (the consult orb is the only animated exception), two shells.
- After UI edits, `pnpm build` (the owner's dashboard serves built `dist/ui`; the
  dev preview alone is not what they see).
- Keep both token sets alive in `index.css` until a screen is migrated; delete old
  tokens only in Phase 7.

## 7. Open decisions (settle early in the fresh session)

- **Compactness target** - is there a density reference the owner likes (e.g.
  Linear/Raycast density), or is "tighter than today, matching MC" enough? Confirm
  before Phase T so it's consistent app-wide.
- **Board structure** - keep the kanban-columns + roadmap-strip + stat-tiles shape
  and re-skin/compact it, or rethink the Board's information architecture (UX-first
  may argue for a different primary layout). Decide in Phase T's UX audit with the
  owner, since the Board is the page they care most about.
