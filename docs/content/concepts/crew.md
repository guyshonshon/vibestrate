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

Ready-made crews so you don't have to hand-author one:

- `vibe crew presets` - list the presets (`fast`, `thorough`) and whether each is
  installed. The dashboard's Crew page has the same list under **Presets**.
- `vibe crew presets add fast` - add a `fast` crew: the same roster as your
  default crew, every Role on a profile at your provider's **lowest** effort.
  `thorough` uses the **highest**. Then `vibe crew use fast` to make it the
  default, or `vibe run "…" --crew fast` for one run.

A preset changes *how hard the team runs* (the profile effort), not *who is on
it*, so a Flow's Seats stay covered. It's built on your default crew's provider,
and added to `project.yml` without overwriting anything. Presets need a provider
with effort control (e.g. claude, codex); on a provider with none, the install
refuses - the two tiers would be identical to your default crew.

## Advanced

Schema (`src/crews/crew-schema.ts`, `src/roles/role-schema.ts`):

- `crews.<crewId>.label?` and `crews.<crewId>.roles.<roleId>` - at least one role.
- A Role has `seats: string[]`, `profile`, `prompt`, `permissions`, `skills`,
  and optional `mcpServers`. It runs on a [[profile]] (not a provider directly).
- `defaultCrew` must name a crew that exists.

- CLI: `vibe run "task" --crew default`; `vibe crew presets [add <fast|thorough>]`.
- API: `GET /api/crews`, `GET /api/crews/:crewId`,
  `PATCH /api/crews/:crewId/roles/:roleId`, `GET /api/crews/presets`,
  `POST /api/crews/presets/install`.

Related: [[role]], [[seat]], [[profile]], [[flow]], [[provider]].
