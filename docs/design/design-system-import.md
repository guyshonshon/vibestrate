---
title: Design-system import from the marketing site (drift off glass to solid scenes)
status: in-progress
created: 2026-06-16
related: [experience-overhaul.md, amaco-ui-supervisor-addendum.md]
---

# Design-system import (product <- marketing)

Goal: the dashboard adopts the marketing site's design language so product + site
read as one continuous, engineered whole. Source of truth is the marketing repo
**`/Users/guy/Programming/vibestrate-marketing`** - `src/styles/global.css` (the
tokens) + `DESIGN.md` (the documented system; "when doc and code disagree, the
CODE wins"). We derive the *language* (tokens, fonts, geometry, surfaces), not the
Astro components (the product is React + Vite + Tailwind v4).

## The drift (what changes)

The product was **glassmorphism**: `.glass` = `backdrop-filter: blur()` + low
contrast (grey-on-bright, the user's "barely visible" complaint). The marketing
system is the opposite and explicitly bans glass:

- **Solid colour fields + inverting components** via `[data-scene]` + `--s-*`
  tokens (a slab reads against any ground: ink / paper / violet).
- **Hard geometry**, radius **4-8px** (desktop). No gradients, no glow.
- **Depth = crisp directional contact shadows + occlusion**, never ambient halos.
- **Four type voices:** Geist (body), Bricolage Grotesque (display: headings,
  card titles, phase labels), Space Grotesk (wordmark only), Geist Mono /
  JetBrains Mono (technical / terminal ONLY - never whole sections in mono).
- Body text never lighter than `fog-300`. Violet is the *rare active-state*
  signal on dense surfaces (<=~10%), not ambient. Emerald is the single "loud"
  approve/done accent.
- Copy bans (already our rules): no em dashes, no `X · Y · Z` triplets, no
  ordinal badges.

## Foundation shipped (additive, reversible - nothing removed yet)

`src/ui/index.css`:
- **Brand fonts loaded.** The product referenced `"Geist"` / `"Bricolage
  Grotesque"` by name but installed NO font packages, so it silently fell back to
  system fonts. Added `@fontsource-variable/{geist,geist-mono,bricolage-grotesque,
  space-grotesk,jetbrains-mono}` (same versions as marketing) + `@import`s, and
  fixed the family names to the loaded `"<Family> Variable"`. The whole dashboard
  now renders in the real brand type.
- **Tokens:** added emerald (`--color-emerald*`) + status, `--font-wordmark`
  (Space Grotesk), `--font-term` (JetBrains), `--shadow-contact`, `--ease-out`.
- **Scene system:** `[data-scene]` + `--s-*` (ink / paper / violet) +
  `.scene-ground`, ported 1:1 from marketing.
- **`.slab` / `.slab-flat`:** the solid-surface primitive that replaces `.glass`
  going forward (solid ground, 1px line, hard radius, contact shadow, no blur).

Verified: `pnpm build:ui` (fonts resolve, CSS compiles).

## Plan (remaining)

| Step | What | Risk |
| --- | --- | --- |
| **C2 - dedicated Run page** | a real route (not the cramped composer component): full CLI-parity controls in the solid-scene language, flow quick-look, readable contrast. First surface built natively in the new system. | Med (new route + UI) |
| **Glass rollout** | migrate the ~21 `.glass` usages to `.slab`, screen by screen, until no `backdrop-filter` remains. | **Med-high, app-wide** |
| **Component pass** | headings -> Bricolage, technical bits -> mono only, emerald reserved for approve/done, kill stray gradients/glow. | Med |

**The glass rollout is high-blast (touches every screen) and gets an independent
adversarial review before it lands** (per the supervisor protocol). The foundation
above is additive - existing `.glass` screens are untouched and keep working until
migrated, so nothing is stranded mid-flight.

## Honest limit

True *pixel-perfect* parity needs a browser comparison against the live marketing
site (side-by-side), which can't be fully done headless. The token + font +
geometry derivation is exact (from the source CSS); visual fine-tuning of the new
surfaces needs a real browser pass (the `run` / `verify` flow, or your eyes).
