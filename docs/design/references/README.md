# Design reference set

The shared visual inputs every page-redesign agent reads **before** touching a
screen, so redesigns match a real target instead of an invented one. Pointed at
by the per-page agent brief in
[`../../superpowers/specs/2026-06-27-design-rendered-rollout-design.md`](../../superpowers/specs/2026-06-27-design-rendered-rollout-design.md)
and the contract in [`../primitives-contract.md`](../primitives-contract.md).

## Files in this folder

| File | What it is | Borrow | Do NOT borrow |
| --- | --- | --- | --- |
| `mission-control-dark.png` | The canonical in-app idiom, dark. **This is the screen to match.** | Everything: surface elevation, dense cards, violet accent, status-as-tinted-number, sentence-case heading, flow mini-bars. | n/a - this is the target. |
| `mission-control-light.png` | Same screen, light theme. Proves every recipe is theme-aware. | The light-token behavior (near-identical layout, flipped palette). | n/a. |
| `brand-home.jpeg` | The product brand frame (marketing home). | Palette (violet/coal), mono captions, big sentence headline, Plan/Build/Review/Verify phase-bar language. | Its marketing-site *layout* - it is a hero page, not a dashboard. Don't copy the hero composition into app screens. |

## Named external references (the user's stated taste - capture live if needed)

These are not committed as images (external sites); they are the agreed taste
anchors from project memory. Capture a fresh screenshot via the browser MCP only
if an agent needs one.

- **LOUD by heyradiant.studio** - modern dark dashboard, single-hue violet data
  viz, rounded cards, real surface layering.
  - Borrow: surface layering, single-hue violet viz, rounded card system.
  - Do NOT borrow: its finance hero-metric composition.
- **Raycast** - translucency done with restraint.
  - Borrow: restrained translucency, calm density.

## Dislikes to actively avoid

- Railway / Vercel / Warp genericism ("looks like every other dev tool").
- "AI slop" backgrounds: grids, dot fields, noise textures, purple gradient
  meshes. The foundation uses a desaturated violet-tinted grain only; do not add
  decorative backgrounds.
- Anything in the anti-pattern list in [`../primitives-contract.md`](../primitives-contract.md)
  (eyebrows, pill labels, pulse animation, naked dot+sentence, airy cards).

## Regenerating the Mission Control captures

`pnpm dev:ui` (port 4318), open `/`, toggle theme via the sidebar control, full-
page screenshot each. These drift as Mission Control evolves; the living source
of truth is the reference implementation files listed in the contract, not these
PNGs.
