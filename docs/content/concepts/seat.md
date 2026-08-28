---
title: Seat
description: The empty chair a flow step needs filled - a label, not a name, which is what keeps flows shareable.
slug: concepts/seat
---

## In simple words

A [[flow]] step does not say "use Claude". It says "this step needs a reviewer". That labelled, empty chair is a **Seat**: a contract, not a person, naming the *kind* of worker a step needs and nothing about who fills it. Your [[crew]] does the filling, at the moment a task runs.

**Crew** in the sidebar is where you see the chairs; `vibe ui` opens the dashboard on `127.0.0.1:4317`. A crew's header counts roles, seats and anything uncovered. The ring below reads *n/m seats filled*: each arc is one seat, tinted by the role that takes it, and hovering names both. Leftovers group as **Unassigned**, which no role covers, and **Several takers**, where more than one role claims a seat. Neither is runnable: the resolver refuses rather than picking for you, and `--seat-role <seat>=<role>` names the one you want. Under the ring, **Roles** lists each worker as a card.

<div class="docs-callout tip">

**Tip.** One worker can take several seats. That is why six workers can staff a flow with eight steps, and why you rarely need to add a role because a flow got longer.

</div>

![The Seats it takes row on a role card. Ten chips read arbiter, architect, builder, challenger, executor, fixer, implementer, planner, reviewer and verifier. The planner chip is highlighted, marking the seat this role takes.](/media/docs/scoped/seat-chips.png)

Every chip on a role card is a chair that role *could* take; clicking one adds or drops it.

<div class="docs-callout">

**Did you know?** Not every step needs a seat. The four kinds where an AI takes a turn do: `agent-turn`, `review-turn`, `response-turn` and `summary-turn`. A `validation` step running your tests, or an `approval-gate` waiting on you, needs none, because nobody is sitting down to think.

</div>

## Why it works this way

<div class="docs-cards">

**Flows stay portable**
Download someone's flow and it runs on your models, at your budget, unedited.

**You swap models without touching process**
Point the role that takes `reviewer` at a different provider. Every flow you run gets that reviewer.

**One diff, two lenses**
Two steps can share the `reviewer` seat with different instructions: one reads for correctness, one for security.

</div>

## The chain a step follows

When a task runs, Vibestrate follows the seat through your crew to a model:

<svg viewBox="0 0 500 118" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A Flow step names a Seat, your Crew's Role fills that Seat, the Role names a Profile, and the Profile names a Provider. The Seat is the second link, and the last one a Flow decides.">
  <rect x="0" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="45" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Flow step</text>
  <rect x="102" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="147" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Seat</text>
  <path d="M90 43 L98 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="90,38.5 98,43 90,47.5" fill="var(--fg-200)"/>
  <rect x="204" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="249" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Role</text>
  <path d="M192 43 L200 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="192,38.5 200,43 192,47.5" fill="var(--fg-200)"/>
  <rect x="306" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="351" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Profile</text>
  <path d="M294 43 L302 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="294,38.5 302,43 294,47.5" fill="var(--fg-200)"/>
  <rect x="408" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="453" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Provider</text>
  <path d="M396 43 L404 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="396,38.5 404,43 396,47.5" fill="var(--fg-200)"/>
  <text x="0" y="96" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">review  -&gt;  reviewer  -&gt;  reviewer  -&gt;  claude-balanced  -&gt;  claude-code</text>
</svg>

Each step records who sat down:

<div class="docs-chips"><span>seat</span><span>resolvedRoleId</span><span>resolvedRoleLabel</span><span>profileId</span><span>providerId</span></div>

## What a seat carries

A `label` and an optional `description`. Nothing else. The worker brings the model through its [[profile]].

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

The [[role]] that fills this seat can be named anything (Backend Implementer, Executor, Coder) as long as it lists `implementer` in its own `seats`. Every field around it is annotated in [Flow YAML](/docs/reference/flow-yml); the shape itself is `flowSeatSchema` in `src/flows/schemas/flow-schema.ts`.

## In the terminal shell

`vibe` on its own opens the interactive shell. Press `3` for **Crew**: the roster lists each configured role, and the detail pane carries its `seats` line alongside its provider, permissions and skills. It reads rather than writes, so seat changes go through the dashboard or `project.yml`.

## Automation: the CLI

```bash
# a flow's seats, its ordered steps, and whether your crew covers them
vibe flows show default

# your crew's roles, their profiles, and the seats they fill
vibe crew show
```

Next: [[crew]] is who fills these chairs.
