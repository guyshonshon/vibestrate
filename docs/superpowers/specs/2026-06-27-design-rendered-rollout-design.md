# Design: rendered design-system rollout (Phase 0 contract + page fan-out)

Status: **spec (2026-06-27)** - branch `design/phase-0-foundation`.

Companion to [`docs/design/design-system-rollout.md`](../../design/design-system-rollout.md),
which owns the phase list and token crosswalk. This spec owns *how we execute*
it as **rendered** redesigns (real pixels, clickable), and how sub-agents fan
out safely without inventing 15 divergent visual languages.

## Goal

Bring every dashboard screen onto the "coal/chalk + violet" foundation that
Mission Control already established, as **redesigned, rendered, theme-aware**
screens - not a mechanical token swap. The old `vibestrate-*` / `fog-*` /
`.eyebrow` token system is deleted only in the final cleanup phase.

## Non-goals

- A find-replace of old tokens to new. (See rollout doc's non-goal.)
- A new speculative component library Mission Control doesn't use. The contract
  is **the idiom Mission Control already ships**, lightly extracted - not an
  invented `Button`/`Card`/`Tabs` kit nobody asked for.
- The marketing site (`vibestrate.com`) - out of scope (separate repo). The
  `vibestrate-home.jpeg` brand frame is used only as a *reference* for tone.

## The canonical contract = Mission Control's idiom

Decision (user: "we literally done Mission Control redesign and agreed this is
the fundamentals; stick to that"): the canonical primitives are **whatever
Mission Control and its satellites already use**, plus the small set of shared
primitives it imports. We do **not** standardize on `components/ui/*` (shadcn);
`components/ui/badge` ships pill rounding we've rejected.

**Reference implementations (the pattern library - copy these verbatim):**
`src/ui/app/routes/MissionControlPage.tsx`,
`src/ui/components/mission/RunActions.tsx`,
`src/ui/components/mission/MissionComposer.tsx`,
`src/ui/components/mission/runPhase.tsx`,
`src/ui/components/control/*`.

**Shared primitives Mission Control depends on (keep, canonical):**
`design/EntityIcon`, `design/ThemeToggle`, `mission/runPhase` (`PhaseRail`,
`statusMessage`, `RUN_STAGES`), `layout/PanelBoard`.

### Idiom recipes (lifted verbatim from the reference files)

These are the rules every page agent matches. Concrete, not vibes.

- **Color**: only new tokens - `text-chalk-100/300/400`, `text-violet-soft`,
  `text-amber-soft`, `text-sky-glow`, `text-rose-300`, surfaces via
  `var(--color-coal-600/700/800/900)` / `--card` / `--background`. Never
  `vibestrate-*` / `fog-*`.
- **Type scale (dense)**: `text-[10px]` / `text-[11.5px]` / `text-[12.5px]` /
  `text-[13px]` with `font-medium` / `font-semibold`. No oversized headings.
- **Rounding**: interactive + cards `rounded-[10px]` / `rounded-[12px]`; rails
  and progress bars `rounded-full`. **Labels are never pill-rounded.**
- **Buttons** (from `RunActions`): `inline-flex items-center gap-1.5
  rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition
  disabled:cursor-not-allowed disabled:opacity-50`, tinted by intent
  (`text-violet-soft hover:bg-violet-soft/10`, amber for pause, rose for
  destructive).
- **Inline status / error** (never a naked dot+sentence): a framed row -
  `w-full rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5
  text-[11.5px] text-rose-300`. State folds into a real control.
- **Icons**: lucide, `h-3.5 w-3.5` (or `h-4 w-4`), `strokeWidth={1.9}`,
  `aria-hidden`.
- **Phase / progress**: reuse `PhaseRail` + `statusMessage`; playful,
  status-driven copy (no scripted timers).
- **Anti-patterns (hard no)**: eyebrow kickers / `SectionEyebrow` /
  `.eyebrow` / uppercase `vibestrate-mono`; rounded pill labels; pulsing /
  breathing animation on any chrome (consult orb is the only exception); naked
  status dot + sentence; airy/sparse cards (cards must be dense + informative).

### Tiny extracted primitives (extraction, not invention)

Only where the *same* composed block repeats across many pages, extract a
primitive that renders **exactly** Mission Control's existing inline version, so
15 agents don't each re-derive it 15 ways. Candidates (confirm during Phase 0,
add only if genuinely repeated):

- `StatusBadge` - run/entity status as flat tinted text + dot, not a pill.
- `EmptyState` - dense empty/zero-state block.
- `PageHeader` / `SectionHeader` - sentence-case heading (no eyebrow), optional
  right-aligned actions.

If a candidate isn't actually shared, it stays inline. Bias to fewer primitives.

## Phase 0 deliverables (this branch, no new screens)

1. **Reconcile the two primitive sets.** `components/design/*` is canonical.
   - Delete `design/SectionEyebrow.tsx`; remove its consumers' eyebrow usage as
     each page is later migrated (Phase 0 only deletes the file once grep shows
     zero consumers, else leaves it pending with a note).
   - Audit `components/ui/*` (shadcn): keep only genuinely-headless pieces if
     Mission Control's idiom doesn't already cover them; otherwise mark for
     deletion in cleanup. Do **not** rebuild the app on shadcn.
2. **Verify the token crosswalk** (rollout doc table) against the live migrated
   Mission Control - specifically the flagged rows (surface elevation, muted
   text `fg-muted` -> `chalk-400`, `success` -> emerald, `warn` -> amber-soft,
   canvas darker than coal-900). Record verified mappings back into the rollout
   doc.
3. **Capture the reference set** into `docs/design/references/` (committed):
   - `mission-control-dark.png` / `-light.png` (screenshot current MC, both
     themes) - the in-app exemplar.
   - The `vibestrate-home.jpeg` brand frame (move/copy in).
   - LOUD (heyradiant.studio) + Raycast captures - the user's stated likes.
   - A one-page `references/README.md` stating what each is for and what to
     borrow (LOUD: surface layering + single-hue violet viz; Raycast:
     translucency) vs not (LOUD's finance hero-metric composition).
4. **Write the contract doc** `docs/design/primitives-contract.md` - the idiom
   recipes above, canonical, linked from the rollout doc. This is the file every
   page agent reads.
5. Extract the tiny primitives that prove genuinely shared (step from above).
6. Guardrails: `pnpm typecheck && pnpm test && pnpm build`. Mission Control is
   the on-screen proof; click through both themes via the preview.

## Page fan-out (after Phase 0 merges)

Model: **phase-grouped parallel** (user's choice). Within a rollout phase,
parallelize pages; run phases sequentially so the review surface stays sane.

- Each page/domain = **one sub-agent in its own git worktree** (worktree
  isolation so parallel agents don't conflict on disk).
- Every agent reads the **same** inputs: `docs/design/primitives-contract.md`,
  the reference set, the anti-pattern list, and the reference implementation
  files. No invented visuals.
- Agent output: a **rendered redesign** of its page + domain components, a
  before/after screenshot (both themes), `pnpm typecheck && build` green, and a
  short note of what changed and which primitives it used.
- Each page branch touches only its **own route + domain components** - never
  shared primitives/tokens (Phase 0 front-loaded that), so branches stay
  independent and merge cleanly.
- Phase grouping (from rollout doc): Phase 2 Runs -> Phase 3 Compose/Flows ->
  Phase 4 Config/admin -> Phase 5 Git/diff/merge -> Phase 6 specialized ->
  Phase 7 cleanup (delete old tokens once grep shows zero consumers).

### Per-agent brief template

> Redesign `<PAGE>` onto the coal/chalk + violet foundation. Read
> `docs/design/primitives-contract.md` and the reference set in
> `docs/design/references/` first. Match Mission Control's idiom exactly (token
> colors, dense type scale, `rounded-[10px]`, tinted hovers, lucide
> `strokeWidth 1.9`). Obey every anti-pattern (no eyebrows, no pills, no pulse,
> no naked dot+sentence, dense not airy). Theme-aware (light + dark). Touch only
> `<PAGE>` + its domain components; do not edit shared primitives or
> `index.css`. Verify: `pnpm typecheck && pnpm build`, screenshot both themes in
> the preview. Report what changed + primitives used.

## Verification (every phase)

`pnpm typecheck && pnpm test && pnpm build`; preview click-through both themes;
rebuild `dist/` so it shows in the served dashboard (the user runs built
`dist/ui`, not the dev preview). Update the rollout doc checklist + `Status:`
line as phases land. Changelog + version bump on each meaningful merge.

## Risks

- **Divergence** despite a contract - mitigated by a written recipe doc + shared
  references + reading the reference impl files, but agents can still drift;
  review each page against Mission Control before merge.
- **Shared-file contention** - mitigated by front-loading all shared churn into
  Phase 0 and forbidding page agents from touching primitives/`index.css`.
- **`SectionEyebrow` / old-token deletion timing** - delete only when grep shows
  zero consumers, else leave pending with an honest note (never half-delete).
