---
title: Supervisor
description: The judgment Vibestrate brings to a run - how hard it looks, what the reviewers aim at, and a labelled record of every call it made.
slug: concepts/supervisor
---

A **supervisor** is the judgment Vibestrate brings to a run: how hard to look at the work, and how strict to be before calling it done. It does no work itself. It sets the level of scrutiny, then writes down every call it makes.

Think of a building inspector. They do not pour the concrete or hang the drywall. They decide how hard to look, send the risky parts back for a second opinion, and record every call so you can trust the sign-off.

One word covers two things in this product, so it is worth separating them up front. **This page is the setting.** `.vibestrate/project.yml` calls it a `persona`, you pick one per run, and it shapes how the work is reviewed. The **Supervisor** panel in the dashboard is something else: a *conversation* with your project, covered by [Supervisor Control](/docs/concepts/supervisor-control). They share a name and a command: under `vibe supervisor`, list, archetypes, adopt, default and remove manage the setting on this page, while stop, resume and status belong to the conversation.

A supervisor is advisory, and the product says so out loud. Its choices only ever add scrutiny, never remove it, and its record labels each entry as its own judgment or as a gate that fired.

One of its settings is worth knowing before the rest. `reviewerProfile` sends every review seat to a model you pick, so the code's author does not have to be its only reviewer.

<svg viewBox="0 0 560 150" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A task goes through the supervisor to a flow, upgraded to a heavier one when the work looks risky. The supervisor also sets the lenses reviewers aim at, the posture a run executes under, and a feed that labels every call it made.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="8" width="110" height="40" rx="8"/>
    <rect x="146" y="8" width="160" height="40" rx="8"/>
    <rect x="341" y="8" width="110" height="40" rx="8"/>
    <path d="M111 28 H139"/>
    <path d="M306 28 H334"/>
    <path d="M226 48 V134 M226 86 H250 M226 110 H250 M226 134 H250"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M146 28 l-7 -4 v8 z"/>
    <path d="M341 28 l-7 -4 v8 z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="56" y="33">task</text>
    <text x="226" y="33">supervisor</text>
    <text x="396" y="33">flow</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="396" y="63">upgraded when risky</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="258" y="90">lenses<tspan x="330" font-size="11" fill-opacity="0.5">what reviewers aim at</tspan></text>
    <text x="258" y="114">posture<tspan x="330" font-size="11" fill-opacity="0.5">sandboxed? approve each change?</tspan></text>
    <text x="258" y="138">feed<tspan x="330" font-size="11" fill-opacity="0.5">every call, labelled</tspan></text>
  </g>
</svg>

## What it decides

<div class="docs-cards">

**More care for risky work.** Each supervisor carries a list of risk signals. The default `staff-engineer` watches for logins, payments, credentials, database migrations, permissions and concurrency. On a match the run is upgraded to a heavier [Flow](/docs/concepts/flow) - a multi-reviewer panel - and the words that triggered it are recorded. An upgrade only ever adds care.

**What the reviewers look for.** A supervisor's **lenses** aim the reviewers. `staff-engineer` points them at correctness, tests and security risk. The built-in `security` points them at authorization, secrets and injection. The same diff genuinely gets a different review, and which lenses ran is recorded.

**An honest label on the sign-off.** If two or more distinct models actually ran, the review is marked `cross-model`. Otherwise it is `single-profile` - a self-check, which can lower your confidence in the result but never raise it.

**A heavier posture, suggested.** For a risk-tagged task a supervisor can ask for a heavier way of executing. `security` asks for `sandbox-suggested`. By default that is a suggestion you see, never a gate and never a downgrade.

**A lens on planning.** When a run goes through [Spec-up](/docs/concepts/spec-up), a supervisor can aim the agents that scope, spec and architect the work - `security` brings authorization, secrets and attack surface into that planning. The default stays neutral, so plain spec-up runs are unchanged.

</div>

The lens vocabulary is closed. These ten, and nothing else:

<div class="docs-chips"><span>correctness</span><span>tests</span><span>security-risk</span><span>authz</span><span>secrets</span><span>injection</span><span>ux-ia</span><span>accessibility</span><span>visual-consistency</span><span>performance</span></div>

Naming a lens is the only way a supervisor changes what a reviewer is asked to look at, so a project cannot slip free-form instructions into a review through its supervisor.

<div class="docs-callout">

**Turning a suggestion into a rule.** `posture.autoApplySandbox` makes a `sandbox-suggested` run actually sandboxed. `posture.autoApplyApproval` makes each change wait for your approval. Both default off. An explicit `--permission-mode` always wins, the approval gate is suppressed for unattended runs, and a provider that cannot really sandbox degrades honestly instead of pretending. The default supervisor stays posture-neutral.

</div>

## Judgment, or a gate

The run screen opens with it: the active supervisor, one line on why this flow was chosen ("upgraded to panel-review - matched 'auth', 'token'"), and a feed of every call it made. Each entry in the feed carries one of three labels, and the difference between them is the point.

<div class="docs-cards">

**judgment** - the supervisor's own call: which flow to run, a review verdict, a verification verdict. A model made it, so it can be wrong.

**enforced** - a deterministic gate fired: the diff gate, an Action Broker denial, a budget ceiling, a required approval. No model was involved.

**structural** - the supervisor carrying out the shape it chose: a parallel review wave, a rewind.

</div>

A model's verdict shown as if it were a hard guarantee is the failure this labelling exists to prevent. Anything waiting on your approval sits in the same panel.

## Picking who reviews

Point `reviewerProfile` at a [Profile](/docs/concepts/profile) and every review seat runs it. A cheap model for routine reviews, or a different vendor when you want a genuinely independent second read - which is also one way `single-profile` becomes `cross-model`.

```yaml
personas:
  thrifty:
    label: Thrifty staff engineer
    reviewerProfile: cheap-reviewer  # review seats
profiles:
  cheap-reviewer:
    provider: claude
    model: haiku
```

Give it a new id, as above. A `personas:` entry **replaces** a built-in of the
same name instead of adding to it, so writing `staff-engineer:` here to change
one field drops that persona's risk signals, its preferred flow and its lenses
back to empty - the config still validates, and the upgrade on risky work
quietly stops happening. A new persona starts empty for the same reason: fill in
`riskSignals`, `prefersFlows` and `reviewLenses` if you want them.

Anything you choose by hand wins. A per-step profile override, or a run-wide `--profile`, beats `reviewerProfile`.

## Project rules are not the supervisor's

A rule like "use a hyphen, not an em-dash" belongs to the project, so it holds whichever supervisor reviews the work. The active supervisor is the enforcer, not the owner: it carries the `advise` rules into the reviewer's turn, and the project's `block` rules cap the merge regardless of which supervisor is active. [Policies](/docs/concepts/policies) has the tiers and how rules get captured. Older configs scoped these to a supervisor under a `preferences` key; `vibe policies migrate` lifts them across once.

## Picking one

Two supervisors ship built in and need no setup: `staff-engineer`, the default, and `security`. Six more are presets. A preset has to be copied into your config before you can pick it.

<div class="docs-chips"><span>security-hawk</span><span>performance-skeptic</span><span>correctness-purist</span><span>frontend-reviewer</span><span>data-migration-guardian</span><span>ship-fast-pragmatist</span></div>

```bash
vibe supervisor list          # what you can pick
vibe supervisor archetypes    # the six presets
vibe supervisor adopt security-hawk    # copy it in
vibe supervisor default security-hawk  # then use it
vibe run "harden the login" --supervisor security
```

In the dashboard, the composer's **Supervisor** picker does the same for one run.

## Going deeper

- [Flow](/docs/concepts/flow) - what an upgrade actually changes.
- [Profile](/docs/concepts/profile) - what `reviewerProfile` points at.
- [Supervisor Control](/docs/concepts/supervisor-control) - the conversation that shares the name.
- [Policies](/docs/concepts/policies) - the rules the supervisor carries into a review.
