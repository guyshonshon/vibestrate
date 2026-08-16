---
title: Seat
description: The empty chair a Flow step needs filled - a label, not a name, which is what keeps Flows shareable.
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

A Seat carries a `label` and an optional `description`, and nothing else - no model, no vendor. The worker who takes the Seat brings the model through its [profile](/docs/concepts/profile), so the same Flow can run on different AI depending on who fills the chair.

## Which steps need a Seat

Not every step does. A `validation` step that runs your tests, or an `approval-gate` that waits for you, needs no Seat - nobody is sitting down to think. The four kinds where an AI takes a turn do: `agent-turn`, `review-turn`, `response-turn` and `summary-turn`.

## Going deeper

When a task runs, Vibestrate follows the chain from the step's Seat through your Crew to the actual model and provider:

<svg viewBox="0 0 560 52" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A Flow step names a Seat, your Crew's Role fills that Seat, the Role names a Profile, and the Profile names a Provider. The Seat is the second link, and the last one a Flow decides.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="222.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="333.5" y="0.5" width="116" height="45" rx="8"/>
    <rect x="472.5" y="0.5" width="87" height="45" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="111.5" y="0.5" width="88" height="45" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M92.5 23 H102.5"/>
    <path d="M203.5 23 H213.5"/>
    <path d="M314.5 23 H324.5"/>
    <path d="M453.5 23 H463.5"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="102.5,19.5 108,23 102.5,26.5"/>
    <polygon points="213.5,19.5 219,23 213.5,26.5"/>
    <polygon points="324.5,19.5 330,23 324.5,26.5"/>
    <polygon points="463.5,19.5 469,23 463.5,26.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="44.5" y="19">Flow step</text>
    <text x="155.5" y="19">Seat</text>
    <text x="266.5" y="19">Role</text>
    <text x="391.5" y="19">Profile</text>
    <text x="516" y="19">Provider</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="44.5" y="35">review</text>
    <text x="155.5" y="35">reviewer</text>
    <text x="266.5" y="35">reviewer</text>
    <text x="391.5" y="35">claude-balanced</text>
    <text x="516" y="35">claude</text>
  </g>
</svg>

The step asks for a chair. The Role that lists that chair sits down, runs on the Profile it names, and the Provider behind that Profile does the work.

Each step records who actually sat down:

<div class="docs-chips"><span>seat</span><span>resolvedRoleId</span><span>resolvedRoleLabel</span><span>profileId</span><span>providerId</span></div>

The Seat shape lives in `src/flows/schemas/flow-schema.ts` as `flowSeatSchema`.

Related: [[flow]], [[crew]], [[role]], [[profile]].
