---
title: Spec-up (plan before you build)
description: Turns a vague brief into a written spec by asking you the questions it cannot answer itself.
slug: concepts/spec-up
---

## In simple words

Most planning tools answer "how do I write this change?" **Spec-up** answers the question before it: *what are we actually building, and what have you not told me yet?*

Give the dashboard's **New run** form a brief that reads like a whole system - "a mini ecommerce store" - and the run opens on questions rather than code. You answer the ones you can, it writes a spec from your answers, and only then does a [[flow]] run against that spec.

<div class="docs-callout tip">

**Tip.** You do not have to ask for this. A brief that reads like a whole system triggers it automatically, and every run tells you afterwards that it happened. The trigger is biased toward executing: it fires only on a clear build-a-system reading, and never when the brief names a concrete file. `adaptiveSpecUp: off` on the Config page stops it entirely; `--no-select` skips it for one run.

</div>

## When it earns its keep

<div class="docs-cards">

**A brief with holes in it**
"Add billing" hides a dozen decisions. Better to surface them before code exists than during review.

**Work you will not remember next week**
The spec is a written artifact. It outlives the run.

**Handing work to someone else**
A spec someone reviewed beats a task description someone interpreted.

**Anything you would otherwise prototype twice**
Cheaper to answer questions than to rebuild.

</div>

<div class="docs-callout">

**Did you know?** Spec-up writes no code. It is a read-only chain, and the flow you named is what runs afterwards, seeded with the spec it produced. Naming a flow with `--flow` does not skip spec-up, because that flow is what spec-up is building toward.

</div>


## On the run page

Spec-up has no screen of its own. It is a run outcome, so everything happens on
the run you started - `vibe ui` opens the dashboard on `127.0.0.1:4317`.

**Scope the work** is the questions screen: a side menu grouping them by area -
Scope, Users, Data, Constraints, Success, Integrations, and Other for everything
else worth deciding - with an answered-count each, and **Why it matters** under
every question. Two helpers sit beside each
one. **Simplify** re-explains it and says what it affects; **Suggest** drafts an
answer grounded in what you have already decided, which you take with **Use** or
drop with **Dismiss**. **Suggest all here** does the whole area at once.

The footer holds the two ways forward: **Submit answers** sends the round,
**Proceed to spec** stops the questions and drafts the spec now. Once the
questions run out the screen becomes **Coverage complete**, with **Build the
spec**.

When the drafts land, the run carries **Spec-up draft ready**. **Approve &
build** runs your chosen flow seeded with the spec; **Generate roadmap** launches
the roadmap-synthesis run instead. That run makes no cards on its own: when it
finishes it carries **Roadmap synthesized** and a **Create board cards** button,
which turns it into a proposal for you to accept. Below the draft banner,
**Spec-up draft - review + edit before approving** holds the four documents as
collapsible sections (Scope, Specification, Architecture + provisioning, Risks),
each with **Edit** and **Save**. Approving freezes them.

The **Tree** tab shows the supervisor and agents at work while a link runs.

## What you get

1. **Gap questions, in rounds** - up to four. The round counter and the cap are
   enforced by Vibestrate, not the model, so the questioning always terminates.
2. **A scope.** What is in, what is explicitly out, and the assumptions.
3. **A spec.** Capabilities, data model, key flows and acceptance criteria in
   plain prose, with the tradeoffs explained so you can steer without being the
   expert.
4. **An architecture** with a provisioning checklist - the services to set up and
   the environment-variable *names* to fill in, never the secret values.
5. **A risks register** - what is most likely to go wrong, and how to mitigate it.
6. **A roadmap** - the spec as dependency-ordered board cards, each with
   acceptance criteria and a rough estimate.

## The chain

Spec-up is short read-only runs you step between, not one long process that
holds open:

<svg font-family="var(--font-sans)" viewBox="0 0 560 118" width="100%" style="max-width:720px;height:auto" role="img" aria-label="The chain of runs: intake, then a gap-check that asks questions, then a round where you answer, looping back to gap-check for up to four rounds, then the spec-up run and, once you approve, the roadmap run.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="4" y="32" width="98" height="40" rx="8"/>
    <rect fill="var(--bg-200)" x="117" y="32" width="98" height="40" rx="8"/>
    <rect fill="var(--bg-200)" x="230" y="32" width="98" height="40" rx="8"/>
    <rect fill="var(--bg-200)" x="343" y="32" width="98" height="40" rx="8"/>
    <rect fill="var(--bg-200)" x="456" y="32" width="98" height="40" rx="8"/>
    <path d="M103 52 H112 M216 52 H225 M329 52 H338 M442 52 H451"/>
    <path d="M279 73 V92 H166 V78"/>
  </g>
  <g fill="var(--fg-300)">
    <path d="M117 52 L110 48.5 L110 55.5 Z"/>
    <path d="M230 52 L223 48.5 L223 55.5 Z"/>
    <path d="M343 52 L336 48.5 L336 55.5 Z"/>
    <path d="M456 52 L449 48.5 L449 55.5 Z"/>
    <path d="M166 72 L162.5 79 L169.5 79 Z"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)" text-anchor="middle">
    <text x="53" y="57">intake</text>
    <text x="166" y="57">gap-check</text>
    <text x="279" y="57">answer</text>
    <text x="392" y="57">spec-up</text>
    <text x="505" y="57">roadmap</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11" text-anchor="middle">
    <text x="222" y="108">up to four rounds</text>
    <text x="448" y="24">you approve</text>
  </g>
</svg>

Because none of them write code, each link is clamped
read-only automatically. Submitting a round launches either another gap-check
round or the spec-up run, both through the same gated launcher the dashboard
uses, so the browser never runs a command. Your answers accumulate into one
context file, carried forward with secrets redacted.

The consult orb is screen-aware here: ask it "what should I put for X?" and it
already has the questions and your answers in view, redacted before the model
sees them.

A finished roadmap run becomes a document on the **Proposals** page, tagged
`From Spec-up`. **Dry-run** checks it and **Accept proposal** turns it into
roadmap items and board cards. Each card is stamped with the approved spec at
that moment, so a run launched from a card later is seeded with the same
document rather than with the card's title alone.

## From a terminal

Every link has a command, so the chain scripts end to end:

```bash
vibe spec-up start "a mini ecommerce store"
vibe spec-up questions <runId>   # the round's ids
vibe spec-up simplify <runId> <questionId>
vibe spec-up suggest <runId> --all
vibe spec-up answer <runId> --answer <id>=<value>
vibe spec-up answer <runId> --proceed
```

`--proceed` is the CLI's **Proceed to spec**.

```bash
vibe spec-up edit <runId> scope
vibe spec-up approve <runId>     # -> the roadmap synthesis run
vibe spec-up build <runId>       # -> the chosen flow, seeded
vibe spec-up roadmap <runId>     # -> a proposal
vibe roadmap accept <proposalId> # -> roadmap items + board cards
```

`edit` opens a section (`scope`, `spec`, `architecture`, `risks`) in `$EDITOR`,
or reads `--file`. It refuses content that looks like a secret, and closes once
you approve. `approve` and `build` are the two ways out of the draft, and both
carry the approved spec forward.

There is no spec-up screen in `vibe shell`. Its Runs and Roadmap pages see the
runs and the cards, not the questions.

## Honest limits

Spec-up drafts. It is a scope-decision tool, not a novice autopilot: its job is
to make you an informed decision-maker about *scope and direction*, the part you
can judge. Technical correctness is caught downstream by execution-time review,
not by you nodding at an architecture doc.

A card's acceptance criteria are a real gate once it runs. They are carried into
the run so the agent builds to them, and the verifier has to confirm each one
against the artifacts before the run can pass. A card can also carry
`acceptanceCommands` - shell checks you author, run as an extra validation pass -
so a failed acceptance check blocks merge-readiness the way a failed test does.
See [Safety](/docs/concepts/safety) for the validation gate.

The dashboard has no per-run brake. The composer's flow-picking toggle -
**Auto-pick flow** on the **New run** page, **Force flow select** on Mission
Control's composer - is a different switch. Going the other way,
`vibe run --flow spec-up-intake "<brief>"` forces the chain onto a brief the
heuristic skips.
