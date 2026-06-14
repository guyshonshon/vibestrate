---
title: Crew
description: Your local team of AI Roles. A run picks one Crew and matches the Flow's Seats to its Roles.
section: concepts
slug: concepts/crew
---

# Crew

## Basically

A Crew is your local team of AI Roles.

## Example

```yaml
crews:
  default:
    label: Default
    roles:
      backend-implementer:
        label: Backend Implementer
        seats: [implementer, executor, builder]
        profile: claude-sonnet-deep
        prompt: .vibestrate/roles/executor.md
        permissions: code_write
        skills: []
defaultCrew: default
```

## More Detail

Each Crew holds a roster of **Roles**. A run picks one Crew (defaulting to
`defaultCrew`) and matches the Flow's **Seats** to Roles in that Crew via each
Role's `seats` list. The same Role can fill several Seats, and you can keep more
than one Crew (e.g. a fast crew and a careful crew) and choose at run time with
`--crew`.

When a Flow needs a Seat that no Role in the selected Crew fills, the run fails
with a clear message ("add this seat to a role's Seats"). When two Roles fill
the same Seat, it's ambiguous and the run asks you to pick one.

## Presets

Ready-made crews so you don't have to hand-author one - all over the **same
roster** as your default crew (so a Flow's Seats stay covered; a preset changes
*how* the team runs, not *who* is on it):

- **`fast`** - lowest provider effort + fewer review loops (1). Quick, low-stakes.
- **`thorough`** - highest effort + extra review loops (3). Risky / complex work.
- **`cheap`** - the provider's cheapest model at low effort. Minimise spend.
- **`local`** - runs on a local (non-cloud) provider. Keeps work off cloud APIs.

`vibe crew presets` lists them with whether each applies to your setup and what
it would do (provider, model, effort, review loops) - or why it can't. The
dashboard's Crew page shows the same under **Presets** with one-click **Add**.
`vibe crew presets add cheap` installs one (added to `project.yml` without
overwriting anything); then `vibe crew use cheap`, or `vibe run "…" --crew cheap`
for one run.

Each preset **refuses** rather than create a crew identical to your default:
`fast`/`thorough` need a provider with effort control (claude, codex); `cheap`
needs a provider with a designated cheap model; `local` needs a local provider
separate from your default. `fast`/`thorough` also set a per-crew
`maxReviewLoops` (see below) so review depth follows the crew you pick.

## Advanced

Schema (`src/crews/crew-schema.ts`, `src/roles/role-schema.ts`):

- `crews.<crewId>.label?`, optional `crews.<crewId>.maxReviewLoops` (0..10,
  overrides `workflow.maxReviewLoops` for runs on this crew), and
  `crews.<crewId>.roles.<roleId>` - at least one role.
- A Role has `seats: string[]`, `profile`, `prompt`, `permissions`, `skills`,
  and optional `mcpServers`. It runs on a [[profile]] (not a provider directly).
- `defaultCrew` must name a crew that exists.

- CLI: `vibe run "task" --crew default`; `vibe crew presets [add <fast|thorough>]`.
- API: `GET /api/crews`, `GET /api/crews/:crewId`,
  `PATCH /api/crews/:crewId/roles/:roleId`, `GET /api/crews/presets`,
  `POST /api/crews/presets/install`.

Related: [[role]], [[seat]], [[profile]], [[flow]], [[provider]].
