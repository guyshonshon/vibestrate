---
title: Workflow
description: The ordered sequence of stages a run moves through - plan, architect, execute, validate, review, fix, verify.
section: concepts
slug: concepts/workflow
---

A workflow is the ordered set of stages a single task moves through, from "submitted" to "ready to merge". Each stage knows the status it starts in, the status it finishes in, and (for the stages where a model does the work) which kind of worker is responsible.

Think of it like an assembly line. A part can't skip ahead to the end of the line and call itself finished. Vibestrate's [state machine](/docs/concepts/state) is the rail that keeps each run moving station by station, so a run can't jump from "planning" straight to "merge_ready" without doing the work in between. The orchestrator is what moves the part down the line.

## The default workflow

When you run a task without picking a different flow, you get the built-in **`default` flow**. It runs through seven stages, with a small loop in the middle that fixes problems and re-checks:

```text
planning → architecting → executing → validating → reviewing → verifying
                                          ↑           ↓
                                          └─ fixing ──┘
```

Here is what each stage does and who does it:

| Stage | Agent | Output |
|---|---|---|
| planning | planner | structured plan |
| architecting | architect | module map, interfaces, data flow |
| executing | executor | file edits in the worktree |
| validating | - (commands) | typecheck / test / build / lint output |
| reviewing | reviewer | findings + APPROVED / CHANGES_REQUESTED / BLOCKED |
| fixing | fixer | patched diff + finding responses |
| verifying | verifier | PASSED / FAILED / NEEDS_HUMAN + decision summary |

Read end to end, the common spine of a run looks like this:

<div class="docs-flow">
<div><b>Plan</b><span>The planner turns the task into a structured plan.</span></div>
<div><b>Architect</b><span>The architect maps modules, interfaces, and data flow.</span></div>
<div><b>Execute</b><span>The executor writes the file edits in the worktree.</span></div>
<div><b>Validate</b><span>Your commands run: typecheck, test, build, lint.</span></div>
<div><b>Review</b><span>The reviewer reads the change cold and gives a verdict.</span></div>
<div><b>Fix</b><span>The fixer patches findings, then review re-checks.</span></div>
<div><b>Verify</b><span>The verifier signs off or calls a human.</span></div>
</div>

The fix loop is bounded by the flow's own loop budget (the built-in flows allow 3 rounds). You can set `workflow.maxReviewLoops` as an optional **global ceiling** that lowers every flow to at most that many rounds - omitted by default, so each flow keeps its own budget. If review keeps requesting changes past the budget, the run goes to `blocked` and calls you over.

## Validation is the tie-breaker

Notice that **validating** has no agent. It runs your project's `commands.validate` array (typecheck, tests, build, lint) and routes the result. That is on purpose: validation is the ground truth that settles a disagreement between the executor's claim ("I wrote it") and the reviewer's doubt ("I don't think it works").

If your `commands.validate` is empty, the workflow becomes a pure model-judgement loop with no facts underneath it. We strongly recommend filling it in. Even a single `pnpm typecheck` catches a huge class of regressions for free.

## One runner, many recipes

There is only one execution model. Every run executes a **flow** through one runner. The default workflow above is the built-in `default` flow. A [Flow](/docs/concepts/flow) is just a different recipe with different roles, step order, optional approval gates, or looping steps. For example, the built-in `quality-arbitration` flow adds a builder, challenger, and arbiter crew for higher-risk feature work.

They all share the same runner:

```bash
vibe run "..."                  # the built-in default flow
vibe run "..." --flow default   # the same flow, explicit
vibe run "..." --flow quality-arbitration
```

To pick up a flow partway through, `vibe run --resume-from <runId> --resume-stage <stage>` rewinds any flow that declares the matching stage. The runner seeds the earlier steps' outputs from the source run and starts from there.

## How the crew stays on the same page

Each stage hands its work to the next, and Vibestrate keeps that through-line tidy two ways.

A compact **run brief** is the story so far: the chosen flow and why, each step's outcome and decision, validation status, changed files, and open risks. There is no model call - it is assembled from facts the orchestrator already has, and the oldest entries fold to one line when it gets long. It goes into **every** role's prompt so the crew builds on each other without re-reading the full history, and it is written to `flows/run-brief.md` so you can read it too.

**Handoff contracts** are the more precise version: a step passes its output as named JSON instead of free-form prose, so the next role, the run brief, and the dashboard can read specific fields rather than scraping text. They are **opt-in by output token** - a step only emits one when it declares the matching token, and a mismatch never fails the run (it keeps the raw text and records a parse event). The review side has `findings`, `finding-responses`, `finding-resolutions`, and `decision-summary`; the builder side has `plan-handoff`, `architecture-handoff`, and `execution-handoff`. The built-in `panel-review` flow is the first to use the builder-side contracts; the default flow stays free-form, so nothing changes for it.

## Context on long runs

<div class="docs-callout">

**The prompt does not balloon.** A run can take many turns, but each turn's context is rebuilt fresh, not carried as one ever-growing chat.

</div>

Each turn's context is rebuilt from the artifacts (the run brief plus the named prior outputs), so there is no single ever-growing chat to carry along.

When a provider supports session reuse (for example `claude --resume`), Vibestrate reuses the session across a role's turns for speed and cost, sending just what changed instead of replaying everything. To keep even a reused session from ballooning on a marathon run, `session.maxReuseTurns` caps how many turns a session lives before Vibestrate opens a fresh one and re-grounds it from the artifacts (`0` means unlimited). That re-grounding is lossless, and the provider's own auto-compaction stays the safety net.

## When a step fails

A model turn only counts as success if its provider exits cleanly **and** returns usable output. A non-zero provider exit or an empty response is a real failure, named honestly rather than passed downstream as an empty result. In a graph flow, a step with `retries: N` is re-tried first, and a `continueOnError` step records the failure and continues with reduced coverage (which the [run assurance](/docs/concepts/safety) verdict then reflects). Control signals - a user abort, an approval rejection, the spend cap - always stop the run and are never retried.

## Common mistakes

- **Skipping validation.** A workflow without real validation is a workflow without ground truth.
- **Setting `maxReviewLoops` too high.** Three to five rounds is usually enough. Past that, the run is probably stuck and should `block` to call you over.
- **Adding stages by editing the workflow array.** For now, prefer a custom Flow. That is the supported extension point.

## Going deeper

- [Run state](/docs/concepts/state) - the statuses each stage entry and exit produces.
- [Flow](/docs/concepts/flow) - alternate recipes and how the crew fills a flow's steps.
- [Workflow reference](/docs/reference/workflow) - the canonical, generated stage list.
- [Task lifecycle](/docs/task-lifecycle) - the same flow with the full status diagram.
