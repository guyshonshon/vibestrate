---
title: Flow
description: The recipe a run follows - its ordered steps, and the kind of worker each step needs.
slug: concepts/flow
---

A **Flow** is a recipe: the ordered steps a run works through, and the *kind* of worker each step needs. It names seats - "this step needs an implementer", "this one needs a reviewer" - and it never names an AI model. Your [Crew](/docs/concepts/crew) supplies the workers. That is what lets you run a Flow someone else wrote with your own models and your own budget.

**A Flow step has no model, provider, or profile field.** So "always review on a different vendor" is a Crew setting, not a Flow setting: point the Role that fills the `reviewer` seat at a Profile on another vendor. To change one step for one run only, pass `--step-profile review=` followed by a Profile id you have already defined. [Why a human stays in the loop](/docs/getting-started/why-a-human) walks through creating one on a second provider.

Vibestrate ships the `default` flow: plan, architecture, implement, validate, review, verify, with fix and re-validate looping in when review asks for changes. [Workflow](/docs/concepts/workflow) is the canonical description of it, step by step.

There is no "the default one unless you choose another". `defaultFlow` is unset in a fresh project, so with no `--flow` Vibestrate decides per task: a short, low-risk task can be sized down to `express`, a risk-tagged one can be upgraded by your supervisor persona, and a brief that reads like "build me a whole system" runs the read-only [Spec-up](/docs/concepts/spec-up) chain first. Every run prints the Flow it resolved and where the choice came from.

## Which Flow a run picks

<div class="docs-cards">

**You named one**
`--flow` decides it. Sizing and the persona upgrade do not apply.

**You set a project default**
`defaultFlow` in `project.yml`. Setting it also turns sizing off, though a persona can still upgrade the pick.

**You asked for a pick**
`--select` hands the choice to the orchestrator, which reads the task against the available Flows and picks one. It costs a model call.

**Vibestrate picks**
With none of the above, sizing reads the task text and may route it to `express`. It only ever picks the leaner option, and it is structural rather than a model call unless you set `flowSizing: assisted`. Your supervisor persona then gets a look: a task matching one of its risk signals moves to a heavier Flow, never a lighter one.

</div>

Spec-up sits outside all four: it runs before whichever Flow was chosen, and that Flow then runs seeded with the resulting spec. Set `adaptiveSpecUp: off` to stop that.

## Picking one yourself

```bash
vibe flows list                            # what is available in this project
vibe flows show quality-arbitration        # its steps and seats
vibe run "Tighten the auth checks" --flow quality-arbitration
```

Vibestrate ships a handful of built-in Flows. You can also install one from the shared **hub**: `vibe flows hub list` browses it, and `vibe flows hub install` pulls a Flow into `.vibestrate/flows/`. [Browse the built-in Flows →](/docs/reference/flows)

## Where the model actually comes from

A Flow stops at the seat. Everything past that point is yours:

```text
  Flow step "review"
        │  declares the seat it needs
        ▼
  seat "reviewer"
        │  your Crew has a Role that fills it
        ▼
  Role "reviewer"
        │  the Role names a Profile
        ▼
  Profile "codex-review"  ─▶  provider + model
```

<div class="docs-cards">

**Pinned in your Crew, for good**
Point the Role that fills the `reviewer` seat at a Profile on another vendor, and every Flow you run gets that reviewer.

**Pinned for one run, with `--step-profile`**
`--step-profile stepId=profileId` swaps the Profile for a single step. Same Role, different runtime.

</div>

```bash
# one-off: make the Profile first, then point one step at it
vibe profile add codex-review --provider codex

# review runs on codex-review; every other step keeps its Role's own profile
vibe run "Tighten the auth checks" --flow default --step-profile review=codex-review
```

`--step-profile` needs `--flow`, because step ids belong to a named Flow. An id that is not in that Flow is refused before the run starts: `Profile override references unknown Flow step "reveiw".`

## When it's worth writing your own

<div class="docs-cards">

**A routine keeps repeating**
The same review steps show up across your tasks, so you bottle them once.

**A change needs a gate**
A certain kind of change should always pause for your approval at a set point.

**One step needs its own instruction**
A step can carry `instructions`, so two steps sharing the `reviewer` seat read the same diff through different lenses - one on correctness, one on security.

</div>

If you only want to nudge the default a little, a clearer task description or a [skill](/docs/concepts/skill) usually does the job with less effort.

## Editing a Flow from the dashboard

The Flows page has a **Flow Editor**: **New flow** starts a blank one, and any project Flow opens in it from its card menu under **Edit definition**. Built-in Flows are read-only - **Customize** copies one into your project first, and the copy is what you edit.

Every keystroke re-runs the real Flow schema over the whole draft, and each violation is pinned to the step, seat, or field that caused it. Save stays disabled while one stands, and what it saves is the schema's own parsed output - so a Flow that looked valid in the form cannot be refused on the way to disk.

Fields the schema only allows in one shape of Flow appear only there. Adding a step dependency turns the Flow into a graph, which retires `skipWhen` and repeat counts and offers `continueOnError` and retries instead; clearing the last dependency swaps them back. Values belonging to the shape you left are dropped rather than carried into a save the schema would reject.

Saving goes through the same guarded writer as `vibe flows import`: the Action Broker sees a `file.write`, so a project policy that denies file writes stops the editor too.

## Going deeper

- [Workflow](/docs/concepts/workflow) - the default flow's eight steps, in order.
- [Built-in Flows reference](/docs/reference/flows) - every shipped Flow, step by step, plus parallel review panels and parameters.
- [Add a Flow](/docs/extending/add-flow) - write, validate, and share your own.
- [Seat](/docs/concepts/seat) and [Crew](/docs/concepts/crew) - who fills a Flow's steps, and what they cost.
