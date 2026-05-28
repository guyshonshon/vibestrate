---
title: Add a Flow
description: Define a custom run recipe with slots, steps, and optional approval gates.
section: extending
slug: extending/add-flow
---

A Flow is YAML. Drop it under `.vibestrate/flows/<id>/flow.yml` and Vibestrate's discovery picks it up. The schema is validated on load — malformed Flows fail loud at start, not silently mid-run.

## Steps

1. Create the directory: `.vibestrate/flows/spike-and-decide/`.
2. Add `flow.yml`:

   ```yaml
   id: spike-and-decide
   version: 1
   label: Spike and decide
   description: Quick prototype with a built-in stop-and-check gate.

   slots:
     prototyper:
       label: Prototyper
       description: Implements the spike.
       defaultAgent: executor

   steps:
     - id: plan
       label: Plan the spike
       kind: agent-turn
       slot: prototyper
       agentId: planner
       inputs: [task-brief]
       outputs: [plan]

     - id: prototype
       label: Build the prototype
       kind: agent-turn
       slot: prototyper
       agentId: executor
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
| `review-turn` | A *different* slot reviews the artifact from a prior step. |
| `response-turn` | The original slot responds to findings. |
| `validation` | Run the project's `commands.validate`. |
| `approval-gate` | Halt the run; human decides whether to continue. |
| `summary-turn` | An arbiter writes a final summary. |

## Slot vs agent

A *slot* is a named participant — `builder`, `challenger`, `arbiter`, `prototyper`. The slot has a `defaultAgent` (a role name like `executor` or `reviewer`), and at run start the user can override which provider each slot uses.

```bash
vibe run "..." --flow spike-and-decide --flow-slot prototyper=claude
```

That binds the `prototyper` slot to the `claude` provider for that run.

## Optional steps

Set `optional: true` on a step to let users skip it per run:

```bash
vibe run "..." --flow spike-and-decide --flow-skip plan
```

## Common mistakes

- **Same slot in builder *and* challenger.** They'll agree with themselves. Two slots, two different defaults.
- **Skipping validation.** Without a `validation` step, your Flow has no ground truth.
- **Over-stuffing one Flow.** Twelve steps is too many. If a Flow grew long, split it.

## Related

- [Flow (concept)](/docs/concepts/flow).
- [Built-in Flows reference](/docs/reference/flows).
