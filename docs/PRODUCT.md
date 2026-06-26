# Vibestrate - Product & Design Direction

register: product

This file pins the design language for the Vibestrate supervisor dashboard so the
UI stays coherent across phases. It was rewritten 2026-06-27 after the old draft
(dense terminal / "Linear restraint, not a SaaS dashboard, no gradients") kept
steering designs toward something flat and characterless. The direction below is
the one the owner actually approved, by reacting to real references.

## Product feel

A **mission-control surface for an AI agent orchestrator**: you launch a run, the
crew (planner, builder, reviewer, verifier) works it in an isolated worktree, and
this dashboard is where you watch, inspect, and decide. Premium, calm, confident.
The kind of dashboard a developer is happy to leave open on a second monitor.

It is **not** a generic CRUD admin panel, a chat-with-sidebar, or a dense
terminal/IDE clone. It is a *designed product* - closer to a modern fintech or
analytics dashboard than to pgAdmin.

## The approved look (soft-dark, type-led)

Reference DNA the owner endorsed (LOUD by heyradiant.studio, exon, and a soft
"Product overview" dashboard): **near-black canvas + elevated soft rounded cards ·
left sidebar with a highlighted item + colored badges · a top stat row then a card
grid · big bold numbers as the hero · vivid but restrained colored data viz ·
generous, airy whitespace · clean geometric type.**

Anti-references (what made earlier attempts wrong): dense hairline/terminal panels,
tiny mono labels, everything-muted "dull" low-contrast, decoration that doesn't
advise, and the busy "glowing purple AI dashboard" cliche.

## Core law: self-advisory visual components

Every datum maps to its **natural visual form**, never a plain text label:
state -> a stage rail; time -> a timeline/sparkline; quantity -> a big number,
meter, or bar; relationship -> a node graph (the flow + crew); cadence -> an
activity chart. The test is "self-advisory": does the component tell you something
at a glance? Decoration that doesn't advise is banned. Guardrails so this stays
signal, not slop: restrained accent, real hierarchy, no gradient-mesh backgrounds.

## Color

Dark-first, the only theme. The "coal / chalk" palette (tokens in
`src/ui/index.css`, additive to the legacy ink/fog set):

- Surfaces: `--color-coal-800` #161517 (canvas), `coal-600` #201e25 (card),
  `coal-500` #2c2a32 (raised / selected). Never pure black.
- Text: `--color-chalk-100` #f7f6f9 (headings, big numbers - near white),
  `chalk-400` #8c8a96 (muted / secondary). Never pure white.
- Accent: **violet** (`--color-violet-soft` #a78bfa / `#8b5cf6`) for brand,
  selection, primary, live state. Used with discipline, not as decoration.
- Direction / status colors, used semantically and sparingly: **emerald** for
  up / success / merge-ready, **rose** (`--color-fail` #fb7185) for down / failed,
  **amber** (`--color-amber-soft` #fb923c) for warning / counts.
- Strategy: Restrained chrome (one accent), but data viz may go Committed
  single-hue (violet) or use the semantic direction colors. Color earns its place.

## Typography

- Sans: **Plus Jakarta Sans** (`--font-jakarta`, self-hosted via Fontsource).
  Big, bold, tight: hero numbers ~52-58px / 800, headings 19-30px / 700-800,
  body 13-15px. Type and whitespace carry the design. (Satoshi / General Sans are
  the same family if we ever want even more character; self-host the same way.)
- Mono: reserved for ids, paths, branches, diff, logs - not for UI labels.

## Density & layout

- **Airy, not dense.** Generous padding inside soft cards (~22-28px), generous
  gaps between them. Whitespace is a feature, not wasted space.
- Big rounded cards: `border-radius` ~22-24px, a 1px hairline border
  (`white/[0.06]`), lifted one tone above the canvas. No heavy shadows.
- Left sidebar: icon + label nav, a tree for sub-sections, colored count badges,
  a single highlighted selected item.
- A top stat row (big-number metric cards with sparklines + direction pills) over
  a grid of content cards.

## Motion

- Minimal, state-only. 120-200ms ease-out. A thin underline / glow on the live
  run while it runs; sparklines and meters animate value changes. No decorative
  fades, no background pulses, no breathing.

## What never ships

- Vanity metrics or fake data dressed as a hero number (a big number must be real
  and meaningful - runs, acceptance, merged - not theater).
- Rainbow data viz, gradient-mesh / glow backgrounds, glassmorphism-by-default.
- Plain text labels where a self-advisory component belongs.
- Mascots, sparkle "AI magic" icons, decorative illustrations.
- Browser-side shell execution or command spawning; fake progress / costs / logs.

## Build notes

- Foundation: React 19 + Tailwind v4. shadcn/ui is available (branch
  `feat/shadcn-foundation`) as accessible interactive plumbing under bespoke
  styling - it does not dictate the look; the look is bespoke.
- First surface in this language: `src/ui/components/overview/OverviewSurface.tsx`.
- The dashboard watches, reports, annotates, and decides. The CLI/core does the
  work; the UI never pretends to do something the orchestrator doesn't.
