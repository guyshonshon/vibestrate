---
title: Steps - the workflow of a run
description: The eight steps of the default flow, in order, and what each one is for.
slug: concepts/workflow
---

## In simple words

A **workflow** is the ordered set of steps one [[run]] works through, from submitted to a verdict. Every run executes a [[flow]], so its workflow is that flow's steps.

This page is the canonical description of the built-in `default` flow:

```
plan -> architecture -> implement -> validate -> review -> verify
                                        ^          |
                                        +-- fix <--+   (only on CHANGES_REQUESTED)
```

Eight steps. Six always run; **fix** and **re-validate** are loop-only, firing when review returns `CHANGES_REQUESTED`.

`vibe ui` opens the dashboard on `127.0.0.1:4317`; a live run sits at the top of the sidebar, and **Runs** lists the rest under Active, Merge-ready and Failed. A run's page has seven tabs: **Steps** lists each step's state, **Tree** draws it as a node tree, **Events** is the raw stream, **Artifacts** holds every prompt and output, **Validation** carries the command results the loop turns on, **Terminal** shows the live process, and **Replay** walks a finished run event by event.

<div class="docs-callout tip">

**Tip.** A review that asks for changes does not end the run and does not start it over: it sends the work to fix with the finding attached, then re-validates, then reviews again. That is why a run can pass on its second attempt without you doing anything.

</div>

<div class="docs-callout">

**Did you know?** Validation is the tie-breaker. When a reviewer's opinion and your test suite disagree, the test suite is the one that is not guessing: it actually ran your code. That is why `validate` sits between implement and review rather than after it.

</div>

## What each step does

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

Eight steps, seven statuses: `validating` happens twice. The [state machine](/docs/concepts/state) is the rail underneath, so a run cannot jump from `planning` to `merge_ready`. The fields each step is written from are annotated in [Flow YAML](/docs/reference/flow-yml).

<svg viewBox="0 0 560 180" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The default flow runs plan, architecture, implement and validate in order, then review. Review approved goes straight to verify; changes requested goes to fix, then re-validate, and back to review at most three times.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="143.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="286.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="429.5" y="6.5" width="131" height="34" rx="8"/>
    <rect x="143.5" y="138.5" width="131" height="34" rx="8"/>
    <rect x="286.5" y="138.5" width="131" height="34" rx="8"/>
    <rect x="429.5" y="70.5" width="131" height="34" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="70.5" width="131" height="34" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M135 23 L139 23"/>
    <path d="M278 23 L282 23"/>
    <path d="M421 23 L425 23"/>
    <path d="M494 40 L494 54 L66 54 L66 70"/>
    <path d="M66 104 L66 122 L209 122 L209 138"/>
    <path d="M274 155 L282 155"/>
    <path d="M417 155 L446 155 L446 122 L131 122 L131 104"/>
    <path d="M131 87 L425 87"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="133,19.5 139,23 133,26.5"/>
    <polygon points="276,19.5 282,23 276,26.5"/>
    <polygon points="419,19.5 425,23 419,26.5"/>
    <polygon points="62.5,64 66,70 69.5,64"/>
    <polygon points="205.5,132 209,138 212.5,132"/>
    <polygon points="276,151.5 282,155 276,158.5"/>
    <polygon points="127.5,110 131,104 134.5,110"/>
    <polygon points="419,83.5 425,87 419,90.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="65.5" y="27">Plan</text>
    <text x="208.5" y="27">Architecture</text>
    <text x="351.5" y="27">Implement</text>
    <text x="494.5" y="27">Validate</text>
    <text x="65.5" y="91">Review</text>
    <text x="208.5" y="159">Fix</text>
    <text x="351.5" y="159">Re-validate</text>
    <text x="494.5" y="91">Verify</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="137" y="118" text-anchor="start">changes requested</text>
    <text x="452" y="151" text-anchor="start">at most 3</text>
    <text x="278" y="80" text-anchor="middle">review approved</text>
  </g>
</svg>

The one cycle in the default flow, and its bound. Review either approves straight through to verify, or sends the work to fix and re-validate and looks again, at most three times.

## Why the steps split this way

<div class="docs-cards">

**Plan before architecture**
What to do, then how it fits. Conflating them produces plans that ignore the existing shape.

**Validate before review**
Your tests are cheaper than a model's attention.

**Review before verify**
Review judges the diff; verify decides merge-readiness from the whole record.

**Fix rather than restart**
Starting over would discard everything that was already right.

</div>

## What the architect adds

The architect reads the plan and decides the approach against the existing codebase. It runs read-only in the crew `vibe init` writes.

It can also stop the run. If the architect emits `HUMAN_APPROVAL: REQUIRED`, the run moves to `waiting_for_approval` before any code is written, and waits for your decision.

## Validation is the ground truth

**validate** runs your project's `commands.validate` array (typecheck, tests, build, lint) and routes the result. It has no seat because it settles the disagreement rather than joining it.

`vibe init` fills `commands.validate` from the scripts it finds, so on a typical Node project it is already set. If it found none, the workflow is a model-judgement loop with no facts underneath it. One `pnpm typecheck` entry catches a large class of regressions.

## The review loop

`review` is the decision step. Anything other than `CHANGES_REQUESTED` exits the loop immediately and goes to `verify`. `CHANGES_REQUESTED` runs `fix` and `re-validate`, then reviews again.

`workflow.maxReviewLoops` is an optional global ceiling: set it and no flow's loop budget goes above that number. Unset by default, so each flow keeps its own budget. A per-crew `maxReviewLoops` takes precedence over both.

## One runner, many recipes

A [Flow](/docs/concepts/flow) is a different recipe with different seats, step order, optional approval gates, or looping steps. The built-in `quality-arbitration` flow, for example, adds a builder, a challenger who reviews the plan and then the diff, and an arbiter who writes the decision summary. All on the same runner:

```bash
vibe run "..."                  # Vibestrate picks
vibe run "..." --flow default   # the eight steps
vibe run "..." --flow quality-arbitration
```

## Fast tracks

For small, low-risk work the built-in **`express`** flow runs one implementer turn behind two conditional gates: a pure-prose, unprotected diff skips both review and verification and goes straight to merge-ready, while anything touching code or a protected path gets a real review turn *and* a real verify turn.

Whatever routes a task to `express` reads the task description, and a description can be wrong about what a change turns out to touch. The diff cannot. So the decision to skip a gate comes from the files the run actually changed, never from the task text.

To pick a flow up partway through, resume from an earlier run: the runner seeds the earlier steps' outputs and starts at the stage you name.

```bash
vibe run "fix the typo in the seat page" --flow express

# accepted stages: planning architecting
#   executing reviewing fixing verifying
# default: executing
vibe run "..." --resume-from bold-lovelace \
  --resume-stage reviewing
```

## How the crew shares one thread

A compact **run brief** is the story so far: the chosen flow and why, each step's outcome and decision, validation status, changed files, and open risks. There is no model call; it is assembled from facts the orchestrator already has, and the oldest entries fold to one line when it gets long. It goes into **every** role's prompt, and is written to `flows/run-brief.md`.

**Handoff contracts** are the more precise version: a step passes its output as named JSON instead of free-form prose, so the next role, the run brief and the dashboard read named fields instead of scraping text. They are **opt-in by output token**, so a step only emits one when it declares the matching token, and a mismatch never fails the run (it keeps the raw text and records a parse event). The review side has `findings`, `finding-responses`, `finding-resolutions` and `decision-summary`; the builder side has `plan-handoff`, `architecture-handoff` and `execution-handoff`. The built-in `panel-review` flow is the first to use the builder-side contracts; the default flow stays free-form.

## Context on long runs

Each turn's context is rebuilt from the artifacts (the run brief plus the named prior outputs), so there is no ever-growing chat to carry along.

Where a provider supports session reuse (for example `claude --resume`), Vibestrate reuses the session across a role's turns, sending only what changed. `session.maxReuseTurns` caps how many turns a session lives before Vibestrate opens a fresh one and re-grounds it from the artifacts (`0` is unlimited). That re-grounding is lossless, and the provider's own auto-compaction stays the safety net.

Reuse is keyed on the **[Seat](/docs/concepts/seat)**, never on which model a step runs. A writer and a reviewer can run the same model at the same effort and still be different seats, so the reviewer starts a **fresh** process and never inherits the writer's session. A reviewer that resumed it would rubber-stamp its own reasoning.

## When a step fails

A model turn only counts as success if its provider exits cleanly **and** returns usable output. A non-zero exit or an empty response is a real failure, named rather than passed downstream as an empty result. In a graph flow, a step with `retries: N` is re-tried first, and a `continueOnError` step records the failure and continues with reduced coverage, which the [run assurance](/docs/concepts/safety) verdict then reflects. Control signals (a user abort, an approval rejection, the spend cap) always stop the run and are never retried.

## Common mistakes

- **Skipping validation.** The loop then has no ground truth underneath it.
- **Setting `maxReviewLoops` too high.** Three to five passes is usually enough. Past that, the run is probably stuck and should `block` to call you over.
- **Adding steps by editing the workflow array.** A custom Flow is the supported extension point.

## What a step carries

| Field | What it is |
|---|---|
| `id`, `label` | Its handle, and its display name. |
| `kind` | How it runs: `agent-turn`, `review-turn`, `response-turn`, `validation`, `summary-turn`, `approval-gate`. |
| `seat` | The seat it needs filled. Only the turn kinds take one. |
| `stage` | The coarse run phase, and the boundary `--resume-from` can restart at. |
| `inputs`, `outputs` | Named artifacts it reads and writes. This is the handoff between steps. |
| `needs` | Steps that must finish first. Using it makes the flow a graph rather than a line. |
| `retries` | Extra attempts for a flaky turn, 0 to 5. |
| `optional`, `skipWhenReadOnly`, `skipWhen` | The three ways a step is passed over. |
| `continueOnError` | The run advances past its failure instead of ending. |
| `approval` | Turns it into a gate that waits for you. |
| `repeat` | Runs it once per item in a named collection. |
| `instructions` | Extra prompt text, this step only. |
| `skills` | Skill packs for this turn only, merged with the role's own. |
| `cleanRoom` | Drops the run's narrative for this seat, keeping its declared `inputs`, so a judge does not anchor on how the producer framed things. |

The shape is `flowStepSchema` in `src/flows/schemas/flow-schema.ts`.

## Related

- [Flow YAML, annotated](/docs/reference/flow-yml) - every field a step can carry.
- [Workflow reference](/docs/reference/workflow) - the canonical, generated stage list.
- [Task lifecycle](/docs/task-lifecycle) - the same path with the full status diagram.

Next: [[seat]] is the slot a flow step asks for.
