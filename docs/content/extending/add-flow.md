---
title: Add a Flow
description: Define a custom run recipe with seats, steps, and optional approval gates.
section: extending
slug: extending/add-flow
---

A Flow is YAML. Drop it under `.vibestrate/flows/<id>/flow.yml` and Vibestrate's discovery picks it up. The schema is validated on load - malformed Flows fail loud at start, not silently mid-run.

## Steps

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

3. Verify:

   ```bash
   vibe flows list
   vibe flows show spike-and-decide
   ```

4. Run with it:

   ```bash
   vibe run "Prototype the new search ranking" --flow spike-and-decide
   ```

## Step kinds

| Kind | When to use |
|---|---|
| `agent-turn` | One agent does a primary action (plan, implement). |
| `review-turn` | A *different* seat reviews the artifact from a prior step. |
| `response-turn` | The original seat responds to findings. |
| `validation` | Run the project's `commands.validate`. |
| `approval-gate` | Halt the run; human decides whether to continue. |
| `summary-turn` | An arbiter writes a final summary. |

## Seats vs roles

A *Seat* is what a step needs filled - `planner`, `builder`, `challenger`, `prototyper`. The Flow only names Seats; it never names your local Roles or Providers, which is what keeps it shareable. At run start Vibestrate matches each Seat to a Role in your **Crew** - a Role declares the Seats it `fills`. If a step needs the same Role behavior but a stronger runtime, override its **Profile** for that one step:

```bash
vibe run "..." --flow spike-and-decide --step-profile prototype=opus-deep
```

That runs the `prototype` step on the `opus-deep` Profile without changing the Role's behavior. To pick *which* Role fills a Seat for a run, use `--seat-role prototyper=<roleId>`.

## Optional steps

Set `optional: true` on a step to let users skip it per run:

```bash
vibe run "..." --flow spike-and-decide --flow-skip plan
```

## Common mistakes

- **One Role filling both builder *and* challenger.** It'll agree with itself. Use two Seats filled by two different Roles.
- **Skipping validation.** Without a `validation` step, your Flow has no ground truth.
- **Over-stuffing one Flow.** Twelve steps is too many. If a Flow grew long, split it.

## Share a Flow (import / export)

Flows are portable: they name **Seats**, not your local Roles or Providers, so
one project's Flow drops into another and resolves against that project's Crew.

```bash
# export a Flow to a file you can commit or send
vibe flows export spike-and-decide --out spike-and-decide.flow.yml

# import one from a file or an http(s) URL
vibe flows import ./spike-and-decide.flow.yml
vibe flows import https://example.com/flows/spike-and-decide.flow.yml
```

Imports are schema-validated and **refused if they carry a secret token shape**
or disallowed control characters; URL fetches are size- and time-bounded. An
existing project Flow with the same id is only replaced with `--overwrite`.

The dashboard **Flows** page has the same controls (**Export**, **Import**,
**New flow**), and the underlying HTTP endpoints
(`/api/v1/flows/:id/export`, `POST /api/v1/flows/import`, `POST /api/v1/flows`)
are documented under [HTTP API](/docs/architecture/http-api).

## Related

- [Flow (concept)](/docs/concepts/flow).
- [Built-in Flows reference](/docs/reference/flows).
- [HTTP API](/docs/architecture/http-api).
