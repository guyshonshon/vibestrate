# Primitives contract (canonical idiom)

The single file every page-redesign agent reads before touching a screen. It is
**not** a component library - the canonical foundation is the Tailwind idiom that
Mission Control and its satellites already ship. Every recipe below is lifted
verbatim from a reference implementation; the line cite is where to copy it from.

**Canonical reference files (the pattern library):**
- `src/ui/app/routes/MissionControlPage.tsx`
- `src/ui/components/mission/MissionComposer.tsx`
- `src/ui/components/mission/RunActions.tsx`
- `src/ui/components/mission/runPhase.tsx`
- `src/ui/components/control/*`

Visual references: [`references/`](./references/) (Mission Control dark+light,
brand frame, LOUD / Raycast taste notes). Token decisions:
[`design-system-rollout.md` crosswalk](./design-system-rollout.md).

---

## 1. Tokens - new only

Use only the new token names. Never `vibestrate-*` / `fog-*` in new/edited code.

- Text: `text-chalk-100` (primary), `text-chalk-300` (dim), `text-chalk-400` (muted/labels).
- Accent: `text-violet-soft`, fills `bg-violet-soft`, tints `bg-violet-soft/10`..`/12`.
- Status: `emerald` (success/positive), `amber-soft` (warn/attention), `rose-300`/`rose-500` (fail/destructive), `sky-glow` (info).
- Surfaces by elevation (dark): canvas `bg-coal-800` -> card `bg-coal-600` -> inner chip/row `bg-coal-500` -> hover `bg-coal-400`. Base card may also use `bg-[var(--card)]`.
- Lines: `border-[color:var(--line)]` (default), `var(--line-soft)`, `var(--line-strong)` (inputs/secondary buttons).
- Every recipe must hold in **both** themes - the tokens flip under `:root.light`. Verify light too; never hardcode a hex.

## 2. Type scale - dense

`text-[10px]` / `text-[11.5px]` / `text-[12.5px]` / `text-[13px]` / `text-[13.5px]` / `text-[14px]`,
weights `font-medium` / `font-semibold` / `font-bold`. Body shell uses
`font-jakarta`. No oversized headings; density is the house style.

## 3. Rounding

- Cards / surfaces: `rounded-[16px]` / `rounded-[18px]` / `rounded-[20px]` / `rounded-[22px]` (bigger = more prominent).
- Interactive (buttons/inputs/rows): `rounded-[10px]` / `rounded-[12px]` / `rounded-[14px]`.
- Rails / progress bars only: `rounded-full`.
- **Labels are never pill-rounded.** A status pill is a hard no (see anti-patterns).

## 4. Buttons (verbatim)

- **Primary (filled violet)** - `MissionControlPage.tsx:358`:
  `rounded-[12px] bg-violet-soft px-3 py-2.5 text-[13.5px] font-bold text-coal-900 transition hover:bg-violet-soft/90`
  (text is `text-coal-900` so it inverts correctly on the light flip).
- **Secondary (outline)** - `MissionComposer.tsx:388`:
  `rounded-[12px] border border-[color:var(--line-strong)] px-4 py-2.5 text-[13px] font-semibold text-chalk-300 transition hover:text-chalk-100`
- **Subtle (filled neutral)** - `MissionControlPage.tsx:568`:
  `flex items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 py-1.5 text-[12.5px] font-semibold text-chalk-100 hover:bg-coal-400`
- **Intent-tinted ghost** - `RunActions.tsx:61-62` base:
  `inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50`
  then tint by intent: violet `text-violet-soft hover:bg-violet-soft/10`, pause `text-amber-soft hover:bg-amber-soft/10`, destructive `text-rose-300 hover:bg-rose-500/10`, affirm `bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25` (`MissionControlPage.tsx:402`).
- **Link / inline action**: `text-[12.5px] font-semibold text-violet-soft hover:text-violet-soft/80` (`MissionControlPage.tsx:307`).

A disabled action states *what is missing* in its own label (e.g. "Add a task
brief to launch") - never a separate dot+sentence beside it.

## 5. Cards & surfaces (verbatim)

- **Card shell**: `rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4` (`MissionControlPage.tsx:529`); larger `rounded-[20px] ... p-5` (`:497`); composer panel `rounded-[16px] border border-[color:var(--line)] bg-coal-800 p-3` (`MissionComposer.tsx:112`).
- **Inner row/chip**: `flex items-center gap-3 rounded-[14px] bg-coal-500/60 px-4 py-3` (`MissionControlPage.tsx:398`).
- Cards are **dense and informative** - real content, not airy padding around one number. (See anti-patterns.)

## 6. Inputs (verbatim)

`MissionComposer.tsx:541` / `:652`:
`w-full rounded-[14px] border border-[color:var(--line-strong)] bg-coal-800 px-3 py-2.5 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none`
(textarea adds `resize-none`). Focus ring is a violet border, not a box-shadow.

## 7. Status, errors, banners (verbatim)

- **Inline error / status row** - `RunActions.tsx:100`:
  `w-full rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11.5px] text-rose-300`. Larger banner `rounded-[12px] ... px-4 py-2.5 text-[13px]` (`MissionControlPage.tsx:374`).
- **Attention section**: `rounded-[22px] border border-amber-soft/25 bg-coal-600 p-6` (`MissionControlPage.tsx:392`).
- **Status as value**: render run/count status as **flat tinted text + number** (e.g. merge-ready count in emerald, failed in amber-soft), not a pill, not a dot+sentence. Reuse `runs/RunStatusBadge` for run status.
- **State folds into a real framed control** - never a naked status dot followed by a floating sentence.

## 8. Icons

lucide-react, `h-3.5 w-3.5` or `h-4 w-4` (sidebar `h-[18px]`), `strokeWidth={1.9}`, `aria-hidden` on decorative icons.

## 9. Phase / progress

Reuse `mission/runPhase`: `PhaseRail` (the 6-segment violet rail, red when bad) +
`statusMessage` (status-driven, playful copy) + `RUN_STAGES`. Progress is driven
by real status, never a scripted timer.

## 10. Shared primitives to reuse (do not re-derive)

`design/EntityIcon`, `design/ThemeToggle`, `mission/runPhase` (`PhaseRail`,
`statusMessage`), `layout/PanelBoard`, `runs/RunStatusBadge`, `design/Chip`
(de-pilled), `design/Select`, `design/EffortScale`. If a block repeats across
3+ pages and none of these fit, extract a new primitive that renders Mission
Control's existing inline version exactly - extraction, not invention. Bias to
fewer primitives.

## 11. Anti-patterns (hard no)

- Eyebrow kickers: faint uppercase slug above a title. Retire `SectionEyebrow`, the `.eyebrow` class, and uppercase `vibestrate-mono`. The heading carries the page; a lone section label stays as legible sentence-case.
- Pill-rounded labels (`rounded-full` on a text label / badge).
- Pulse / breathing animation on any chrome (status dots, badges, borders). The consult orb is the **only** sanctioned animated/glow exception.
- Naked status dot + sentence ("readiness" text floating beside a dot).
- Airy / sparse cards. Cards must be dense and carry real information.
- Old tokens (`vibestrate-*` / `fog-*`) in new code.
- Em dashes (use `-`). Emojis (never, anywhere - including UI copy).
- Decorative "AI slop" backgrounds: grids, dot fields, noise, purple gradient mesh. The foundation's desaturated violet grain is the only background texture.

## 12. Retire-on-migration (do not bulk-delete now)

`SectionEyebrow` still has **9 consumers + 27 `.eyebrow` usages** on un-migrated
pages (audited 2026-06-27). Each page redesign removes *its own* eyebrow usage as
it migrates. The `SectionEyebrow.tsx` file and the `.eyebrow` / `vibestrate-mono`
CSS are deleted only in **Phase 7 cleanup**, once grep shows zero consumers.
Never half-delete a shared primitive that live pages still import.

## 13. Theme + verification (every screen)

Every redesigned screen must render correctly in dark (`:root`) and light
(`:root.light`) - the tokens flip; do not hardcode hex. Verify with
`pnpm typecheck && pnpm build` and a both-theme screenshot in the preview before
calling a page done.
