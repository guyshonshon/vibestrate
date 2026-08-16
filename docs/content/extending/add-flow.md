---
title: Add a Flow
description: Write your own run recipe with seats, steps, and an optional pause for your approval.
slug: extending/add-flow
---

A custom [Flow](/docs/concepts/flow) is written in YAML, in a `flow.yml` inside a directory named for the flow id, under `.vibestrate/flows/`.

Vibestrate finds it on its own and checks it against the schema when it loads, so a broken Flow fails loudly at the start instead of quietly partway through a run.

A Flow declares `seats` (the kind of worker each step needs) and `steps`. Every step has a `kind`, one of six:

<div class="docs-chips"><span>agent-turn</span><span>review-turn</span><span>response-turn</span><span>validation</span><span>approval-gate</span><span>summary-turn</span></div>

## Steps

Four moves take a Flow from an empty folder to a finished run.

1. Create the directory: `.vibestrate/flows/spike-and-decide/`.
2. Add `flow.yml`:

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

3. Check that Vibestrate sees it:

   ```bash
   vibe flows list
   vibe flows show spike-and-decide
   ```

4. Run a task with it:

   ```bash
   vibe run "Prototype the search ranking" \
     --flow spike-and-decide
   ```

## Step kinds

Each step has a `kind` that says what happens in it. The example above uses four of them, and the last one halts the run until you decide:

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

Here is what every kind is for.

| Kind | When to use |
|---|---|
| `agent-turn` | One agent does a primary action (plan, implement). |
| `review-turn` | A *different* seat reviews the artifact from a prior step. |
| `response-turn` | The original seat responds to findings. |
| `validation` | Run the project's `commands.validate`. |
| `approval-gate` | Halt the run; human decides whether to continue. |
| `summary-turn` | An arbiter writes a final summary. |

## Seats, not your models

A Seat is the slot a step needs filled, named by the kind of worker it wants - a planner, a builder, a challenger, a prototyper. The Flow only names Seats. It never names your local Roles or Providers, and that is what keeps it shareable. (A Role is one of your configured workers; a Provider is the AI vendor behind it.)

When a run starts, Vibestrate matches each Seat to a Role in your Crew, the set of workers on the job. Each Role lists the Seats it can take under its own `seats:` key in `project.yml`.

If a step needs the same Role behavior but more horsepower, you can override its Profile for that one step. A Profile is the runtime settings a Role runs on, like which model and how hard it thinks.

List the Profile ids first, then name one for a single step:

```bash
vibe profile list
vibe run "..." --flow spike-and-decide \
  --step-profile prototype=<profileId>
```

That runs the `prototype` step on the Profile you name, without changing how the Role behaves. To choose *which* Role fills a Seat for a run, use `--seat-role prototyper=<roleId>`.

## Optional steps

Set `optional: true` on a step to let people skip it on a given run:

```bash
vibe run "..." --flow spike-and-decide \
  --flow-skip plan
```

## Clean-room steps

Set `cleanRoom: true` on a step and that seat stops receiving the run narrative from the steps before it. The run narrative is the run brief, the "story so far", plus the project ledger.

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

With the narrative hidden, a reviewer or verifier judges the work without leaning on how the earlier steps framed things. The step still gets the ground truth: your attached context sources (the specs), your pinned annotations, and the inputs the step declares.

Clean-room hides only the run narrative, never the spec. In testing, hiding the spec from a reviewer made it miss requirement violations it couldn't see, while hiding just the run brief cost nothing. It is off by default, so existing steps don't change.

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

## Common mistakes

- **One Role filling both builder and challenger.** It'll agree with itself. Use two Seats filled by two different Roles.
- **Skipping validation.** Without a `validation` step, your Flow has no ground truth.
- **Over-stuffing one Flow.** Twelve steps is too many. If a Flow grew long, split it.

## Share a Flow (import and export)

Flows travel well because they name Seats, not your local Roles or Providers. One project's Flow drops into another and resolves against that project's Crew.

```bash
# export a Flow to a file you can commit
vibe flows export spike-and-decide \
  --out spike-and-decide.flow.yml

# import one from a file or an http(s) URL
vibe flows import ./spike-and-decide.flow.yml
vibe flows import \
  https://example.com/spike-and-decide.flow.yml
```

Imports are checked against the schema, and refused if they carry the shape of a secret token or any disallowed control characters. Fetches from a URL are bounded in size and time. If a Flow with the same id already exists in the project, it is replaced only when you pass `--overwrite`.

The dashboard Flows page has the same controls (Export, Import, New flow). The HTTP endpoints behind them (`/api/v1/flows/:id/export`, `POST /api/v1/flows/import`, `POST /api/v1/flows`) are documented under [HTTP API](/docs/architecture/http-api).

## Going deeper

- [Flow (concept)](/docs/concepts/flow) - what a Flow is and when to write one.
- [Built-in Flows reference](/docs/reference/flows) - every shipped Flow, step by step.
- [HTTP API](/docs/architecture/http-api) - the endpoints behind the dashboard's Flows controls.
