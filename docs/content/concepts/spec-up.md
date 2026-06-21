---
title: Spec-up (plan as a CTO)
description: Turn a vague brief into a scoped spec, an architecture, the risks, and a reviewable roadmap - before any code is written.
section: concepts
slug: concepts/spec-up
---

Most planning tools answer "how do I write this change?" Spec-up answers the
question a CTO asks first: "what are we actually building, and what did you not
tell me yet?"

You give it a brief - even a vague one, like "a mini ecommerce store" - and it
surfaces the decisions the brief left unstated (do users sign in? how do you
take payments? how many products? do you ship physical goods?), asks you those
gap questions, and only then drafts the plan. Nothing it does touches your code:
every step is a read-only run.

## What you get

1. **Gap questions, in rounds.** The CTO reads the brief and asks the decisions
   that change what gets built, grouped by area (scope, users, data, constraints,
   success, integrations). You answer a round; it reads your answers and asks the
   follow-ups that are still genuinely open, drilling deeper - up to four rounds.
   A **Proceed to spec** button on every round stops the questioning whenever you
   want. The round counter and the four-round cap are enforced by Vibestrate, not
   the model, so the questioning always terminates. Stuck on a question? **Simplify**
   re-explains it in plain language and says what it changes in the build;
   **Suggest** drafts an answer grounded in what you've already decided (a draft
   you edit - it never answers for you).
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

## How it runs

Spec-up is a chain of short, read-only runs you step between, not one long process
that holds open:

```
intake  ->  (answer round 1)  ->  gap-check  ->  (answer round 2) ... ->  spec-up  ->  (you approve)  ->  roadmap
```

Each link is a fresh run. Because none of them write code, each is clamped
read-only automatically. Submitting a round either launches another gap-check
round (more questions) or, once coverage is complete or you proceed, the spec-up
run - through the same gated launcher the dashboard uses, so the browser never
runs a command. Your answers accumulate across rounds into one context file,
carried forward with secrets redacted. The **consult orb** is screen-aware here:
ask it "what should I put for X?" and it already has the questions and your
answers in view (redacted before the model sees them).

## Where to find it

Spec-up is not a separate screen - it is a run outcome. Just start a run (the
dashboard's New-run card, or `vibe run "<brief>"`): when the supervisor judges
the brief plan-worthy, the run opens on its gap-questions; answer them and the
spec-up run drafts the spec / architecture / risks for you to review, then the
live node-tree (the "Tree" tab) shows the supervisor and agents at work. The
trigger biases to execute - a targeted change ("add X to foo.ts") just runs.

- Force spec-up on a brief the heuristic skips: `vibe run --flow spec-up-intake "<brief>"`.
- Disable auto spec-up entirely: set `adaptiveSpecUp: off` in `project.yml`.
- CLI parity for the chain: `vibe spec-up questions <runId>`,
  `vibe spec-up answer <runId> --answer <id>="..."` (add `--proceed` to build the
  spec now), `vibe spec-up simplify <runId> <id>` / `vibe spec-up suggest <runId> <id>`
  (`--all` for the round), `vibe spec-up approve <runId>`, and
  `vibe spec-up roadmap <runId>` to turn a finished roadmap run into a proposal.

## Honest limits (v1)

Spec-up v1 is an educated draft and a scope-decision tool, not a novice autopilot.
Its job is to make you an informed decision-maker about *scope and direction* -
which you can judge - while technical correctness is guarded downstream by
execution-time review, not by you nodding at an architecture doc.

When a card runs, its acceptance criteria are now a **real gate**: they are
carried into the run (so the agent builds to them) and the verifier must confirm
each one before the run can pass - the prose criteria are judged by the verifier
against the artifacts, and a card can also carry `acceptanceCommands` (shell
checks you author) that run as an extra validation pass, so a failed acceptance
check blocks merge-readiness like a failed test. See [Safety](concepts/safety) for
the validation gate and `docs/design/spec-up-phase.md` for the full reasoning. The
completeness loop (multi-round questioning) now ships; what's still deferred is
one continuous "brief it and walk away" run (the chain stays a set of short runs
you step between, not one long process that pauses mid-flight).
