---
title: Flow
description: The recipe a run follows - its ordered steps, and the kind of worker each step needs.
slug: concepts/flow
---

## In simple words

A **Flow** is a recipe. It lists the steps to work through, in order, and says what *kind* of worker each step needs: someone to plan, someone to build, someone to review.

What it never says is *which AI model*. That is the whole point. A flow describes the process; your [[crew]] supplies the people. So a flow a stranger wrote runs on your models, at your budget, without you editing it.

Each slot a step asks for is called a **seat**, and [[seat]] covers those next.

Open **Flows** in the sidebar. Every flow this project can run is a card:

![The Default flow card. A bar of eight coloured blocks shows its steps in order. Below, the description reads: the standard plan, architect, implement, validate, review workflow, review loops back to fix and re-validate until it passes or the bound is hit, then a verify gate decides. Three tiles read 8 steps, 6 seats, v1 version.](/media/docs/scoped/flow-card.png)

That bar is the flow itself, coloured by the job each step does: **Build** writes the change, **Review** judges it, **Check** runs commands that pass or fail, **Gate** stops for a person. You can read a flow's length and shape before opening it.

<div class="docs-callout tip">

**Tip.** Notice nothing on that card names a model. If you want "always review on a different vendor", that is a crew setting, not a flow setting. Flows stay portable precisely because they stop at the seat.

</div>

## When you would write one

Most of the time you should not. A clearer task description or a [[skill]] nudges the default flow with far less effort. Write your own when:

<div class="docs-cards">

**The same review keeps repeating**
You add the same two checks to every task by hand. Put them in a flow once.

**A change should always pause**
Anything touching migrations stops for your approval at a set point, every time.

**One step needs its own brief**
Two steps can share the `reviewer` seat and read the same diff through different lenses, one for correctness, one for security.

**You want to share it**
A flow is a YAML file. It travels to a teammate, or to the hub, and still runs on their crew.

</div>

<div class="docs-callout">

**Did you know?** Vibestrate ships eleven flows, not one. `default` is the eight-step workflow above; `express` is a single implementer turn for small, low-risk work; `plan-only` writes no code at all. You do not have to write a flow to get a different shape of run.

</div>

## Which flow does a run use

`defaultFlow` starts unset, so a run with no flow named gets one decided per task. Every run prints the flow it resolved and where the choice came from.

<div class="docs-cards">

**You named one**
Picking a flow in the **New run** composer, or passing `--flow`, decides it. Sizing and the persona upgrade do not apply.

**You set a project default**
`defaultFlow` in `project.yml`, or **Set as default** on a card. Setting it also turns sizing off, though a persona can still upgrade the pick.

**You asked for a pick**
`--select` hands the choice to the orchestrator, which reads the task against the available flows. It costs a model call.

**Vibestrate picks**
With none of the above, sizing reads the task text and may route it to `express`. It only ever picks the leaner option, and it is structural rather than a model call unless you set `flowSizing: assisted`. Your supervisor persona then gets a look: a task matching one of its risk signals moves to a heavier flow, never a lighter one.

</div>

Spec-up sits outside all four. It runs *before* whichever flow was chosen, and that flow then runs seeded with the resulting spec. Naming a flow with `--flow` does not skip it, since that flow is what spec-up builds afterwards. Pass `--no-select` to skip it for one run, or set `adaptiveSpecUp: off` to stop it entirely.

## Going deeper

### Where the model actually comes from

**A flow step has no model, provider, or profile field.** A flow stops at the seat, and everything past that point is yours:

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

The flow writes the first box and names the second. The last three belong to your crew. Pin the `reviewer` role to a profile there and every flow you run gets that reviewer; to change one step for one run only, `--step-profile` does it.

### Making one

<div class="docs-cards">

**Draft a flow**
Describe the steps in plain English and the supervisor proposes one. Drafting writes nothing; **Save this flow** is the step that writes.

**New flow**
A blank definition, straight into the Flow Editor.

**Customize**
On a built-in's card menu. It copies the flow into your project, and the copy is what you edit.

**Import**
Paste YAML or point at a URL. Validated against the flow schema, refused if it carries secrets.

</div>

Every keystroke in the editor re-runs the real flow schema over the whole draft, and each violation is pinned to the step, seat or field that caused it. Save stays disabled while one stands, and what it saves is the schema's own parsed output, so a flow that looked valid in the form cannot be refused on the way to disk.

Fields the schema only allows in one shape of flow appear only there. Adding a step dependency turns the flow into a graph, which retires `skipWhen` and repeat counts and offers `continueOnError` and retries instead; clearing the last dependency swaps them back. Values belonging to the shape you left are dropped rather than carried into a save the schema would reject.

Saving goes through the same guarded writer as `vibe flows import`, so the Action Broker sees a `file.write` and a project policy that denies file writes stops the editor too.

### From the CLI

```bash
# what this project has, and what a flow contains
vibe flows list
vibe flows show quality-arbitration

# run one
vibe run "Tighten the auth checks" \
  --flow quality-arbitration
```

`vibe flows hub list` browses the hub and `vibe flows hub install` pulls one into `.vibestrate/flows/`. `vibe flows draft` and `vibe flows derive` print a draft and write nothing; `vibe flows import` adopts one. `vibe flows use` sets the default flow, `--clear` unsets it.

`--step-profile` swaps the profile for a single step of a single run. Same role, different runtime:

```bash
vibe profile add codex-review --provider codex

vibe run "Tighten the auth checks" \
  --flow default \
  --step-profile review=codex-review
```

It needs `--flow`, because step ids belong to a named flow. An id that is not in that flow is refused before the run starts: `Profile override references unknown Flow step "reveiw".`

Next: [[workflow]] walks the eight steps of the default flow, one at a time.
