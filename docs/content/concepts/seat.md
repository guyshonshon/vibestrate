---
title: Seat
description: The empty chair a Flow step needs filled - a label, not a name, which is what keeps Flows shareable.
slug: concepts/seat
---

A **Seat** is an empty, labelled chair in a Flow that says "this step needs someone to fill it." It is a contract, not a person: it names the *kind* of worker a step needs, and nothing about who.

The Crew page is where the chairs meet the people who sit in them.

![The Crew page. Each role is listed as a row naming the Seats it can fill and the Profile it runs on, under a Crew header.](/media/docs/crew.png)

Every row is one of your Roles. The Seats column is the set of chairs that Role will take, and the Profile column is the model it brings when it takes one. The page also counts the seats your Flows can ask for and flags any that no Role covers, so an unfillable run shows up before you start it.

A Flow sets out the chairs and never says who sits down; your [Crew](/docs/concepts/crew) does that, at the moment a task runs. That gap is the whole point: a Flow names chairs and never names your AI models, so you can take a Flow someone else wrote and run it with your own workers.

## Steps that need a Seat

Open a Flow from the Flows page and select a step: the inspector carries a **Seat** field listing the chairs that Flow declared, labelled required or optional for the step's kind. The four kinds where an AI takes a turn need one: `agent-turn`, `review-turn`, `response-turn` and `summary-turn`. A `validation` step that runs your tests, or an `approval-gate` that waits for you, needs no Seat, since nobody is sitting down to think.

A Seat carries a `label` and an optional `description`, and nothing else - no model, no vendor. The worker brings the model through its [profile](/docs/concepts/profile), so one Flow can run on different AI depending on who fills the chair.

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

The step asks for a chair, the Role that lists it sits down, and the Provider behind that Role's Profile does the work. Each step records who sat down:

<div class="docs-chips"><span>seat</span><span>resolvedRoleId</span><span>resolvedRoleLabel</span><span>profileId</span><span>providerId</span></div>

## Advanced: CLI and automation

Both sides of the chain print in a terminal, the path for scripts and for reading someone else's Flow. See the [CLI overview](/docs/cli/overview).

```bash
# a Flow's seats, its ordered steps, and whether your Crew covers them
vibe flows show default

# your Crew's roles, their profiles, and the seats they fill
vibe crew show
```

In the YAML, a Flow declares its Seats, then points each step at one:

```yaml
seats:
  implementer:
    label: Implementer
    description: Implements the plan and architecture.

steps:
  - id: implement
    label: Implement
    kind: agent-turn
    seat: implementer
    inputs: [task-brief, plan, architecture]
    outputs: [execution, diff]
```

The [Role](/docs/concepts/role) that fills this seat can be named anything - Backend Implementer, Executor, Coder - as long as it lists `implementer` in its own `seats`.

The Seat shape lives in `src/flows/schemas/flow-schema.ts` as `flowSeatSchema`.

Related: [[flow]], [[crew]], [[role]], [[profile]].
