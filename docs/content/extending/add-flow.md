---
title: Add a Flow
description: Write your own run recipe with seats, steps, and an optional pause for your approval.
section: extending
slug: extending/add-flow
---

A Flow is the ordered list of steps Vibestrate works through to finish a task, and you write one in YAML. Drop the file under `.vibestrate/flows/<id>/flow.yml` and Vibestrate finds it on its own. It checks the file against the schema when it loads, so a broken Flow fails loudly at the start instead of quietly partway through a run.

## Steps

Four moves take a Flow from an empty folder to a finished run.

<div class="docs-flow">
<div><b>Make a folder</b><span>One directory under .vibestrate/flows/ with your Flow id.</span></div>
<div><b>Write flow.yml</b><span>Declare the seats and the ordered steps in YAML.</span></div>
<div><b>List and show</b><span>Vibestrate picks it up and validates it on load.</span></div>
<div><b>Run a task</b><span>Point a run at the Flow with --flow.</span></div>
</div>

1. Create the directory: `.vibestrate/flows/spike-and-decide/`.
2. Add `flow.yml`:

   ```yaml
   id: spike-and-decide
   version: 1
   label: Spike and decide
   description: Quick prototype with a built-in stop-and-check gate.

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
         reason: Decide whether to keep the spike or rewrite from scratch.
         requestedAction: continue
   ```

3. Check that Vibestrate sees it:

   ```bash
   vibe flows list
   vibe flows show spike-and-decide
   ```

4. Run a task with it:

   ```bash
   vibe run "Prototype the new search ranking" --flow spike-and-decide
   ```

## Step kinds

Each step has a `kind` that says what happens in it. Here is what each one is for.

| Kind | When to use |
|---|---|
| `agent-turn` | One agent does a primary action (plan, implement). |
| `review-turn` | A *different* seat reviews the artifact from a prior step. |
| `response-turn` | The original seat responds to findings. |
| `validation` | Run the project's `commands.validate`. |
| `approval-gate` | Halt the run; human decides whether to continue. |
| `summary-turn` | An arbiter writes a final summary. |

## Seats, not your models

A Seat is the slot a step needs filled, named by the kind of worker it wants: `planner`, `builder`, `challenger`, `prototyper`. The Flow only names Seats. It never names your local Roles or Providers, and that is what keeps it shareable. (A Role is one of your configured workers; a Provider is the AI vendor behind it.)

When a run starts, Vibestrate matches each Seat to a Role in your Crew, the set of workers on the job. Each Role declares the Seats it `fills`.

If a step needs the same Role behavior but more horsepower, you can override its Profile for that one step. A Profile is the runtime settings a Role runs on, like which model and how hard it thinks.

```bash
vibe run "..." --flow spike-and-decide --step-profile prototype=opus-deep
```

That runs the `prototype` step on the `opus-deep` Profile without changing how the Role behaves. To choose *which* Role fills a Seat for a run, use `--seat-role prototyper=<roleId>`.

## Optional steps

Set `optional: true` on a step to let people skip it on a given run:

```bash
vibe run "..." --flow spike-and-decide --flow-skip plan
```

## Clean-room steps

Set `cleanRoom: true` on a step and that seat stops receiving the run narrative from the steps before it. The run narrative is the run brief, the "story so far", plus the project ledger. With it hidden, a reviewer or verifier judges the work without leaning on how the earlier steps framed things. The step still gets the ground truth: your attached context sources (the specs), your pinned annotations, and the inputs the step declares.

```yaml
- id: review
  label: Review
  kind: review-turn
  seat: reviewer
  inputs: [diff]      # the reviewer reasons from the change + the spec
  cleanRoom: true     # ...without the producer's narrative of how it got there
```

<div class="docs-callout">

**Drop the chatter, keep the truth.** Clean-room hides only the run narrative, never the spec. In testing, hiding the spec from a reviewer made it miss requirement violations it couldn't see, while hiding just the run brief cost nothing. It is off by default, so existing steps don't change.

</div>

## Common mistakes

- **One Role filling both builder and challenger.** It'll agree with itself. Use two Seats filled by two different Roles.
- **Skipping validation.** Without a `validation` step, your Flow has no ground truth.
- **Over-stuffing one Flow.** Twelve steps is too many. If a Flow grew long, split it.

## Share a Flow (import and export)

Flows travel well because they name Seats, not your local Roles or Providers. One project's Flow drops into another and resolves against that project's Crew.

<div class="docs-callout">

**Sharing is just export and import.** Export writes a Flow to a file you can commit or send. Import reads one back, and every import is checked against the schema on load, so a broken or unsafe Flow is refused at the door rather than mid-run.

</div>

```bash
# export a Flow to a file you can commit or send
vibe flows export spike-and-decide --out spike-and-decide.flow.yml

# import one from a file or an http(s) URL
vibe flows import ./spike-and-decide.flow.yml
vibe flows import https://example.com/flows/spike-and-decide.flow.yml
```

Imports are checked against the schema, and refused if they carry the shape of a secret token or any disallowed control characters. Fetches from a URL are bounded in size and time. If a Flow with the same id already exists in the project, it is replaced only when you pass `--overwrite`.

The dashboard Flows page has the same controls (Export, Import, New flow). The HTTP endpoints behind them (`/api/v1/flows/:id/export`, `POST /api/v1/flows/import`, `POST /api/v1/flows`) are documented under [HTTP API](/docs/architecture/http-api).

## Going deeper

- [Flow (concept)](/docs/concepts/flow) - what a Flow is and when to write one.
- [Built-in Flows reference](/docs/reference/flows) - every shipped Flow, step by step.
- [HTTP API](/docs/architecture/http-api) - the endpoints behind the dashboard's Flows controls.
