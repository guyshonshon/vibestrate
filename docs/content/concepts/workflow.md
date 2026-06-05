---
title: Workflow
description: The ordered sequence of stages a run moves through - plan, architect, execute, validate, review, fix, verify.
section: concepts
slug: concepts/workflow
---

A workflow is the recipe for how a Task moves from "submitted" to "ready to
merge" - the ordered list of stages a run passes through. Each stage names the
status it enters at, the status it exits to, and (for the stages that call a
model) the agent role responsible for it.

The orchestrator drives the transitions; the [state machine](/docs/concepts/state)
enforces which moves are even legal, so a run can't jump from "planning" straight
to "merge_ready" without doing the work in between.

## Why it matters

The workflow is the spine of Vibestrate. Without it, a "multi-agent" run would just be a chat in a loop. With it, you get a deterministic, inspectable path with clear handoffs and a known finish line.

## The default workflow

This is the built-in **`default` flow** - the workflow that runs when you don't
pick another flow. It's a real flow definition executed by the one flow runner
(see [Flow](/docs/concepts/flow)), not a separate code path.

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
| validating | - (commands) | typecheck / test / build / lint output |
| reviewing | reviewer | findings + APPROVED / CHANGES_REQUESTED / BLOCKED |
| fixing | fixer | patched diff + finding responses |
| verifying | verifier | PASSED / FAILED / NEEDS_HUMAN + decision summary |

The fix loop is bounded by `workflow.maxReviewLoops` (default `2`). If review keeps requesting changes past the budget, the run goes to `blocked`.

The canonical, generated stage list lives in the [workflow reference](/docs/reference/workflow).

## Validation is its own stage

Notice that **validating** has no agent. It runs your project's `commands.validate` array (typecheck, tests, build, lint) and routes the result. This is deliberate: validation is the ground truth that breaks ties between the executor's assertion ("I wrote it") and the reviewer's critique ("I don't think it works").

If your `commands.validate` is empty, the workflow degenerates into a pure model-judgement loop. We strongly recommend filling it in - even a single `pnpm typecheck` catches a huge class of regressions for free.

## One runner; flows are the recipes

There is a single execution model: every run executes a **flow** through the one
runner. The default workflow above is the built-in `default` flow; a
[Flow](/docs/concepts/flow) is just a different recipe - different slots, step
order, optional approval gates, repeated/looping steps. The built-in
`quality-arbitration` flow uses a builder + challenger + arbiter crew for
higher-risk feature work.

These all share the same runner:

```bash
vibe run "..."                  # the built-in default flow
vibe run "..." --flow default   # the same flow, explicit
vibe run "..." --flow quality-arbitration
```

`vibe run --resume-from <runId> --resume-stage <stage>` rewinds any flow that
declares the matching stage: the runner seeds the upstream steps' outputs from
the source run and starts there.

## The run brief (the story so far)

As a workflow runs, the orchestrator keeps a compact **run brief** - a
deterministic, budget-bounded through-line of what's happened so far: the chosen
flow and why, each step's outcome and decision, validation status, changed files,
and open risks. It's injected into **every** role's prompt (as a "Run brief"
section, after the prior artifacts), so the crew builds on each other without
re-reading the full history - and it's written to `flows/run-brief.md` on the run
so you can read it too. No model call: it's assembled from facts the orchestrator
already has, and the oldest entries fold to one line when it gets long.

## Structured handoffs

The run brief is a *summary*; the **handoff contracts** are the *packet*. A step
hands its output to the next as named JSON instead of free-form prose, so the
through-line is machine-checkable - the next role, the run brief, and the
dashboard can read specific fields (a plan's open questions, an execution's
per-step coverage, a reviewer's severities) rather than scraping text.

Two families exist, both **opt-in by output token** - a step only produces a
contract when it declares the matching token:

- **Review side** (already used by the quality flows): `findings`,
  `finding-responses`, `finding-resolutions`, `decision-summary`.
- **Builder side**: `plan-handoff`, `architecture-handoff`, `execution-handoff` -
  a structured plan (ordered steps, files, assumptions, open questions, risks),
  a design (decisions with rationale, components, interfaces), and an execution
  report (per-step status mapped back to the plan, files changed, follow-ups).

Adoption is never fail-hard: if a provider emits JSON that doesn't match the
contract, the run keeps the raw text output and records a parse event, then
continues. The built-in **panel-review** flow is the first to adopt the
builder-side contracts; the default flow keeps free-form plan/architecture/
execution, so nothing changes for it.

## When a turn fails

A model turn only counts as success if its provider exits cleanly **and** returns
usable output. A non-zero provider exit (an invocation failure) or an empty
response is treated as a real failure, not silently passed downstream as an empty
result - the run **fails honestly** with the failing step named. In a graph flow,
two opt-in policies soften this: a step with `retries: N` is re-tried before its
outcome is final, and a `continueOnError` (best-effort) step records the failure
and lets the run continue with reduced coverage (which the
[run assurance](/docs/concepts/safety) verdict then reflects). Control signals (a
user abort, an approval rejection, the spend cap) always stop the run and are
never retried.

## Common mistakes

- **Skipping validation.** A workflow without real validation is a workflow without ground truth.
- **Setting `maxReviewLoops` too high.** Three to five rounds is usually enough; past that, the run is probably stuck and should `block` to call you over.
- **Adding stages by editing the workflow array.** For now, prefer a custom Flow - they're the supported extension point.

## Related

- [Run state](/docs/concepts/state) - the statuses each stage entry and exit produces.
- [Flow](/docs/concepts/flow) - alternate workflows.
- [Task lifecycle](/docs/task-lifecycle) - the same flow with the full status diagram.
