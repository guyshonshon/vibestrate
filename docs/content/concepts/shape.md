---
title: Shape (plan as a CTO)
description: Turn a vague brief into a scoped spec, an architecture, the risks, and a reviewable roadmap - before any code is written.
section: concepts
slug: concepts/shape
---

Most planning tools answer "how do I write this change?" Shape answers the
question a CTO asks first: "what are we actually building, and what did you not
tell me yet?"

You give it a brief - even a vague one, like "a mini ecommerce store" - and it
surfaces the decisions the brief left unstated (do users sign in? how do you
take payments? how many products? do you ship physical goods?), asks you those
gap questions, and only then drafts the plan. Nothing it does touches your code:
every step is a read-only run.

## What you get

1. **Gap questions.** The CTO reads the brief and asks the handful of decisions
   that change what gets built. You answer them in a form (or on the CLI).
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

Shape is a chain of short, read-only runs you step between, not one long process
that holds open:

```
intake  ->  (you answer the gap questions)  ->  shape  ->  (you approve)  ->  roadmap
```

Each link is a fresh run. Because none of them write code, each is clamped
read-only automatically. Submitting your answers launches the next link through
the same gated launcher the dashboard uses - the browser never runs a command -
and your answers are carried forward as a context file with secrets redacted.

## Where to find it

- Dashboard: the **Plan** tab. Start from a brief, answer the questions, and the
  shaping run drafts the spec / architecture / risks for you to review.
- CLI: `vibe shape start "<brief>"`, then `vibe shape questions <runId>`,
  `vibe shape answer <runId> --answer <id>="..."`, and
  `vibe shape roadmap <runId>` to turn a finished roadmap run into a proposal.

## Honest limits (v1)

Shape v1 is an educated draft and a scope-decision tool, not a novice autopilot.
Its job is to make you an informed decision-maker about *scope and direction* -
which you can judge - while technical correctness is guarded downstream by
execution-time review, not by you nodding at an architecture doc. Termination is
the reviewer's verdict plus your approval, not a machine-checked gate. See
`docs/design/shape-phase.md` for the full reasoning, including what is
deliberately deferred (a completeness loop, machine-checkable acceptance
criteria, and one continuous "brief it and walk away" run).
