# Vibestrate — Design Direction

This file pins the design language for the Vibestrate supervisor dashboard so the UI stays coherent across phases.

## Product feel

A **local mission-control surface**. Inspectable, technical, premium. The kind of UI a serious developer leaves open in a second monitor while a build runs.

It is *not*:

- a generic SaaS admin panel
- a chat app with a sidebar
- a "purple-glow AI" product
- a dashboard with stat cards full of vanity metrics
- a tool that needs a mascot

It is closer to:

- pgAdmin / TablePlus density and clarity
- Datadog APM trace timeline focus
- Linear's typographic restraint
- a build-system supervisor with diff and log readability as first-class concerns

## Hierarchy

Three zones at the run-detail level:

1. **Sidebar (left)** — runs navigation, current run identity (task/status/branch/worktree). Compact. Persistent.
2. **Main (center)** — workflow timeline, active agent, event stream, validation summary, metrics summary, final report. The narrative.
3. **Inspector (right)** — diff, artifact viewer, validation logs, runtime logs, notes, skills, metrics detail. Click anything in main → context loads here.

Selection in main → detail in inspector. No modal dialogs for primary content.

## Color

Dark-first. The default and only theme in V0.

- Background: deep neutral (near-black, but not pure black). One panel tone above the canvas, one above that for the inspector card.
- Foreground: high-contrast text but not pure white.
- Accents:
  - **success / merge-ready** — green, used sparingly
  - **warn / changes-requested** — amber, never red
  - **fail / blocked / failed** — red, only when truly broken
  - **info / current stage** — cool cyan/blue, the only "brand" hue
- No gradients. No glow. No dropshadow stacks. One subtle border between panels and that's it.
- Diff lines: green for added, red for removed, plain for context. Per-line, not block-shaded.

## Typography

- Sans: a single neutral system stack (`-apple-system`, `Inter`, `Segoe UI`, `Roboto`, `sans-serif`).
- Mono: `JetBrains Mono`, `Fira Code`, fallback `ui-monospace`. Used for: paths, branches, run-ids, diff, log, validation output, artifact bodies.
- Sizes: 12 / 13 / 14 / 16 / 20. No 24+ in primary chrome — the data is the hero, not the title.
- Weight: 400 default, 500 for headings, 600 only for badges and decisions. No 700/800 in chrome.

## Density

- Compact. List rows ~28-32px.
- Generous whitespace inside panels, tight outside.
- No "marketing card" padding.
- Tables aligned: left for text, tabular numerics right-aligned via `font-feature-settings: "tnum"`.

## Iconography

- `lucide-react` only.
- Strokes only, never filled.
- 14-16px in chrome, 18-20px in headers.
- Never decorative. Every icon names a thing or an action.
- No emoji. No "sparkles", no "magic wand", no "rocket".

## Motion

- Minimal. No background pulses. No breathing.
- Status changes use a 120ms color transition. Done.
- Active agent gets a thin animated underline (1px, ~1.2s loop) while running, never on idle.
- Event-stream rows fade in over 80ms.
- That's it.

## Status conventions

- `merge_ready` — green dot + check icon, label "merge ready"
- `blocked` — amber dot + alert-triangle, label "blocked"
- `failed` — red dot + x-circle, label "failed"
- `aborted` — gray dot + x, label "aborted"
- in-flight (`planning`/`executing`/etc.) — cyan dot + thin pulsing underline, label is the status verb

Decisions: `APPROVED` / `CHANGES_REQUESTED` / `BLOCKED` / `PASSED` / `FAILED` / `NEEDS_HUMAN` are always rendered as monospace badges with the same hue rules.

## Diff readability

Diffs are the highest-value content in the inspector. Treat them like the trace view in a profiler.

- Unified diff, not side-by-side (V0).
- Mono. ~13px.
- Line numbers. Two columns: pre / post.
- `+` lines green-tinted, `-` lines red-tinted, hunks dim.
- Long files virtualize. Max-width never crops content; horizontal scroll instead of word-wrap.
- `.env` and obvious-secret files: filename only, body replaced with a single warning row. **Never** show secret diff bodies.

## Logs and artifacts

- Mono. Soft wrap off by default; toggleable.
- Validation logs preserve ANSI color where present (use a stripping/escaping pass for safety).
- Artifact viewer renders Markdown (planner, review, etc.) and JSON (validation results, metrics) natively. No raw text dump for known formats.

## Empty / loading / error

- Empty: one short sentence + the next-step command (e.g. *"No runs yet. Run `vibestrate run "your task"` from this project."*).
- Loading: subtle skeleton, never spinners-of-doom. No "AI is thinking" copy.
- Error: red icon, plain-language message, one fix hint. Same voice as the CLI.

## What never ships

- Sparkle icons, rainbows, gradients, glow effects.
- Mascots, avatars, "Vibestrate Bot" personas.
- Fake progress. Fake metrics. Fake costs. Fake logs.
- Browser-side shell execution. Browser-side spawning of `claude`.
- Auto-push, auto-merge, "click to ship" buttons.
- Decorative AI illustrations. No starfields, no orbs.
- Any UI element that pretends to do something the orchestrator doesn't actually do.

The dashboard is a supervisor surface. It watches. It reports. It annotates. The CLI/core does the work.
