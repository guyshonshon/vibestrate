---
title: Add a Flow
description: Write your own run recipe with seats, steps, and an optional pause for your approval.
slug: extending/add-flow
---

## In simple words

A custom [[flow]] is a YAML file: `flow.yml` inside a directory named for the flow id, under `.vibestrate/flows/`. You rarely author one from scratch.

The **Flows** page in the dashboard (`vibe ui`, `127.0.0.1:4317`) is where flows are made. Three ways in, in rising order of effort:

- **Draft a flow** - describe what you want in a sentence and the supervisor proposes steps and seats. Nothing is written until you accept it.
- **Customize**, in a built-in card's menu - copies that flow into your project so you edit a working one instead of composing from nothing.
- **New flow** - the editor on a blank draft, saved by **Create flow**.

**Open** on any card goes to the Flow Builder: the step list, a step inspector, **Dry run** to resolve the flow into the run it would create without starting one, and **Edit as YAML** for the file.

<div class="docs-callout tip">

**Tip.** A built-in is read-only in the builder until **Fork to project** copies it into `.vibestrate/flows/`, so the shipped flows stay as a floor you can fall back to.

</div>

## Before you write one

<div class="docs-cards">

**Try a skill first**
If the goal is "always do X", a [[skill]] achieves it with far less machinery.

**Try a clearer task**
Many flow ideas are really a task description that was too vague.

**Then write a flow**
When the *shape* of the work is genuinely different: extra review passes, a mandatory gate, steps in a different order.

</div>

<div class="docs-callout">

**Did you know?** A flow step has no model, provider or profile field, and that is deliberate. A flow names seats only, so the one you write here runs on a teammate's models, at their budget, unedited.

</div>


## Going deeper

### The file behind the builder

Everything the builder writes is one file. **Edit as YAML** shows the real bytes, **Form view** goes back. This is `.vibestrate/flows/spike-and-decide/flow.yml`:

```yaml
id: spike-and-decide
version: 1
label: Spike and decide
description: Prototype, then stop and decide.

seats:
  planner:
    label: Planner
    description: Plans the spike.
  prototyper:
    label: Prototyper
    description: Builds the spike.

steps:
  - id: plan
    label: Plan the spike
    kind: agent-turn
    seat: planner
    inputs: [task-brief]
    outputs: [plan]

  - id: prototype
    label: Build the prototype
    kind: agent-turn
    seat: prototyper
    inputs: [plan]
    outputs: [diff]

  - id: validate
    label: Validate
    kind: validation
    inputs: [diff]
    outputs: [validation]

  - id: human-check
    label: Stop and decide
    kind: approval-gate
    approval:
      reason: Keep the spike, or rewrite?
      requestedAction: continue
```

A loose `.yml` dropped into `.vibestrate/flows/` is skipped, not read: the directory is what makes it a flow. Field by field, [Flow YAML, annotated](/docs/reference/flow-yml) walks the real default flow.

### Step kinds

Each step has a `kind`. The example uses four, and the last halts the run until you decide:

<svg viewBox="0 0 560 58" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The example Flow runs four steps in order: plan and prototype are agent turns, validate runs the project's checks, and human-check is an approval gate that halts the run.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="6" width="104" height="30" rx="8"/>
    <rect x="126" y="6" width="128" height="30" rx="8"/>
    <rect x="275" y="6" width="116" height="30" rx="8"/>
    <rect x="412" y="6" width="147" height="30" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M110 17l4 4-4 4"/>
    <path d="M259 17l4 4-4 4"/>
    <path d="M396 17l4 4-4 4"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="53" y="25">plan</text>
    <text x="190" y="25">prototype</text>
    <text x="333" y="25">validate</text>
    <text x="486" y="25">human-check</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="53" y="52">agent-turn</text>
    <text x="190" y="52">agent-turn</text>
    <text x="333" y="52">validation</text>
    <text x="486" y="52">approval-gate</text>
  </g>
</svg>

| Kind | When to use |
|---|---|
| `agent-turn` | One agent does a primary action (plan, implement). |
| `review-turn` | A *different* seat reviews the artifact from a prior step. |
| `response-turn` | The original seat responds to findings. |
| `validation` | Run the project's `commands.validate`. |
| `approval-gate` | Halt the run; human decides whether to continue. |
| `summary-turn` | An arbiter writes a final summary. |

### Seats, not your models

A Seat is the slot a step needs filled, named by the kind of worker it wants - a planner, a builder, a challenger. A flow never names your local Roles or Providers.

When a run starts, Vibestrate matches each Seat to a Role in your Crew via that Role's `seats:` list. The crew editor's **Seats** panel shows the same matching from the other side: every seat any installed flow declares, and who takes it.

Overriding a seat for one run lives on the command:

```bash
vibe profile list
vibe run "..." --flow spike-and-decide \
  --step-profile prototype=<profileId>
```

That runs the `prototype` step on the Profile you name without changing how the Role behaves. `--seat-role prototyper=<roleId>` chooses *which* Role fills the seat.

### Optional and clean-room steps

Both are toggles on a step card in the flow editor - **Optional** and **Clean room**, beside **Skip on a read-only run** - and both are one line in the file.

`optional: true` lets people skip the step on a given run - `vibe run "..." --flow spike-and-decide --flow-skip plan`.

`cleanRoom: true` stops that seat receiving the run narrative from the steps before it. The narrative is the run brief, the story so far, and the project ledger.

<svg viewBox="0 0 560 148" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A clean-room step still receives your attached specs and pinned annotations, and the inputs the step declares. Only the run narrative is hidden from it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="300" y="1" width="259" height="146" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M256 58 h88"/><path d="M339 53 l5 5 l-5 5"/>
    <path d="M256 92 h88"/><path d="M339 87 l5 5 l-5 5"/>
    <path d="M256 126 h30"/>
    <path d="M291 119 l14 14"/><path d="M305 119 l-14 14"/>
  </g>
  <g fill="currentColor" font-size="12">
    <text x="248" y="62" text-anchor="end">your specs and pinned annotations</text>
    <text x="248" y="96" text-anchor="end">the inputs the step declares</text>
    <text x="248" y="130" text-anchor="end">the run narrative</text>
    <text x="314" y="24">a clean-room step</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="248" y="24" text-anchor="end">what a step is sent</text>
    <text x="352" y="62">still arrives</text>
    <text x="352" y="96">still arrives</text>
    <text x="352" y="130">hidden</text>
  </g>
</svg>

With the narrative hidden, a reviewer judges the work without leaning on how the earlier steps framed it, while still getting ground truth from your context sources, your pinned annotations and the inputs it declares.

Clean-room hides only the narrative, never the spec. In testing, hiding the spec from a reviewer made it miss requirement violations it could not see, while hiding only the run brief cost nothing. Off by default.

```yaml
- id: review
  label: Review
  kind: review-turn
  seat: reviewer
  # reasons from the change and the spec
  inputs: [diff]
  # ...but not the producer's narrative
  cleanRoom: true
```

### Common mistakes

- **One Role filling both builder and challenger.** It will agree with itself. Use two Seats filled by two different Roles. The crew editor flags this as **seats taken twice**.
- **Skipping validation.** Without a `validation` step, your flow has no ground truth.
- **Over-stuffing one flow.** Twelve steps is too many; split one that grew long.

### Share a flow

One project's flow drops into another and resolves against that project's Crew.

In the dashboard: **Export** in a card's menu writes the canonical YAML; **Import** at the top of the page takes **Paste YAML** or **From URL**, with an overwrite checkbox for an id you already have. **Pull a flow**, behind **Browse hub**, browses the community catalog.

The scripting path:

```bash
# export a flow to a file you can commit
vibe flows export spike-and-decide \
  --out spike-and-decide.flow.yml

# import one from a file or an http(s) URL
vibe flows import ./spike-and-decide.flow.yml
vibe flows import \
  https://example.com/spike-and-decide.flow.yml
```

Imports are checked against the schema and refused if they carry the shape of a secret token or any disallowed control character. URL fetches are bounded in size and time. An existing project flow of the same id is replaced only with `--overwrite`.

`vibe shell` carries the same catalog: `f` forks the selected built-in, `h` opens the hub, `↵` makes the selected flow the project default.

### Related

- [Flow (concept)](/docs/concepts/flow) - what a flow is and when to write one.
- [Built-in Flows reference](/docs/reference/flows) - every shipped flow, step by step.
- [HTTP API](/docs/architecture/http-api) - the endpoints behind the dashboard's Flows controls.
