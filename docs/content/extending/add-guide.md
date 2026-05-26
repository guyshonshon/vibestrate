---
title: Add a Guide
description: Define a custom run recipe with slots, steps, and optional approval gates.
section: extending
slug: extending/add-guide
---

A Guide is YAML. Drop it under `.amaco/guides/<id>/guide.yml` and Amaco's discovery picks it up. The schema is validated on load — malformed Guides fail loud at start, not silently mid-run.

## Steps

1. Create the directory: `.amaco/guides/spike-and-decide/`.
2. Add `guide.yml`:

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
   amaco guides list
   amaco guides show spike-and-decide
   ```

4. Run with it:

   ```bash
   amaco run "Prototype the new search ranking" --guide spike-and-decide
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
amaco run "..." --guide spike-and-decide --guide-slot prototyper=claude
```

That binds the `prototyper` slot to the `claude` provider for that run.

## Optional steps

Set `optional: true` on a step to let users skip it per run:

```bash
amaco run "..." --guide spike-and-decide --guide-skip plan
```

## Common mistakes

- **Same slot in builder *and* challenger.** They'll agree with themselves. Two slots, two different defaults.
- **Skipping validation.** Without a `validation` step, your Guide has no ground truth.
- **Over-stuffing one Guide.** Twelve steps is too many. If a Guide grew long, split it.

## Related

- [Guide (concept)](/docs/concepts/guide).
- [Built-in Guides reference](/docs/reference/guides).
