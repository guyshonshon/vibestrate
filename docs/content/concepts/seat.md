---
title: Seat
description: The empty chair a flow step needs filled - a label, not a name, which is what keeps flows shareable.
slug: concepts/seat
---

## In simple words

A [[flow]] step does not say "use Claude". It says "this step needs a reviewer". That labelled, empty chair is a **Seat**.

A seat is a contract, not a person. It names the *kind* of worker a step needs and nothing about who fills it. Your [[crew]] does the filling, at the moment a task runs.

Open a crew and each worker lists the seats it will take:

![The Seats it takes row on a role card. Ten chips read arbiter, architect, builder, challenger, executor, fixer, implementer, planner, reviewer and verifier. The planner chip is highlighted, marking the seat this role takes.](/media/docs/scoped/seat-chips.png)

Every chip is a chair this role *could* take. The highlighted one is the chair it does take.

<div class="docs-callout tip">

**Tip.** One worker can take several seats. That is why six workers can staff a flow with eight steps, and why you rarely need to add a role just because a flow got longer.

</div>

## Why it works this way

<div class="docs-cards">

**Flows stay portable**
A flow names chairs, never models. Download someone's flow and it runs on your models, at your budget, unedited.

**You swap models without touching process**
Point the role that takes `reviewer` at a different provider. Every flow you run gets that reviewer.

**Gaps surface before the run**
The crew page counts the seats your flows ask for and flags any no role covers, so an unfillable run shows up before it starts.

**One diff, two lenses**
Two steps can share the `reviewer` seat with different instructions: one reads for correctness, one for security.

</div>

<div class="docs-callout">

**Did you know?** Not every step needs a seat. The four kinds where an AI takes a turn do: `agent-turn`, `review-turn`, `response-turn` and `summary-turn`. A `validation` step running your tests, or an `approval-gate` waiting on you, needs none, because nobody is sitting down to think.

</div>

## Going deeper

### The chain a step follows

When a task runs, Vibestrate follows the seat through your crew to an actual model:

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

The step asks for a chair, the role that lists it sits down, and the provider behind that role's profile does the work. Each step records who sat down:

<div class="docs-chips"><span>seat</span><span>resolvedRoleId</span><span>resolvedRoleLabel</span><span>profileId</span><span>providerId</span></div>

### What a seat carries

A `label` and an optional `description`. Nothing else. No model, no vendor. The worker brings the model through its [[profile]].

In the YAML, a flow declares its seats, then points each step at one:

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

The [[role]] that fills this seat can be named anything - Backend Implementer, Executor, Coder - as long as it lists `implementer` in its own `seats`.

### From the CLI

```bash
# a flow's seats, its ordered steps, and whether your crew covers them
vibe flows show default

# your crew's roles, their profiles, and the seats they fill
vibe crew show
```

The seat shape lives in `src/flows/schemas/flow-schema.ts` as `flowSeatSchema`.

Next: [[crew]] is who fills these chairs.
