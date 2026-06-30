# MC branding canvas + Board re-skin - design

Status: proposed (2026-06-30). First slice of the interface-alignment program
([`interface-alignment-plan.md`](../../design/interface-alignment-plan.md)),
Phase T. Establishes the canonical page canvas extracted from Mission Control,
then re-skins the Board as its first consumer.

Read first (the law, not restated here):
- [`primitives-contract.md`](../../design/primitives-contract.md) - component idiom.
- [`interface-alignment-plan.md`](../../design/interface-alignment-plan.md) - the program.

## 1. Goal

"MC is the design, only that." Today the page-level canvas (padding, header,
section rhythm, the two page archetypes) lives only as hand-rolled markup copied
inconsistently across ~18 routes, and the Board is the single most
contract-violating page in the app. This slice:

1. **Extracts** the MC page canvas into real layout primitives so every future
   page derives the rhythm from code, not prose.
2. **Renders** that canvas as a live in-app `/canvas` styleguide route built from
   the real primitives + tokens (truthful to the served `dist/ui`, not a chat
   mockup), verifiable in both themes.
3. **Codifies** it as a new section in the primitives contract.
4. **Re-skins the Board** (`BoardPage.tsx`) onto the canvas as the first
   consumer - same kanban + roadmap + stat-tile *shape* (owner decision: re-skin,
   not an IA rethink), every old-token / anti-pattern element replaced.

Done = `/canvas` renders correctly in dark + light; MC renders identically after
being refactored to consume the new primitives (parity proven); the Board is on
coal/chalk + violet with zero `fog-*` / `.slab` / `.eyebrow` / `mono`-uppercase /
`pulse-dot` / raw `<button>`; `pnpm typecheck && pnpm test && pnpm build` green.

## 2. Decisions (locked with owner)

- Canvas form: a **live in-app `/canvas` route**, not a doc mockup.
- Codification: a **contract section + extracted `PageShell` / `PageHeader` /
  `Section` primitives**, with **MC refactored to consume them** to prove parity.
- Board: **re-skin the current shape** (kanban columns + roadmap rail + stat
  tiles). No information-architecture change.
- Density: **MC's own rhythm is the target** (`px-10 py-7`, 24px header, etc.) -
  not a tighter external reference. Compaction comes from replacing redundant
  chrome (eyebrows, dot+label KPI tiles, pulse dots) with the StatTile/row idiom.

## 3. The canvas (extracted from Mission Control)

Source of truth stays `index.css` (tokens) + the contract (component recipes).
The canvas adds the **page-level** layer, lifted verbatim from
[`MissionControlPage.tsx`](../../../src/ui/app/routes/MissionControlPage.tsx) +
[`AppShell.tsx`](../../../src/ui/components/layout/AppShell.tsx):

| Layer | Recipe |
|---|---|
| Shell | `AppShell` already provides `bg-coal-800 text-chalk-100`; `<main>` owns scroll |
| Page body | `font-jakarta px-10 py-7` |
| Header block | `<header class="mb-6">`, h1 `text-[24px] font-extrabold tracking-[-0.02em]` |
| Section | heading `text-[18px] font-bold text-violet-vivid mb-3`; sections spaced `mb-4` |
| Grid rhythm | outer `gap-4`, card `gap-3`, tight `gap-2.5` |
| Surfaces | canvas `coal-800` -> card `coal-600` -> row/chip `coal-500` -> hover `coal-400` |
| Card / row | card `rounded-[18-22px] bg-coal-600`; inner row `rounded-[14px] bg-coal-500/60 px-4 py-3` |

Two **page archetypes** share this canvas:
- `scroll` - vertical-scroll dashboard (MC, config pages). The default.
- `fill` - a height-filling app view that owns the viewport and scrolls its own
  inner regions (the Board kanban: horizontal column scroll, columns scroll
  vertically). Uses a **tighter top padding** (`pt-5`) so column height is not
  eaten by `py-7` + the 24px header - the one deliberate divergence, encoded in
  the primitive, not re-invented per page.

## 4. Layout primitives (new)

New file `src/ui/components/layout/PageShell.tsx` exporting three composable
pieces, each rendering MC's existing inline markup exactly (extraction, not
invention - contract §10):

- `PageShell({ variant?: "scroll" | "fill", children })`
  - `scroll` (default): `<div class="font-jakarta px-10 py-7">`.
  - `fill`: `<div class="font-jakarta flex h-full min-h-0 flex-col px-10 pt-5 pb-0">`
    so a kanban child can `flex-1 min-h-0`.
- `PageHeader({ title, actions?, children? })` - the `mb-6` header block: h1
  `text-[24px] font-extrabold tracking-[-0.02em]`, an optional right-aligned
  `actions` slot (filled `<Button>`s by their title, per contract anti-patterns),
  and optional `children` for a contained sub-header block. No eyebrow, no loose
  grey subtitle on the canvas.
- `Section({ title?, action?, children })` - `mb-4` wrapper; when `title` is set,
  renders the `text-[18px] font-bold text-violet-vivid mb-3` heading with an
  optional inline `action` (link/secondary Button by the title).

**Parity refactor:** `MissionControlPage.tsx` is migrated to compose
`PageShell`/`PageHeader`/`Section` in place of its hand-rolled `<div class="px-10
py-7"><header class="mb-6">...`. The page must render pixel-identically before
and after (both themes) - this is the proof the primitive captured the canvas.
No other page is migrated in this slice (the rest follow in phases 4-6).

## 5. The `/canvas` styleguide route (new)

New file `src/ui/app/routes/CanvasPage.tsx` - a living branding reference built
**from the real primitives + design components**, so it can never drift from the
app:

- Wrapped in `PageShell` + `PageHeader title="Branding canvas"`.
- Sections (`Section`): surface elevation ramp, text/accent/status swatches, type
  scale, the canvas-rhythm annotated block, buttons (real `<Button>` variants),
  input, card shell, inner row, `StatTile` row, `Chip` (de-pilled), status-as-text,
  the two archetype thumbnails, and a "banned" anti-patterns strip.
- Swatches read live `var(--color-*)` tokens (so the light flip is automatic and
  truthful), not hardcoded hex.

Wiring:
- Add `{ kind: "canvas" }` to the `Route` union (the file imported at
  `App.tsx:39`), a render `case` mounting `CanvasPage`, and an
  `onShowCanvas={() => navigate({ kind: "canvas" })}` handler.
- Reachable but not cluttering primary nav: a small entry in the sidebar's
  secondary/utility group (near settings) labelled "Branding canvas". Not a
  keyboard hotkey. It is a real shipped page (dev/design reference), not gated.

## 6. Contract addition

Add a section to `primitives-contract.md` (e.g. §0a "Page canvas") documenting
the canvas table from §3, the `PageShell`/`PageHeader`/`Section` primitives as
the required page wrappers, the two archetypes, and a pointer to the `/canvas`
route as the live reference. Page-redesign agents read this and compose the
primitives instead of hand-rolling `px-10 py-7`.

## 7. Board re-skin (first consumer)

`BoardPage.tsx` re-skinned onto the canvas - same shape, every element ported.
The element-by-element crosswalk (from -> to):

| Element | Today (debt) | Re-skin |
|---|---|---|
| Page wrapper | `.board-scene ... px-6 pt-5`, hand-rolled | `PageShell variant="fill"` + `PageHeader` |
| Header | 15px `text-fog-100` h1 + grey "roadmap -> tasks -> runs" + ad-hoc next-suggestion `<button>` | `PageHeader title="Tasks"`; task count + suggested-next as a contained sub-header row; actions slot holds the two real `<Button>`s |
| New-task / roadmap forms | raw `<input>`/`<select>`/`mono` | contract input recipe + `design/Select`; keep the plain/supervised run-mode toggle |
| KPI strip | `KpiTile` = `.slab` + `.eyebrow` label + naked status dot (anti-pattern) | `StatTile` row (value over violet unit label), status as flat tinted value, no dot+label |
| Roadmap rail | `.eyebrow "Roadmap - N initiatives"` + raw `<button>` chips with uppercase priority | `Section`-headed rail of real chip-styled buttons (de-pilled), priority as tinted text |
| Toolbar | raw `<input>` search + raw segmented `<button>`s | contract input + `design/Select`/segmented control composed from `<Button>` |
| Column | `.slab` + `mono` uppercase header + `pulse-dot` on in-progress (BANNED pulse) | coal-600 card, sentence-case heading, **static** dot, accent top-bar kept |
| `TaskCard` | raw `<div role=button>`, `mono` uppercase priority, `Chip` styled as uppercase pills, `pulse-dot` "running", `fog-*` everywhere | coal/chalk card, `RunStatusBadge` for status, de-pilled `Chip`, StatTile-style footer counts, violet hover |
| `SagaCard` | violet raw card, `mono` uppercase "supervised" | same shape on coal/chalk + de-pilled supervised marker + the step meter (already violet) |
| Toast | ad-hoc bordered div with `✓`/`✗` glyphs | contract inline status row (rose/emerald), no glyph chars |
| `RoleStack` | square avatars `ring-ink-100` | keep avatars; tokens -> coal/chalk |

Hard removals in this file: every `fog-*`, `.slab`, `.eyebrow`, `.board-scene`
reliance, `mono` uppercase label, `pulse-dot`, and raw `<button>`/`<input>`/
`<select>` (replaced by `components/design/*`). Drag-and-drop stays out (server
only exposes named transitions - the existing comment is correct).

Out of scope for this slice (next Phase-T slice): `TaskDetailPage.tsx` and
`components/board/MicroStepPipeline.tsx`. Flagged so the Board landing is small
and reviewable; `MicroStepPipeline` is a 2.5KB near-orphan to audit then (it is
not imported by `BoardPage`).

## 8. Verification

- `pnpm typecheck && pnpm test && pnpm build` (build so it lands in served
  `dist/ui` - the owner's dashboard serves built output, not the dev preview).
- Both-theme screenshots of: `/canvas`, the refactored MC (side-by-side parity
  vs `main`), and the re-skinned Board (empty state + populated, all five
  columns, a supervised card, a waiting/failed card).
- UX-audit items addressed: the KPI dot+label anti-pattern gone, the pulse gone,
  forms compose real inputs, status reads as data.
- UI<->CLI parity preserved (no "run a CLI" instruction as an in-UI fix).

## 9. Risks / unknowns

- **`fill` archetype vertical budget** `[inference]` - `pt-5 pb-0` + a 24px
  header may still crowd five kanban columns on short viewports. Prototype the
  exact top padding on the rendered Board before finalizing the primitive; the
  `fill` variant exists precisely to tune this in one place.
- **MC parity regression** `[evidence]` - refactoring MC's layout is the
  riskiest edit (it is the reference page). Mitigation: screenshot-diff MC vs
  `main` in both themes; the primitive must reproduce the markup exactly, no
  "improvements" smuggled in.
- **Light-theme board** `[evidence]` - the current Board leans on
  `:root.light .board-scene` overrides in `index.css`. Re-skinning removes that
  reliance; verify the light flip works purely off coal/chalk tokens, and leave
  the now-unused `.board-scene` light rule for Phase 7 cleanup (do not bulk-delete
  shared CSS mid-migration - contract §12).
- **`/canvas` in nav** `[guess]` - placing it in the sidebar utility group is a
  judgment call; if it feels like clutter, demote to a settings-page link. Cheap
  to move.

## 10. Sequencing

1. `PageShell`/`PageHeader`/`Section` primitives + MC parity refactor (verify
   parity before proceeding).
2. `/canvas` route + wiring (verify both themes).
3. Contract §0a addition.
4. Board re-skin (verify both themes, empty + populated).
5. `pnpm build`, screenshots, final report.

One feature branch off `main`, per-step commits, typecheck between waves.
