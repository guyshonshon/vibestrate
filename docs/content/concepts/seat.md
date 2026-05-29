# Seat

## Basically

A Seat is what a Flow step needs filled.

## Example

A Flow declares the Seats it needs:

```yaml
seats:
  implementer:
    label: Implementer
    description: Makes code changes.

steps:
  - id: implement
    label: Implement
    kind: agent-turn
    seat: implementer
    inputs: [task-brief, plan, architecture]
    outputs: [execution, diff]
```

Your Crew may fill the `implementer` seat with a Role named Backend Implementer,
Executor, Coder — anything, as long as its `seats` list includes `implementer`.

## More Detail

A Seat is a **contract**, not a person. The Flow says "this step needs an
implementer"; the Crew decides *who* fills it. That's what keeps Flows
shareable — a Flow never names your local Role ids or Profiles.

Validation steps and approval gates don't need a Seat. Turn steps
(`agent-turn` / `review-turn` / `response-turn` / `summary-turn`) do.

## Advanced

- A Seat (`src/flows/schemas/flow-schema.ts` → `flowSeatSchema`) has a `label`
  and optional `description`. It carries no provider — the resolved Role's
  [[profile]] supplies the runtime.
- At resolve time, `step.seat` → Crew Role (whose `seats` includes the seat) →
  Profile → Provider. The resolved snapshot records `seat`, `resolvedRoleId`,
  `resolvedRoleLabel`, `profileId`, and `providerId` per step.

Related: [[flow]], [[crew]], [[role]], [[profile]].
