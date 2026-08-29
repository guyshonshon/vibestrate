---
title: Steps - the workflow of a run
description: The four steps of the default flow, in order, and what each one is for.
slug: concepts/workflow
---

## In simple words

A **workflow** is the ordered set of steps one [[run]] works through, from submitted to a verdict. Every run executes a [[flow]], so its workflow is that flow's steps.

This page is the canonical description of the built-in `default` flow:

```
plan -> implement -> validate -> review
          ^                        |
          +------------------------+   (only on CHANGES_REQUESTED)
```

Four steps and one cycle. There is no separate fixer and no verify turn: **review** is the decision step, and a `CHANGES_REQUESTED` decision re-enters **implement** with the findings attached.

`vibe ui` opens the dashboard on `127.0.0.1:4317`; a live run sits at the top of the sidebar, and **Runs** lists the rest under Active, Merge-ready and Failed. A run's page has seven tabs: **Steps** lists each step's state, **Tree** draws it as a node tree, **Events** is the raw stream, **Artifacts** holds every prompt and output, **Validation** carries the command results the loop turns on, **Terminal** shows the live process, and **Replay** walks a finished run event by event.

<div class="docs-callout tip">

**Tip.** A review that asks for changes does not end the run and does not start it over: it hands the findings back to the seat that wrote the code, which builds again, re-validates, and is reviewed again. That is why a run can pass on its second attempt without you doing anything.

</div>

<div class="docs-callout">

**Did you know?** Validation is the tie-breaker. When a reviewer's opinion and your test suite disagree, the test suite is the one that is not guessing: it actually ran your code. That is why `validate` sits between implement and review rather than after it.

</div>

## What each step does

| Step | Run status | Seat | Output |
|---|---|---|---|
| plan | `planning` | planner | a plan for the change |
| implement | `executing` | implementer | file edits in the worktree |
| validate | `validating` | none | your `commands.validate` output |
| review | `reviewing` | reviewer | findings, and `APPROVED` / `CHANGES_REQUESTED` / `BLOCKED` |

Four steps, four statuses, and the last three of them repeat together on a review round. The [state machine](/docs/concepts/state) is the rail underneath, so a run cannot jump from `planning` to `merge_ready`. The fields each step is written from are annotated in [Flow YAML](/docs/reference/flow-yml).

`architecting`, `fixing` and `verifying` are real run statuses, and `--resume-stage` accepts them - they belong to the `deep` flow, not to this one.

<svg viewBox="0 0 500 124" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="The default flow runs plan, implement, validate and review in order. An approved review ends the run; changes requested goes back to implement, at most three passes.">
  <rect x="0" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="58" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Plan</text>
  <rect x="128" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="186" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Implement</text>
  <rect x="256" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="314" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Validate</text>
  <rect x="384" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="442" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Review</text>
  <path d="M116 30 L128 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="120,25.5 128,30 120,34.5" fill="var(--fg-200)"/>
  <path d="M244 30 L256 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="248,25.5 256,30 248,34.5" fill="var(--fg-200)"/>
  <path d="M372 30 L384 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="376,25.5 384,30 376,34.5" fill="var(--fg-200)"/>
  <path d="M442 52 L442 92 L186 92 L186 60" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="181.5,60 186,52 190.5,60" fill="var(--fg-200)"/>
  <text x="314" y="86" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="middle">changes requested</text>
  <text x="314" y="110" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="middle">at most 3 passes</text>
</svg>

The one cycle in the default flow, and its bound. Review either approves, which ends the run, or sends its findings back to implement and looks again, at most three times.

## Why the steps split this way

<div class="docs-cards">

**Plan before implement**
What to do, then the doing. A model that plans while it edits tends to justify the edit it already made.

**Validate before review**
Your tests are cheaper than a model's attention.

**Review by a different seat**
The reviewer is its own seat, so you can put it on a different model. A model reviewing its own work can only lower its own confidence.

**Back to implement, not to a fixer**
The seat that wrote the code owns it through the loop, and it already holds the context a separate fixer would have to rebuild.

</div>

## When you want the longer pipeline

The six-seat pipeline that used to be the default is still here as the built-in **`deep`** flow: an architect between plan and implement, a dedicated fixer answering review rounds, and a separate verifier taking the last look before merge-ready.

The architect is the part you are most likely to want back. It reads the plan and decides the approach against the existing codebase, read-only, and it can stop the run: if it emits `HUMAN_APPROVAL: REQUIRED`, the run moves to `waiting_for_approval` before any code is written.

## Validation is the ground truth

**validate** runs your project's `commands.validate` array (typecheck, tests, build, lint) and routes the result. It has no seat because it settles the disagreement rather than joining it.

`vibe init` fills `commands.validate` from the scripts it finds, so on a typical Node project it is already set. If it found none, the workflow is a model-judgement loop with no facts underneath it. One `pnpm typecheck` entry catches a large class of regressions.

## The review loop

`review` is the decision step. Anything other than `CHANGES_REQUESTED` exits the loop and ends the run. `CHANGES_REQUESTED` re-enters `implement` with the findings, which then re-validates and is reviewed again, three implement passes at most.

The reviewer may run your commands but cannot write, which is enforced at the tool layer rather than asked for in the prompt. Before every hand-off the implementer does a scoped self-review of its own diff, so the reviewer is reading work that has already had one pass over it.

`workflow.maxReviewLoops` is an optional global ceiling: set it and no flow's loop budget goes above that number. Unset by default, so each flow keeps its own budget. A per-crew `maxReviewLoops` takes precedence over both.

## One runner, many recipes

A [Flow](/docs/concepts/flow) is a different recipe with different seats, step order, optional approval gates, or looping steps. The built-in `quality-arbitration` flow, for example, adds a builder, a challenger who reviews the plan and then the diff, and an arbiter who writes the decision summary. All on the same runner:

```bash
vibe run "..."                  # Vibestrate picks
vibe run "..." --flow default   # the four steps
vibe run "..." --flow deep      # the six-seat pipeline
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
