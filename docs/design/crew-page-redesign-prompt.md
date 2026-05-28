# Design handoff — Crew page, roles display

**For claude.ai/design.** Redesign **only how the roles are displayed** on
Vibestrate's **Crew** page. Keep the page's existing structure and the rest of its
sections; bring a fresh visual approach to the roles block.

## Context

Vibestrate runs a coding task through a fixed **crew of roles**, in order:

```
planner → architect → executor → (validate) → reviewer → fixer → verifier
                                       ↑__________ loop __________|
```

Each **role** is a seat in the workflow that runs on a **provider** (a local
CLI like Claude Code / Codex / Ollama). One provider can power many roles.

Today the roles are shown as a flat 3-column grid of identical cards — it
doesn't convey that they're an **ordered pipeline** with a review→fix loop, or
the handoffs between them. Find a clearer, more characterful way to display
them.

## Per-role data to surface

- **Role name** + a one-line job blurb (e.g. planner — "drafts the change";
  reviewer — "critiques the diff").
- **Provider** it runs on — **editable** (a dropdown of *configured* providers
  only) with an online/offline dot.
- **Permission** profile as a small chip (e.g. `read-only` vs a write profile;
  write-capable roles read warmer/amber).
- **Skills** count ("2 skills" / "no skills").

## Requirements

- Keep roles **editable in place** — the provider picker per role must stay.
- Convey the **workflow order + the review↔fix loop** (the crew is a sequence,
  not a set).
- Don't touch the rest of the page: a tight hero above, and below the roles a
  "Configured providers" list + detail panel and a link to the Providers page.

## Design language (Vibestrate "Mission Control")

Dark, layered **ink** surfaces; cool-grey **fog** text scale; a single
**violet** accent (`violet-soft ≈ #8b7cff`); **Bricolage Grotesque** for display
headings (`text-display`); glass / soft-bevel panels (`glass`, `bevel-violet`,
`surface-ink-100-55`); flat chips; a subtle `pulse-dot` for live/active state.
React + Tailwind, dark theme only.

Deliver a layout concept (and component sketch) for the roles block — e.g. a
pipeline/timeline, connected stations, or a stage rail — your call, as long as
it reads as "an ordered crew" and stays editable.
