# Crew presets ("Fast Crew" / "Thorough Crew")

Status: SHIPPED. v1 (0.7.87): `fast` / `thorough` effort-tier presets + CLI +
dashboard. v2 (0.7.88): added `cheap` (cheapest model + low effort) and `local`
(non-cloud provider) presets; a per-crew `maxReviewLoops` override (fast=1,
thorough=3) applied on the resolved flow snapshot's `loop.maxIterations` (the
value the runner bounds on - a Tier-2 review caught that `state.maxReviewLoops`
is display-only post D2-unification); curated `cheapModel` catalog metadata
(relative, hand-maintained - no live pricing, per the no-egress posture); and
availability/effect surfaced in the CLI + dashboard. Init-seeding was tried and
**rejected** (it bloats every project.yml and overlaps the on-demand path).
Open: the GLOBAL `workflow.maxReviewLoops` is also display-only at runtime (same
D2 root cause, predates this work) - a separate fix.

## Problem

`vibe init` seeds exactly **one** profile (`<ref>-balanced`, `power: medium`) and
**one** crew (`default`) whose six roles all run on it. Users expect ready-made
crews tuned for a goal - a fast/cheap one for low-stakes work, a thorough one for
risky work - without hand-authoring profiles and rosters. Today, as flagged:
"Crew is supposed to have PRESETS 'Fast Crew', 'Slow Crew'... atm I can only see
one."

## What a preset is

A preset = **a profile tier + a crew whose roles run on it**. The axis that
matters is the **effort/power** of the profile, which is provider-specific (the
schema's `power` is a free string; valid levels come from provider metadata, not
a global enum). The roster stays identical across presets so every Flow seat
stays covered - presets change *how hard the team thinks*, not *who is on it*.

v1 presets:

| Preset | Profile effort | For |
|---|---|---|
| `fast` | provider's **lowest** effort tier | quick, low-stakes, cheap runs |
| `balanced` | provider's **default/medium** (today's `default`) | the everyday crew, unchanged |
| `thorough` | provider's **highest** effort tier | risky / complex work; pairs with the security persona + heavier review |

The effort string is resolved **per provider** from the capability catalog
(`provider-capability-detection.md`), not hardcoded - `fast` = the lowest level
the provider exposes, `thorough` = the highest, and if a provider exposes no
effort control the tier collapses to `balanced` (no-op). Model id stays `null`
(provider default); a per-model axis (haiku vs opus) is a later option.

## Where presets live

Crews reference concrete profile ids and role-prompt paths, so they are **project
data**, not abstract built-ins (a code-resolved crew can't know the user's
profile names or provider). Presets are therefore **materialized into
`project.yml`**, via two entry points:

1. **Fresh `init`** - seed the three profile tiers (`<ref>-fast/-balanced/
   -thorough`) and three preset crews. `defaultCrew` stays `balanced`, byte-
   compatible with today for that crew.
2. **Existing projects** - `vibe crew presets add <fast|thorough>` injects the
   missing profiles + crew. This is how the user's current single-crew project
   gets them. Additive and explicit: never overwrites an existing profile/crew
   id, validates the merged config before writing, and goes through the existing
   `config-update-service` write path. Never deletes anything.

## Surfaces (UI <-> CLI parity)

- **CLI:** `vibe crew presets` (list available presets, mark which are already
  installed), `vibe crew presets add <name>`; existing `vibe crew use <id>` to
  select, `vibe crew list/show` already render them.
- **Dashboard** Crew page (`#/crew`): an "Add preset" affordance listing the
  available presets, POSTing to the same service the CLI uses.
- **Shell:** the `c` crew picker shows presets once installed; a `:` palette
  action "Add preset crew" for parity with the dashboard.

## Selecting per run

Unchanged: `vibe run --crew thorough`, or set the session/default with
`vibe crew use thorough`. The status bar and the run's "why" panel already
surface the active crew.

## Safety / invariants

- **Additive + validated.** Injection never overwrites an existing id; it builds
  the merged config, runs the schema's cross-record `superRefine` (every role's
  profile exists, `defaultCrew` resolves), and only then writes. A name clash is
  a loud refusal, not a silent overwrite.
- **No seat-coverage regressions.** Identical roster across presets -> flows seat
  the same way; only the per-seat profile differs.
- **Provider-honest effort.** Effort levels come from provider metadata; we never
  force an effort a provider doesn't support (it warns-and-ignores today).

## Out of scope (v1)

- **Lean rosters** (drop architect/verifier for raw speed) - that is the flow /
  sizing axis (`express`, A1), not crews. Keep the two orthogonal.
- **Per-provider model presets** (haiku vs opus) - optional follow-up once effort
  tiers prove useful.
- **Auto-selecting a preset from task text** - that is Slice 2b (crew/profile/
  posture auto-selection), tracked separately.

## Plan / slices (each its own commit; CLI before UI)

1. Pure builders: `buildProfileTiers(ref, providerCaps)` +
   `buildPresetCrew(name, ref)`; resolve effort tiers from provider metadata.
   Unit tests (incl. "no-effort provider collapses to balanced").
2. `init` seeds the three tiers + presets (default = balanced; assert the
   balanced crew is byte-identical to today's `default`).
3. `vibe crew presets [add]` CLI + `config-update-service` additive injection
   (clash-refusal + validation tests).
4. Dashboard "Add preset" + shell palette action (parity).

## Open questions

1. **Which presets ship?** `fast / balanced / thorough` only, or also a `cheap`
   (cloud-cost-minimizing: cheapest model) vs `local` split?
2. **Does `fast` also lower `workflow.maxReviewLoops`** (fewer review passes), or
   strictly the profile effort? (Leaning: effort only in v1 - keep the crew axis
   purely about the team, not the flow.)
