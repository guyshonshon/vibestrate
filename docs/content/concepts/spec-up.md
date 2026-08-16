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

## What you get

1. **Gap questions, in rounds.** It reads the brief and asks for the decisions
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
intake  ->  answer round  ->  gap-check  ->  answer round
        ...  ->  spec-up  ->  (you approve)  ->  roadmap
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

Spec-up is not a separate screen - it is a run outcome. Start a run (the
dashboard's New-run card, or `vibe run "<brief>"`): when the supervisor judges
the brief plan-worthy, the run opens on its gap-questions; answer them and the
spec-up run drafts the spec / architecture / risks for you to review, then the
live node-tree (the "Tree" tab) shows the supervisor and agents at work. The
trigger biases to execute - a targeted change ("add X to foo.ts") just runs.

- Force spec-up on a brief the heuristic skips: `vibe run --flow spec-up-intake "<brief>"`.
- Disable auto spec-up entirely: set `adaptiveSpecUp: off` in `project.yml`.

Every step of the chain has a command, so you can drive the whole thing from a
terminal:

```bash
vibe spec-up start "a mini ecommerce store"
vibe spec-up questions <runId>              # the round's questions, with ids
vibe spec-up answer <runId> --answer <id>=<value>
vibe spec-up answer <runId> --proceed       # stop asking, draft the spec now
vibe spec-up simplify <runId> <questionId>  # re-explain one question
vibe spec-up suggest <runId> --all          # draft answers you then edit
vibe spec-up edit <runId> scope             # or spec | architecture | risks
vibe spec-up approve <runId>                # approve, then synthesize a roadmap
vibe spec-up build <runId>                  # approve, then build it
vibe spec-up roadmap <runId>                # roadmap run -> a proposal
```

`edit` opens the section in `$EDITOR` (or reads `--file`), refuses content that
looks like a secret, and is closed once you approve. `approve` and `build` are
the two ways out of the draft: one turns the spec into board cards, the other
runs the flow you picked seeded with the approved spec.

## Honest limits

Spec-up drafts. It is a scope-decision tool, not a novice autopilot: its job is
to make you an informed decision-maker about *scope and direction* - the part you
can judge - while technical correctness is caught downstream by execution-time
review, not by you nodding at an architecture doc.

A card's acceptance criteria are a real gate once it runs. They are carried into
the run so the agent builds to them, and the verifier has to confirm each one
against the artifacts before the run can pass. A card can also carry
`acceptanceCommands` - shell checks you author, run as an extra validation pass -
so a failed acceptance check blocks merge-readiness the way a failed test does.
See [Safety](/docs/concepts/safety) for the validation gate.

The chain is a set of short runs you step between, not one continuous "brief it
and walk away" process. Every link waits for you to submit the next round.
