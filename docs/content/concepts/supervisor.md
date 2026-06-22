---
title: Supervisor
description: The setting that decides how closely Vibestrate watches a run, and records every call it makes.
section: concepts
slug: concepts/supervisor
---

A **supervisor** (its config calls it a **persona**) is the attitude Vibestrate brings to a run: how closely it should watch the work, and how strict it should be before calling the work done. It does no work itself. It sets the level of scrutiny and leaves a paper trail.

Think of a building inspector. They don't pour the concrete or hang the drywall. They decide how hard to look, send the risky parts back for a second opinion, and write down every call they make so you can trust the sign-off. The supervisor plays that role for a run.

<div class="docs-callout">

**It is not a rubber stamp.** This is what makes the AI's work trustworthy instead of a yes-man. The supervisor questions the result, tightens scrutiny on the risky changes, tells you honestly whether the review was truly independent, and records every decision it makes so you can check its reasoning later.

</div>

## What it decides

<div class="docs-cards">

**More care for risky work.**
Each supervisor knows which changes deserve extra caution. The built-in `staff-engineer` watches for things like logins, payments, database migrations, and concurrency. When a task matches, the run is automatically upgraded to a more thorough [Flow](/docs/concepts/flow), such as a multi-reviewer panel, and the exact words that triggered it get recorded. Upgrades only ever add care, never remove it.

**An honest label on the review.**
If the same AI that wrote the code also reviewed it, the run is marked `single-profile`. That is a self-check, and a self-check can only lower confidence, not raise it. If a genuinely different AI did the review, it's marked `cross-model`.

**What the reviewers look for.**
A supervisor's review **lenses** aim the reviewers at specific things. The `security` supervisor points them at authorization, secrets, and injection; the default `staff-engineer` points them at correctness, tests, and security risk. Switching supervisor genuinely changes what the reviewers scrutinise on the same diff, and which lenses ran is recorded. Lenses come from a fixed vocabulary, so a project can't smuggle free-form instructions into a reviewer's prompt.

**A posture nudge for risky work.**
A supervisor can suggest a heavier execution posture for risk-tagged tasks - the `security` supervisor suggests `sandbox-suggested`. By default it is advisory: a suggestion surfaced to you, never a gate, and never a downgrade. If you opt in, a suggestion can also *apply automatically*: `posture.autoApplySandbox` runs the task OS-sandboxed and `posture.autoApplyApproval` makes each change wait for approval. Both default off, an explicit `--permission-mode` always wins, the approval gate is suppressed for `--unattended` runs, and a provider that can't sandbox degrades honestly. The default supervisor stays posture-neutral.

**A lens on the spec-up phase.**
When a run goes through [Spec-up](/docs/concepts/spec-up), a supervisor can aim the planning agents that scope the work, write the spec, and design the architecture. The `security` supervisor brings an authorization / secrets / attack-surface lens to that planning; the default stays neutral, so plain spec-up runs are unchanged.

</div>

These two labels tell you how much the sign-off is worth at a glance:

<div class="docs-outcomes">
<div class="docs-outcome warn"><b>single-profile</b><span>The author reviewed its own work. Treat with caution.</span></div>
<div class="docs-outcome ok"><b>cross-model</b><span>A different AI reviewed it. Genuinely independent.</span></div>
</div>

## Picking who reviews

A supervisor can hand all the review work to a different AI with `reviewerProfile`. Use a cheaper model for routine reviews, or a different vendor when you want a truly independent second pair of eyes. In the config below, the `staff-engineer` supervisor sends every review seat to a `cheap-reviewer` Profile, which here runs Claude Haiku:

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

Anything you choose by hand wins over the supervisor. A per-step profile override, or a run-wide `--profile`, beats `reviewerProfile`.

## Where you see it

The run screen opens with the **Supervisor panel**. It shows the active supervisor, a one-line story of why the Flow was chosen ("upgraded to panel-review - matched 'auth', 'token'"), and a live feed of every call it makes: selections, review decisions, denied actions, fallbacks, and budget events. If the Flow ran an arbitration step (a final call that weighs the reviewers' findings) you see that verdict too, and anything waiting on you to approve or reject sits right there.

Pick the supervisor for a run with the composer's Supervisor selector or `vibe run --supervisor <id>`. See what's available with `vibe supervisor list`.

## Going deeper

<div class="docs-cards">

**[Flow](/docs/concepts/flow)**
What an upgrade actually changes.

**[Profile](/docs/concepts/profile)**
What `reviewerProfile` points at.

</div>
