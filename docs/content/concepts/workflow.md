---
title: Workflow
description: The ordered sequence of stages a run moves through — plan, architect, execute, validate, review, fix, verify.
section: concepts
slug: concepts/workflow
---

**Professional explanation.** A workflow is the static, ordered description of stages a run progresses through. Each stage names an entering status, an exiting status, and (for stages that invoke a model) the agent role responsible. The orchestrator drives transitions; the state machine enforces which moves are legal.

**Simple explanation.** A workflow is the recipe for how a task moves from "submitted" to "ready to merge."

## Why it matters

The workflow is the spine of Amaco. Without it, a "multi-agent" run would just be a chat in a loop. With it, you get a deterministic, inspectable path with clear handoffs and a known finish line.

## The default workflow

```text
planning → architecting → executing → validating → reviewing → verifying
                                          ↑           ↓
                                          └─ fixing ──┘
```

| Stage | Agent | Output |
|---|---|---|
| planning | planner | structured plan |
| architecting | architect | module map, interfaces, data flow |
| executing | executor | file edits in the worktree |
| validating | — (commands) | typecheck / test / build / lint output |
| reviewing | reviewer | findings + APPROVED / CHANGES_REQUESTED / BLOCKED |
| fixing | fixer | patched diff + finding responses |
| verifying | verifier | PASSED / FAILED / NEEDS_HUMAN + decision summary |

The fix loop is bounded by `workflow.maxReviewLoops` (default `2`). If review keeps requesting changes past the budget, the run goes to `blocked`.

The canonical, generated stage list lives in the [workflow reference](/docs/reference/workflow).

## Validation is its own stage

Notice that **validating** has no agent. It runs your project's `commands.validate` array (typecheck, tests, build, lint) and routes the result. This is deliberate: validation is the ground truth that breaks ties between the executor's assertion ("I wrote it") and the reviewer's critique ("I don't think it works").

If your `commands.validate` is empty, the workflow degenerates into a pure model-judgement loop. We strongly recommend filling it in — even a single `pnpm typecheck` catches a huge class of regressions for free.

## Flows are alternate workflows

The default workflow is one path through the orchestrator. A [Flow](/docs/concepts/flow) is a richer recipe — different agent slots, different step order, optional approval gates, optional repeated steps. The built-in `quality-arbitration` Flow uses a builder + challenger + arbiter crew, designed for higher-risk feature work.

## Common mistakes

- **Skipping validation.** A workflow without real validation is a workflow without ground truth.
- **Setting `maxReviewLoops` too high.** Three to five rounds is usually enough; past that, the run is probably stuck and should `block` to call you over.
- **Adding stages by editing the workflow array.** For now, prefer a custom Flow — they're the supported extension point.

## Related

- [Run state](/docs/concepts/state) — the statuses each stage entry and exit produces.
- [Flow](/docs/concepts/flow) — alternate workflows.
- [Task lifecycle](/docs/task-lifecycle) — the same flow with the full status diagram.
