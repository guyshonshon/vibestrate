---
title: Spec-up (plan before you build)
description: Turn a vague brief into a scoped spec, an architecture, the risks, and a reviewable roadmap - before any code is written.
slug: concepts/spec-up
---

Most planning tools answer "how do I write this change?" Spec-up answers the
question that comes before it: "what are we actually building, and what did you
not tell me yet?"

You give it a brief - even a vague one, like "a mini ecommerce store" - and it
surfaces the decisions the brief left unstated (do users sign in? how do you
take payments? how many products? do you ship physical goods?), asks you those
gap questions, and only then drafts the plan. Nothing it does touches your code:
every step is a read-only run.

What comes back is a scope (in, out, assumptions), a spec, an architecture with
a provisioning checklist, a risks register, and a roadmap of dependency-ordered
board cards. Start it with `vibe spec-up start` and your brief, or start an
ordinary run and let the supervisor route a plan-worthy brief here on its own.

It runs as a chain: an intake run, then rounds of gap-check questions you
answer, then the spec-up run and, once you approve, a roadmap run.

## What you get

1. **Gap questions, in rounds.** It reads the brief and asks for the decisions
   that change what gets built, grouped by area (scope, users, data, constraints,
   success, integrations). You answer a round; it reads your answers and asks the
   follow-ups that are still genuinely open, drilling deeper - up to four rounds.
2. **A scope.** What is in, what is explicitly out, and the assumptions - so the
   plan is bounded to what you actually want, not everything that is possible.
3. **A spec.** The capabilities, the data model, the key flows, and acceptance
   criteria in plain prose, with the tradeoffs explained so you can steer even
   if you are not the expert.
4. **An architecture** with a provisioning checklist - the services to set up and
   the environment-variable *names* to fill in (never the secret values).
5. **A risks register** - what is most likely to go wrong, and how to mitigate it.
6. **A roadmap** - the spec synthesized into dependency-ordered board cards, each
   with acceptance criteria and a rough estimate, ready to review and accept.

The questioning always terminates. The round counter and the four-round cap are
enforced by Vibestrate, not the model, and a **Proceed to spec** button on every
round stops the questions earlier whenever you want.

Two helpers sit next to each question. **Simplify** re-explains it in plain
language and says what it changes in the build. **Suggest** drafts an answer
grounded in what you've already decided - a draft you edit, never an answer given
for you.

## How it runs

Spec-up is a chain of short, read-only runs you step between, not one long process
that holds open:

<svg viewBox="0 0 560 118" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The chain of runs: intake, then a gap-check that asks questions, then a round where you answer, looping back to gap-check for up to four rounds, then the spec-up run and, once you approve, the roadmap run.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="4" y="32" width="98" height="40" rx="8"/>
    <rect x="117" y="32" width="98" height="40" rx="8"/>
    <rect x="230" y="32" width="98" height="40" rx="8"/>
    <rect x="343" y="32" width="98" height="40" rx="8"/>
    <rect x="456" y="32" width="98" height="40" rx="8"/>
    <path d="M103 52 H112 M216 52 H225 M329 52 H338 M442 52 H451"/>
    <path d="M279 73 V92 H166 V78"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M117 52 L110 48.5 L110 55.5 Z"/>
    <path d="M230 52 L223 48.5 L223 55.5 Z"/>
    <path d="M343 52 L336 48.5 L336 55.5 Z"/>
    <path d="M456 52 L449 48.5 L449 55.5 Z"/>
    <path d="M166 72 L162.5 79 L169.5 79 Z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="53" y="57">intake</text>
    <text x="166" y="57">gap-check</text>
    <text x="279" y="57">answer</text>
    <text x="392" y="57">spec-up</text>
    <text x="505" y="57">roadmap</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="222" y="108">up to four rounds</text>
    <text x="448" y="24">you approve</text>
  </g>
</svg>

Each link is a fresh run. Because none of them write code, each is clamped
read-only automatically.

Submitting a round either launches another gap-check round (more questions) or,
once coverage is complete or you proceed, the spec-up run. Both go through the
same gated launcher the dashboard uses, so the browser never runs a command.

Your answers accumulate across rounds into one context file, carried forward with
secrets redacted.

The **consult orb** is screen-aware here: ask it "what should I put for X?" and it
already has the questions and your answers in view (redacted before the model
sees them).

## Where to find it

Spec-up is not a separate screen - it is a run outcome. Start a run from the
dashboard's New-run card, or with `vibe run "<brief>"`.

When the supervisor judges the brief plan-worthy, the run opens on its gap
questions. Answer them and the spec-up run drafts the spec, the architecture and
the risks for you to review. The live node-tree (the "Tree" tab) shows the
supervisor and agents at work.

The trigger biases to execute - a targeted change ("add X to `foo.ts`") just runs.

- Force spec-up on a brief the heuristic skips: `vibe run --flow spec-up-intake "<brief>"`.
- Disable auto spec-up entirely: set `adaptiveSpecUp: off` in `project.yml`.

Every step of the chain has a command, so you can drive the whole thing from a
terminal:

```bash
vibe spec-up start "a mini ecommerce store"
vibe spec-up questions <runId>   # the round's ids
vibe spec-up simplify <runId> <questionId>
vibe spec-up suggest <runId> --all
vibe spec-up answer <runId> --answer <id>=<value>
vibe spec-up answer <runId> --proceed
```

`simplify` re-explains one question, and `suggest` drafts answers you then edit.
`--proceed` stops the questions and drafts the spec now.

```bash
vibe spec-up edit <runId> scope
vibe spec-up edit <runId> spec
vibe spec-up edit <runId> architecture
vibe spec-up edit <runId> risks
vibe spec-up approve <runId>
vibe spec-up build <runId>
vibe spec-up roadmap <runId>     # -> a proposal
```

`edit` opens the section in `$EDITOR` (or reads `--file`). It refuses content that
looks like a secret, and it closes once you approve.

`approve` and `build` are the two ways out of the draft: `approve` turns the spec
into board cards, `build` runs the flow you picked seeded with the approved spec.

## Honest limits

Spec-up drafts. It is a scope-decision tool, not a novice autopilot.

Its job is to make you an informed decision-maker about *scope and direction* -
the part you can judge. Technical correctness is caught downstream by
execution-time review, not by you nodding at an architecture doc.

A card's acceptance criteria are a real gate once it runs. They are carried into
the run so the agent builds to them, and the verifier has to confirm each one
against the artifacts before the run can pass.

A card can also carry `acceptanceCommands` - shell checks you author, run as an
extra validation pass - so a failed acceptance check blocks merge-readiness the
way a failed test does. See [Safety](/docs/concepts/safety) for the validation
gate.

The chain is a set of short runs you step between, not one continuous "brief it
and walk away" process. Every link waits for you to submit the next round.
