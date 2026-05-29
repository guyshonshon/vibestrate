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
        fills: [implementer, executor, builder]
        profile: claude-sonnet-deep
        prompt: .vibestrate/roles/executor.md
        permissions: code_write
        skills: []
defaultCrew: default
```

## More Detail

Each Crew holds a roster of **Roles**. A run picks one Crew (defaulting to
`defaultCrew`) and matches the Flow's **Seats** to Roles in that Crew via each
Role's `fills` list. The same Role can fill several Seats, and you can keep more
than one Crew (e.g. a fast crew and a careful crew) and choose at run time with
`--crew`.

When a Flow needs a Seat that no Role in the selected Crew fills, the run fails
with a clear message ("add this seat to a role's Seats"). When two Roles fill
the same Seat, it's ambiguous and the run asks you to pick one.

## Advanced

Schema (`src/crews/crew-schema.ts`, `src/roles/role-schema.ts`):

- `crews.<crewId>.label?` and `crews.<crewId>.roles.<roleId>` — at least one role.
- A Role has `fills: string[]`, `profile`, `prompt`, `permissions`, `skills`,
  and optional `mcpServers`. It runs on a [[profile]] (not a provider directly).
- `defaultCrew` must name a crew that exists.

- CLI: `vibe run "task" --crew default`.
- API: `GET /api/crews`, `GET /api/crews/:crewId`,
  `PATCH /api/crews/:crewId/roles/:roleId`.

Related: [[role]], [[seat]], [[profile]], [[flow]], [[provider]].
