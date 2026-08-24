---
title: Supervisor
description: The judgment Vibestrate brings to a run - how hard it looks, and a labelled record of every call.
slug: concepts/supervisor
---

## In simple words

A **supervisor** decides how hard to look at the work before calling it done. It sets the level of scrutiny, then writes down every call it makes. A building inspector, not the crew.

`vibe ui` opens the dashboard on `127.0.0.1:4317`. **Supervisors**, under **More** in the sidebar, is the catalog: every supervisor available, which one is the default, and **Set default** on each card. The **New run** page carries a **Supervisor** picker that overrides the default for one run.

<div class="docs-callout tip">

**Tip.** `single-profile` on the run's Supervisor panel is the supervisor telling on itself: one model both wrote and judged, so the review is a self-check. Point the reviewer role at a second [[provider]] and the tag becomes `cross-model`. The label can lower your confidence in a result; it never inflates it.

</div>

You meet the result at the top of a [[run]]:

![The Supervisor panel of a run. It names staff-engineer, tags the review single-profile, and shows 3 decisions. Three judgment rows read verify PASSED, review APPROVED, and review aimed through 3 lenses - correctness, tests and security-risk.](/media/docs/scoped/supervisor.png)

The decision count opens the feed. Where the flow was chosen rather than pinned, a **why** link expands **Flow & why**: the flow it resolved, where the choice came from, its confidence, and the words that triggered any upgrade.

<div class="docs-callout">

**Did you know?** A supervisor is advisory, and only ever adds scrutiny. It can upgrade a run to a heavier flow, never downgrade one; it can suggest a stricter execution posture, never relax it. A setting that could quietly reduce checking would make every verdict weaker.

</div>

<div class="docs-callout warn">

**One word, two things.** *This page is the setting*, which `project.yml` calls a `persona`. The **Supervisor** chat on Mission Control is a *conversation*, covered by [supervisor control](/docs/concepts/supervisor-control). Under `vibe supervisor`, `list`, `archetypes`, `adopt`, `default` and `remove` manage the setting; `stop`, `resume` and `status` belong to the conversation.

</div>

## Going deeper

### The calls it makes

<div class="docs-cards">

**More care for risky work.** Each supervisor carries a list of risk signals. The default `staff-engineer` watches for logins, payments, credentials, database migrations, permissions and concurrency. On a match the run is upgraded to a heavier [Flow](/docs/concepts/flow), a multi-reviewer panel, and the words that triggered it are recorded.

**The reviewers' aim.** A supervisor's **lenses** aim the reviewers. `staff-engineer` points them at correctness, tests and security risk; the built-in `security` at authorization, secrets and injection. Which lenses ran is recorded.

**A heavier posture, suggested.** For a risk-tagged task a supervisor can ask for a heavier way of executing. `security` asks for `sandbox-suggested`, which by default is a suggestion you see rather than a gate.

**A lens on planning.** A supervisor can also aim the agents that scope, spec and architect the work in [Spec-up](/docs/concepts/spec-up). The default stays neutral.

</div>

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

The lens vocabulary is closed. These ten, and nothing else:

<div class="docs-chips"><span>correctness</span><span>tests</span><span>security-risk</span><span>authz</span><span>secrets</span><span>injection</span><span>ux-ia</span><span>accessibility</span><span>visual-consistency</span><span>performance</span></div>

Naming a lens is the only way a supervisor changes what a reviewer looks at, so a project cannot slip free-form instructions into a review. A lens outside the vocabulary contributes nothing.

A suggested posture becomes a rule only if you say so. `posture.autoApplySandbox` makes a `sandbox-suggested` run sandboxed; `posture.autoApplyApproval` makes each change wait for your approval. Both default off, and the **Supervisor posture** group on the Policies page carries both as switches.

The two switches are not guarded alike. The approval gate steps aside twice: an explicit `--permission-mode` wins over it, and it is suppressed for unattended runs, where a prompt would only stall. The sandbox has neither escape - `autoApplySandbox` raises isolation on a `sandbox-suggested` run regardless of `--permission-mode`, because it only ever raises safety and there is nothing to stall. What it does not do is pretend: only a provider CLI that enforces a real OS sandbox gets one, and a seat on a provider without one degrades and is reported as unsandboxed rather than counted as protected. The default supervisor stays posture-neutral, so a plain `vibe run` meets none of this.

### Judgment, enforced, or structural

Every entry in the decision feed carries one of three labels.

<div class="docs-cards">

**judgment** - the supervisor's own call: which flow to run, a review verdict, a verification verdict. A model made it, so it can be wrong.

**enforced** - a deterministic gate fired: the diff gate, an Action Broker denial, a budget ceiling, a required approval. No model was involved.

**structural** - the supervisor carrying out the shape it chose: a parallel review wave, a rewind.

</div>

### Picking one, and picking who reviews

Two supervisors ship built in and need no setup: `staff-engineer`, the default, and `security`. Six more are **archetypes**, which have to be copied into your config first.

<div class="docs-chips"><span>security-hawk</span><span>performance-skeptic</span><span>correctness-purist</span><span>frontend-reviewer</span><span>data-migration-guardian</span><span>ship-fast-pragmatist</span></div>

**Add supervisor**, on the Supervisors page, opens two tabs. **From an archetype** lists the six with an **Adopt** button each. **Write your own** takes an id, label, description, risk signals, preferred flows and a suggested posture, validated against the persona schema before it lands in `project.yml`. Nothing is enforced until you set it as the default or pick it on a run.

Point `reviewerProfile` at a [Profile](/docs/concepts/profile) and every review seat runs it: a cheap model for routine reviews, or a different vendor for an independent second read. It is a config field only; the Supervisors page shows it on a card but never sets it.

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

Give it a new id, as above. A `personas:` entry **replaces** a built-in of the same name, so writing `staff-engineer:` here to change one field empties that persona's risk signals, preferred flow and lenses, with no error. A new persona starts empty for the same reason. A per-step profile override, or a run-wide `--profile`, beats `reviewerProfile`.

### Project rules are not the supervisor's

A rule like "use a hyphen, not an em-dash" belongs to the project. The active supervisor is the enforcer, not the owner: it carries `advise` rules into the reviewer's turn, and the project's `block` rules cap the merge whichever supervisor is on duty. [Policies](/docs/concepts/policies) has the tiers. Older configs scoped these under a persona's `preferences` key; `vibe policies migrate` lifts them across once.

### Automation

The interactive shell (`vibe`, or `vibe shell`) has no supervisor screen, and its **Config** page does not carry one either - that view has fourteen sections and personas are not among them. Picking and authoring happen in the dashboard or on the CLI, and these are what a script or a repo template reaches for.

```bash
vibe supervisor list          # what you can pick
vibe supervisor archetypes    # the six adoptable ones
vibe supervisor adopt security-hawk    # copy it in
vibe supervisor default security-hawk  # then use it
vibe run "harden the login" --supervisor security
```

[The CLI overview](/docs/cli/overview) has the shape of the tool; [the command reference](/docs/reference/cli) has every flag.

Also worth reading: [Flow](/docs/concepts/flow) is what an upgrade changes.

Next: [[policies]] is the rule surface a supervisor enforces on every run.
