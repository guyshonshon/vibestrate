---
title: Workflow
description: The eight steps of the default flow, in order, and what each one is for.
slug: concepts/workflow
---

## In simple words

A **workflow** is the ordered set of steps one [[run]] works through, from submitted to a verdict. Every run executes a [[flow]], so a run's workflow is the steps of whichever flow it is running.

This page is the canonical description of the built-in `default` flow:

```
plan -> architecture -> implement -> validate -> review -> verify
                                        ^          |
                                        +-- fix <--+   (only on CHANGES_REQUESTED)
```

Eight steps. Six always run; **fix** and **re-validate** are loop-only - they run when review returns `CHANGES_REQUESTED`, and not otherwise.

<div class="docs-callout tip">

**Tip.** The loop is the part worth understanding. A review that asks for changes does not end the run and does not start it over: it sends the work to fix with the finding attached, then re-validates, then reviews again. That is why a run can pass on its second attempt without you doing anything.

</div>

## Why the steps split this way

<div class="docs-cards">

**Plan before architecture**
What to do, then how it fits the codebase. Conflating them produces plans that ignore the existing shape.

**Validate before review**
Your tests are cheaper than a model's attention. A change that fails them does not deserve a careful read yet.

**Review before verify**
Review judges the diff; verify decides merge-readiness from the whole record.

**Fix rather than restart**
The fixer gets the finding. Starting over would discard everything that was already right.

</div>

<div class="docs-callout">

**Did you know?** Validation is the tie-breaker. When a reviewer's opinion and your test suite disagree, the test suite is the one that is not guessing - it actually ran your code. That is why `validate` sits between implement and review rather than after it.

</div>


## Going deeper

### What each step does

| Step | Run status | Seat | Output |
|---|---|---|---|
| plan | `planning` | planner | a plan for the change |
| architecture | `architecting` | architect | approach, implementer boundaries, risks |
| implement | `executing` | implementer | file edits in the worktree |
| validate | `validating` | none | your `commands.validate` output |
| review | `reviewing` | reviewer | findings, and `APPROVED` / `CHANGES_REQUESTED` / `BLOCKED` |
| fix | `fixing` | fixer | answers to the findings, and an updated diff |
| re-validate | `validating` | none | your `commands.validate` output |
| verify | `verifying` | verifier | `PASSED` / `FAILED` / `NEEDS_HUMAN` |

Eight steps, seven statuses: `validating` happens twice.

The [state machine](/docs/concepts/state) is the rail underneath. A run cannot jump from `planning` to `merge_ready` without passing through the steps in between.

### What the architect adds

The architect reads the plan and decides the approach: what fits the existing codebase, what the implementer may and may not touch, and which risks are worth calling out. It runs read-only in the crew `vibe init` writes.

It can also stop the run. If the architect emits `HUMAN_APPROVAL: REQUIRED`, the run moves to `waiting_for_approval` before any code is written, and waits for your decision.

### Validation is the tie-breaker

**validate** runs your project's `commands.validate` array (typecheck, tests, build, lint) and routes the result. That is why it has no seat: validation is the ground truth that settles a disagreement between the implementer's claim ("I wrote it") and the reviewer's doubt ("I don't think it works").

`vibe init` fills `commands.validate` from the scripts it finds in your project, so on a typical Node project it is already set. If it found none, the workflow is a model-judgement loop with no facts underneath it. One `pnpm typecheck` entry catches a large class of regressions.

### The review loop

`review` is the decision step. Anything other than `CHANGES_REQUESTED` exits the loop immediately and goes to `verify`. `CHANGES_REQUESTED` runs `fix` and `re-validate`, then reviews again.

`workflow.maxReviewLoops` is an optional global ceiling: set it and no flow's loop budget goes above that number. It is unset by default, so each flow keeps its own budget. A per-crew `maxReviewLoops` overrides both.

### One runner, many recipes

There is only one execution model. A [Flow](/docs/concepts/flow) is a different recipe with different seats, step order, optional approval gates, or looping steps. The built-in `quality-arbitration` flow, for example, adds a builder, a challenger, and an arbiter for higher-risk feature work.

They all share the same runner:

```bash
vibe run "..."                  # Vibestrate picks
vibe run "..." --flow default   # the eight steps
vibe run "..." --flow quality-arbitration
```

### Fast tracks

Not every task deserves the full eight-step line. For small, low-risk work the built-in **`express`** flow runs one implementer turn behind two gates that only fire when the change demands it: a pure-prose, unprotected diff skips both review and verification and goes straight to merge-ready, while anything touching code or a protected path gets a real review turn *and* a real verify turn.

That asymmetry is deliberate. Whatever routes a task to `express` is reading the task description, and a description can be wrong about what a change turns out to touch. The diff cannot. So the decision to skip a gate is never made from the task text - it is made from the files the run actually changed, after it changed them.

```bash
vibe run "fix the typo in the seat concept page" \
  --flow express
```

To pick a flow up partway through, resume from an earlier run. The runner seeds the earlier steps' outputs from that run and starts at the stage you name.

```bash
# accepted stages: planning architecting
#   executing reviewing fixing verifying
# default: executing
vibe run "..." --resume-from bold-lovelace \
  --resume-stage reviewing
```

### How the crew stays on the same page

Each step hands its work to the next, and Vibestrate keeps that through-line tidy two ways.

A compact **run brief** is the story so far: the chosen flow and why, each step's outcome and decision, validation status, changed files, and open risks. There is no model call - it is assembled from facts the orchestrator already has, and the oldest entries fold to one line when it gets long. It goes into **every** role's prompt so the crew builds on each other without re-reading the full history, and it is written to `flows/run-brief.md` so you can read it too.

**Handoff contracts** are the more precise version: a step passes its output as named JSON instead of free-form prose, so the next role, the run brief, and the dashboard can read specific fields rather than scraping text. They are **opt-in by output token** - a step only emits one when it declares the matching token, and a mismatch never fails the run (it keeps the raw text and records a parse event). The review side has `findings`, `finding-responses`, `finding-resolutions`, and `decision-summary`; the builder side has `plan-handoff`, `architecture-handoff`, and `execution-handoff`. The built-in `panel-review` flow is the first to use the builder-side contracts; the default flow stays free-form, so nothing changes for it.

### Context on long runs

Each turn's context is rebuilt from the artifacts (the run brief plus the named prior outputs), so there is no single ever-growing chat to carry along.

When a provider supports session reuse (for example `claude --resume`), Vibestrate reuses the session across a role's turns for speed and cost, sending just what changed instead of replaying everything. To keep even a reused session from ballooning on a marathon run, `session.maxReuseTurns` caps how many turns a session lives before Vibestrate opens a fresh one and re-grounds it from the artifacts (`0` means unlimited). That re-grounding is lossless, and the provider's own auto-compaction stays the safety net.

Reuse is keyed on the **[Seat](/docs/concepts/seat)**, never on which model a step runs. That distinction matters: a writer and a reviewer can run the same model at the same effort, yet they are different seats, so the reviewer starts a **fresh** process and never inherits the writer's session. Independent context is the whole point of a review - a reviewer that resumed the writer's session would just rubber-stamp its own reasoning. Continuity follows the seat doing the work, not a coincidence of matching profiles.

### When a step fails

A model turn only counts as success if its provider exits cleanly **and** returns usable output. A non-zero provider exit or an empty response is a real failure, named honestly rather than passed downstream as an empty result. In a graph flow, a step with `retries: N` is re-tried first, and a `continueOnError` step records the failure and continues with reduced coverage (which the [run assurance](/docs/concepts/safety) verdict then reflects). Control signals - a user abort, an approval rejection, the spend cap - always stop the run and are never retried.

### Common mistakes

- **Skipping validation.** A workflow without real validation is a workflow without ground truth.
- **Setting `maxReviewLoops` too high.** Three to five passes is usually enough. Past that, the run is probably stuck and should `block` to call you over.
- **Adding steps by editing the workflow array.** Prefer a custom Flow. That is the supported extension point.

### Going deeper

- [Run state](/docs/concepts/state) - the statuses each step entry and exit produces.
- [Flow](/docs/concepts/flow) - alternate recipes, and how a Flow gets chosen.
- [Workflow reference](/docs/reference/workflow) - the canonical, generated stage list.
- [Task lifecycle](/docs/task-lifecycle) - the same path with the full status diagram.
