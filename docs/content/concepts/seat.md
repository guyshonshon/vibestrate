---
title: Seat
description: The empty chair a Flow step needs filled - a label, not a name, which is what keeps Flows shareable.
section: concepts
slug: concepts/seat
---

A **Seat** is an empty, labelled chair in a Flow that says "this step needs someone to fill it." It is a contract, not a person: it names the *kind* of worker a step needs, and nothing about who.

Picture a Flow as a table with chairs around it. One chair is labelled "implementer", another "reviewer". The Flow sets out the chairs and what each one is for. It never says who sits down. Your [Crew](/docs/concepts/crew) does that, choosing a worker for each Seat when the task actually runs.

That gap is the whole point. Because a Flow only names chairs and never names your AI models, you can take a Flow someone else wrote and run it with your own workers. The chairs are shared. Who fills them is yours.

## How a Flow asks for a Seat

A Flow declares the Seats it needs, then points each step at one:

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

Your Crew fills the `implementer` seat with a worker (a [Role](/docs/concepts/role)) you've set up. You can name that Role anything - Backend Implementer, Executor, Coder - as long as it lists `implementer` in its own `seats`.

## Which steps need a Seat

Not every step does. A step that just runs your tests, or one that pauses for your approval, needs no Seat - nobody is sitting down to think. Steps where an AI does a turn of work do: `agent-turn`, `review-turn`, `response-turn`, and `summary-turn`.

## Going deeper

A Seat carries a `label` and an optional `description`, and nothing else - no model, no vendor. The worker who takes the Seat brings the model through its [profile](/docs/concepts/profile), so the same Flow can run on different AI depending on who fills the chair.

When a task runs, Vibestrate follows the chain `step.seat` to Crew Role to Profile to provider, and records who actually sat down for each step: `seat`, `resolvedRoleId`, `resolvedRoleLabel`, `profileId`, and `providerId`. The Seat shape lives in `src/flows/schemas/flow-schema.ts` as `flowSeatSchema`.

Related: [[flow]], [[crew]], [[role]], [[profile]].
