---
title: Flow
description: The recipe a run follows - its ordered steps, and the kind of worker each step needs.
slug: concepts/flow
---

A **Flow** is a recipe: the ordered steps a run works through, and the *kind* of worker each step needs. It names seats, so one step calls for an implementer and the next calls for a reviewer, and it never names an AI model. Your [Crew](/docs/concepts/crew) supplies the workers. That is what lets you run a Flow someone else wrote with your own models and your own budget.

The **Flows** page is where they live: one card per Flow this project can run.

![The Flows page. Each flow is a card with a bar of its steps colour-coded by kind, counts of its steps and seats, and an Open button. The header reads Flows, with New flow and Import buttons, a project-owned count, and a legend naming the four step colours: Build, Review, Check and Gate. A Draft a flow panel sits below the header.](/media/docs/flows.png)

The bar on a card is that Flow's steps in order, coloured by the job each one does, and the legend names the four: Build writes the change, Review judges it, Check runs commands that pass or fail, Gate stops for a person. So a card gives you a Flow's length and its makeup before you open it, and the counts beside the bar say it in numbers. Nothing on a card names a model, because no Flow step has one.

**Open** takes a Flow into the Flow Builder, which lists every step with its seat. Built-ins load read-only.

Vibestrate ships the `default` flow: plan, architecture, implement, validate, review, verify, with fix and re-validate looping in when review asks for changes. [Workflow](/docs/concepts/workflow) is the canonical description of it, step by step.

## Making one of your own

Write one when the same review steps keep showing up across your tasks, when a kind of change should always pause for your approval at a set point, or when a step needs its own `instructions` - two steps sharing the `reviewer` seat can then read the same diff through different lenses, one on correctness, one on security. To nudge the default a little instead, a clearer task description or a [skill](/docs/concepts/skill) does the job with less effort.

Every route into a new Flow starts on the same page.

<div class="docs-cards">

**Draft a flow**
Describe the steps in plain English and the supervisor proposes a Flow. Drafting writes nothing; **Save this flow** is the step that writes.

**New flow**
A blank definition, straight into the Flow Editor.

**Customize**
On a built-in's card menu. It copies the Flow into your project, and the copy is what you edit.

**Import**
Paste YAML or point at a URL. Validated against the flow schema, refused if it carries secrets.

</div>

Any project Flow opens in the editor from its card menu under **Edit definition**. Every keystroke re-runs the real Flow schema over the whole draft, and each violation is pinned to the step, seat, or field that caused it. Save stays disabled while one stands, and what it saves is the schema's own parsed output, so a Flow that looked valid in the form cannot be refused on the way to disk.

Fields the schema only allows in one shape of Flow appear only there. Adding a step dependency turns the Flow into a graph, which retires `skipWhen` and repeat counts and offers `continueOnError` and retries instead; clearing the last dependency swaps them back. Values belonging to the shape you left are dropped rather than carried into a save the schema would reject.

Saving goes through the same guarded writer as `vibe flows import`: the Action Broker sees a `file.write`, so a project policy that denies file writes stops the editor too.

**Pull a flow**, under the cards, browses the shared hub and installs a community Flow into `.vibestrate/flows/`.

## Choosing the Flow for a run

`defaultFlow` starts unset in a fresh project, so a run with no Flow named gets one decided per task: a short, low-risk task can be sized down to `express`, a risk-tagged one can be upgraded by your supervisor persona, and a brief that reads like "build me a whole system" runs the read-only [Spec-up](/docs/concepts/spec-up) chain first. Every run prints the Flow it resolved and where the choice came from.

<div class="docs-cards">

**You named one**
Picking a Flow in Mission Control's **New run** composer, or passing `--flow`, decides it. Sizing and the persona upgrade do not apply.

**You set a project default**
`defaultFlow` in `project.yml`, or **Set as default** on a card. Setting it also turns sizing off, though a persona can still upgrade the pick.

**You asked for a pick**
`--select` hands the choice to the orchestrator, which reads the task against the available Flows and picks one. It costs a model call.

**Vibestrate picks**
With none of the above, sizing reads the task text and may route it to `express`. It only ever picks the leaner option, and it is structural rather than a model call unless you set `flowSizing: assisted`. Your supervisor persona then gets a look: a task matching one of its risk signals moves to a heavier Flow, never a lighter one.

</div>

Spec-up sits outside all four: it runs before whichever Flow was chosen, and that Flow then runs seeded with the resulting spec. Set `adaptiveSpecUp: off` to stop that.

## The model comes from your Crew

**A Flow step has no model, provider, or profile field.** So "always review on a different vendor" is a Crew setting, not a Flow setting: point the Role that fills the `reviewer` seat at a Profile on another vendor. [Why a human stays in the loop](/docs/getting-started/why-a-human) walks through creating one on a second provider.

A Flow stops at the seat. Everything past that point is yours:

<svg viewBox="0 0 560 52" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A Flow step names a Seat, your Crew's Role fills that Seat, the Role names a Profile, and the Profile names a Provider. The Flow decides only the first link.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="111.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="222.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="333.5" y="0.5" width="116" height="45" rx="8"/>
    <rect x="472.5" y="0.5" width="87" height="45" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="0.5" width="88" height="45" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M92.5 23 H102.5"/>
    <path d="M203.5 23 H213.5"/>
    <path d="M314.5 23 H324.5"/>
    <path d="M453.5 23 H463.5"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="102.5,19.5 108,23 102.5,26.5"/>
    <polygon points="213.5,19.5 219,23 213.5,26.5"/>
    <polygon points="324.5,19.5 330,23 324.5,26.5"/>
    <polygon points="463.5,19.5 469,23 463.5,26.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="44.5" y="19">Flow step</text>
    <text x="155.5" y="19">Seat</text>
    <text x="266.5" y="19">Role</text>
    <text x="391.5" y="19">Profile</text>
    <text x="516" y="19">Provider</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="44.5" y="35">review</text>
    <text x="155.5" y="35">reviewer</text>
    <text x="266.5" y="35">reviewer</text>
    <text x="391.5" y="35">claude-balanced</text>
    <text x="516" y="35">claude</text>
  </g>
</svg>

The Flow writes the first box and names the second. The last three belong to your Crew, and the [Crew](/docs/concepts/crew) page is where you set them. Pin the `reviewer` Role to a Profile there and every Flow you run gets that reviewer; to change one step for one run only, `--step-profile` does it.

## Advanced: CLI and automation

Every Flow action has a command behind it, for scripts and CI. [The CLI overview](/docs/cli/overview) is the whole surface.

```bash
# what this project has, and what a Flow contains
vibe flows list
vibe flows show quality-arbitration

# run one
vibe run "Tighten the auth checks" \
  --flow quality-arbitration
```

`vibe flows hub list` browses the hub and `vibe flows hub install` pulls a Flow into `.vibestrate/flows/`, through the writer the page uses. `vibe flows draft` and `vibe flows derive` print a draft and write nothing; `vibe flows import` adopts one. `vibe flows use` sets the default Flow, `--clear` unsets it.

`--step-profile` swaps the Profile for a single step of a single run. Same Role, different runtime.

```bash
# make the Profile first, then point one step at it
vibe profile add codex-review --provider codex

# review runs on codex-review; every other step
# keeps its Role's own profile
vibe run "Tighten the auth checks" \
  --flow default \
  --step-profile review=codex-review
```

`--step-profile` needs `--flow`, because step ids belong to a named Flow. An id that is not in that Flow is refused before the run starts: `Profile override references unknown Flow step "reveiw".`

## Going deeper

- [Workflow](/docs/concepts/workflow) - the default flow's eight steps, in order.
- [Built-in Flows reference](/docs/reference/flows) - every shipped Flow, step by step, plus parallel review panels and parameters.
- [Add a Flow](/docs/extending/add-flow) - write, validate, and share your own.
- [Seat](/docs/concepts/seat) and [Crew](/docs/concepts/crew) - who fills a Flow's steps, and what they cost.
