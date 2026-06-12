---
title: Supervisor
description: The judgment posture watching every run - what it decides, where you see it, and how it saves you money.
section: concepts
slug: concepts/supervisor
---

Every run has a **supervisor**: a judgment posture (a *persona*) the
orchestrator applies on your behalf. It is not another agent doing work - it
decides *how much scrutiny the work deserves* and leaves a visible trail of
every decision.

## What it does

- **Risk upgrades.** Each persona declares risk signals (the built-in
  `staff-engineer` watches for auth, payments, migrations, concurrency and
  the like). A task that matches gets upgraded to a heavier flow - e.g. a
  three-lens review panel - automatically, and the upgrade is recorded with
  the exact signals that triggered it. Upgrades only ever add scrutiny.
- **Review independence, honestly labeled.** A run reviewed by the same
  model that wrote the code is marked `single-profile` (a self-check can
  only lower confidence); reviews from a genuinely different model are
  `cross-model`.
- **A cheaper reviewer, when you choose one.** A persona can pin review
  seats to a different Profile with `reviewerProfile` - a cheaper model for
  routine reviews, or a different vendor for real cross-model independence:

```yaml
personas:
  staff-engineer:
    label: Staff engineer
    reviewerProfile: cheap-reviewer   # review seats run this Profile
profiles:
  cheap-reviewer:
    provider: claude
    model: claude-haiku-4-5-20251001
```

Explicit choices always win over the persona: a per-step profile override or
a run-wide `--profile` beats `reviewerProfile`.

## Where you see it

The run screen opens with the **Supervisor panel**: the active persona, the
flow-selection story in one sentence ("upgraded to panel-review - matched
'auth', 'token'"), a live feed of every judgment and enforcement (selections,
review decisions, denied actions, fallbacks, budget events), the arbitration
verdict when the flow ran one, and any approval waiting on you - approve or
reject right there.

Pick the persona per run with the composer's Supervisor selector or
`vibe run --supervisor <id>`; list what's available with
`vibe supervisor list`.

## Related

- [Flow](/docs/concepts/flow) - what an upgrade actually changes.
- [Profile](/docs/concepts/profile) - what `reviewerProfile` points at.
