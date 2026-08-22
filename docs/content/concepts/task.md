---
title: Task
description: The plain-language brief you hand Vibestrate. You type it into the New run composer on Mission Control, and every run ends at one of four outcomes.
slug: concepts/task
---

A Task is what you want done, written in plain language, the way you would brief a capable colleague. You say what you want. Vibestrate works out the steps.

You write one on Mission Control. `vibe ui` opens the dashboard on localhost, and the New run composer is the first thing on it.

![Mission Control. A sidebar of sections runs down the left. The header reads Mission control, with an approvals tile showing Clear under the caption Nothing blocked and an Edit layout button. A New run composer and a Run summary panel sit below, and the Supervisor chat fills the right column, its mode switch set between Answers only and Answers and acts.](/media/docs/mission-control.png)

The box at the top of New run is the Task, and a sentence is enough to launch. Everything under it is optional: the flow, the crew, the supervisor persona, and toggles for a read-only or unattended run. The Run summary beside it reads back what's about to start, so you see the shape of the run before you commit, and the Supervisor panel answers questions about the project while you write, in either of its two tones, Answers only or Answers and acts.

You don't list files or set an order. The [Flow](/docs/concepts/flow) decides the steps and your [Crew](/docs/concepts/crew) does the work. The Task is the brief.

A Task becomes a *run*, and a run ends at one of four outcomes: `merge_ready`, `blocked`, `failed`, or `aborted`. It never pushes and never merges. The diff is yours to land.

## The path a Task takes

A run is one supervised process you can watch and audit. In order, the orchestrator:

<div class="docs-flow">
<div><b>Reads your project</b><span>Language, package manager, and the validation commands it will trust later.</span></div>
<div><b>Picks Flow and Crew</b><span>The Flow you named, or the one Vibestrate resolves, with its seats matched to your Crew's roles.</span></div>
<div><b>Opens a clean workspace</b><span>A fresh git worktree, so nothing touches your real project until you say so.</span></div>
<div><b>Drives the steps</b><span>On the default Flow: plan, architecture, implement, validate, review, verify, with fix and re-validate looping in when review asks for changes.</span></div>
<div><b>Stops at a verdict</b><span>The run ends in its worktree with a diff. Landing it is a separate, deliberate step.</span></div>
</div>

### The four outcomes

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is ready for you to keep.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>It needs a decision from you.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something went wrong mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped it.</span></div>
</div>

Every prompt, output, metric, and decision is written under `.vibestrate/runs/`, in a directory named for the run (ids are `adjective-noun`, like `bold-lovelace`), so a finished run reads back as a record, not a black box. See [Run state](/docs/concepts/state) for the status list and [Workflow](/docs/concepts/workflow) for the step-by-step path.

## The Task is the yardstick

The description goes into every agent's prompt, at every stage. The planner plans from it. The executor builds from it. The reviewer checks the result against it. One sentence is what the run measures itself against.

<div class="docs-callout">

**Plausible in, plausible-but-wrong out.** A vague Task produces a vague plan, and the reviewer then approves that plan, because it's checking against the same vague brief. Tighten the Task and the whole chain sharpens.

</div>

A Task says what to build, and it doesn't pick your model or set how hard it thinks. That belongs to your [Crew](/docs/concepts/crew) and its [Profiles](/docs/concepts/profile).

## A good Task vs a weak one

Same goal, two briefs.

<div class="docs-cards">

**A good Task**
Names the file, names the library, states the constraint up front. The planner gets a concrete anchor, and the reviewer gets a real bar to check against.

**A weak Task**
The planner guesses. The reviewer critiques its own guess. You get a diff that is plausible and probably wrong.

</div>

A good Task:

```text
Add structured logging to the settings save handler in
src/server/routes/settings.ts. Use the existing logger from
src/lib/logger.ts. Include the user id and the changed keys,
but never the values.
```

A weak Task:

```text
Improve logging
```

## Checklists: break a Task into items

A Task can hold an ordered checklist of items, the concrete breakdown of the work. Items live inside the card, so the context stays in one place instead of scattering across small cards.

The checklist sits on the task detail page in [Mission Control](/docs/cli/dashboard): add an item, check it off, edit it, drag to reorder, remove it. Each item carries a status: `pending`, `in_progress`, `done`, or `blocked`.

To draft a checklist instead of writing one by hand, run the Enhance [assist](/docs/glossary#assist) from the card. It's one-shot and read-only: it proposes an ordered breakdown and you decide whether to add it. The model never writes to the board on its own.

### Open a step

A checklist entry is a step - a unit of work in its own right, not just a line of text. Open one from the checklist to get its detail drawer: the step's own authoring (title, and for supervised tasks its objective, acceptance check, and file hints), its status, the run and one-line outcome that executed it, and a comment thread scoped to that step.

The parent task owns the shared scaffolding - the [context](/docs/concepts/task#context) every run is grounded in, the [Crew](/docs/concepts/crew) that does the work, the git branch, and any blocking tasks. The step drawer shows those as **inherited from the parent**, read-only, because a checklist runs in one worktree on one branch: every step shares one container. To change them, edit the parent. A plain task's step has no per-step run of its own (a plain task runs holistically); its run and outcome appear once you run the task supervised.

Opening a step is distinct from **detaching** it. Detach (the old "promote") spins a step off into its own independent card with `derivedFrom` pointing back - a separate, deliberate action for when a piece of work has outgrown the checklist.

## Pick up: run the whole checklist

Once a Task has a checklist, **Run checklist** on the card works every item in one worktree, labelled with the count of items still pending. Under the hood this runs the built-in `pickup` [flow](/docs/concepts/flow):

<svg viewBox="0 0 560 96" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A pickup run plans once for the whole checklist, then runs a micro-plan and implement band once per item with its own commit, then reviews once at the end.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="12.5" width="140" height="46" rx="8"/>
    <rect x="180.5" y="12.5" width="200" height="46" rx="8"/>
    <rect x="420.5" y="12.5" width="139" height="46" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M147 35 H165"/>
    <path d="M387 35 H405"/>
    <path d="M360 59 C360 82 200 82 200 59"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="165,31.5 170.5,35 165,38.5"/>
    <polygon points="405,31.5 410.5,35 405,38.5"/>
    <polygon points="195.5,67 204.5,67 200,59"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="70.5" y="31">plan</text>
    <text x="280.5" y="31">micro-plan + implement</text>
    <text x="490" y="31">review</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="70.5" y="46">once, holistic</text>
    <text x="280.5" y="46">per item, own commit</text>
    <text x="490" y="46">once, holistic</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="280" y="92">next item</text>
  </g>
</svg>

Each item commits on its own, stamped with the item id so it can be reverted alone. A compact summary of each finished item carries forward, so later items have context without re-reading every diff. Status and commit sha are written back as the run goes. Execution is linear and stops on the first failing item.

### Per-item review: the `pickup-review` flow

For higher-stakes checklists, pick `pickup-review` in place of the default `pickup`. It adds a review panel and an arbiter inside the per-item band: after the implementer writes each item, the panel reviews that item's diff in isolation, and a bounded per-item fix loop runs before the item commits.

**Configurable lenses.** The panel runs two lenses by default: `correctness` (logic, type-safety, edge cases) and `security-risk` (injection, auth gaps, data exposure), both aimed at the active persona if one is set. You can change which lenses review each item: set `checklistReview.lenses` on the flow, or `checklistReviewLenses` on a crew (precedence: crew > flow > default). The lens vocabulary is closed:

<div class="docs-chips"><span>correctness</span><span>tests</span><span>security-risk</span><span>authz</span><span>secrets</span><span>injection</span><span>ux-ia</span><span>accessibility</span><span>visual-consistency</span><span>performance</span></div>

Each selected lens becomes one read-only reviewer per item (up to the parallel fan-out limit of 4 lenses per panel), and the arbiter weighs them all.

**Cost.** Each item runs the panel independently: two reviewer turns and one arbiter turn per item, on top of the normal implement band. For a 10-item checklist that is 30 extra turns. Use `pickup-review` when correctness per item matters more than speed.

**Cap-and-continue.** If an item's fix loop ends with findings still open, the run continues (it never hard-aborts a checklist mid-stream), but that item is flagged as not merge-ready. The gap is surfaced item by item in the dashboard verdict panel, and in `vibe assurance` and `vibe audit`. A run that ends with any open-findings item cannot reach `merge_ready` until the gap is resolved. Nothing passes without a flag.

Each item keeps its own arbitration ledger, so findings from item 3 never bleed into item 7.

## "Needs testing": when a human should look

A reviewer or verifier can end a run with a non-blocking advisory: the change is fine to ship, but a human should eyeball something a model cannot perceive, like layout, animation, or UX feel. The run still reaches a normal verdict; it is not stuck like an [approval gate](/docs/glossary#approval-gate). The card is flagged Needs testing with a one-line reason. Resolve it with a verdict: "Looks good" marks the Task Done, "Needs work" reopens it. The flag shows as a banner on the task and a badge on the board.

A checklist step is a piece of what to build, a unit of work inside the Task. A Flow step (plan, implement, review) is filled by a [seat](/docs/concepts/seat) and structures the run. Same word, different layer: a checklist step is *what* to build, a Flow step is *how* a run is structured.

## Practical tips

- **One outcome per Task.** Two unrelated changes make the review noisy and the diff hard to ship.
- **Name the surface.** A file path, a module, a feature flag. Give the planner an anchor.
- **State the constraint.** If "don't touch X" matters, say so in the Task, not after the diff lands.
- **Put stable context in skills.** Conventions, security rules, and domain language belong in [skills](/docs/concepts/skill), not in every prompt.

## Advanced: CLI and automation

Every action above has a command behind it, for scripts, CI, and terminal habits. See the [CLI overview](/docs/cli/overview) for the full surface.

Start a run from a brief:

```bash
vibe run "Add structured logging to the \
settings save handler"
```

Work a checklist:

```bash
vibe tasks checklist add <taskId> \
  "/health returns json"
vibe tasks checklist list <taskId>

# mark one done
vibe tasks checklist check <taskId> <itemId>

# or give it another status
vibe tasks checklist status <taskId> <itemId> \
  in_progress

# reorder, 1-based
vibe tasks checklist move <taskId> <itemId> 1
```

Draft the breakdown with an assist:

```bash
# read-only: prints a proposed checklist
vibe tasks enhance <taskId>

# append the proposed items
vibe tasks enhance <taskId> --apply
```

Run the whole checklist:

```bash
# continuous: items back-to-back
vibe tasks pickup <taskId>

# pause between items for review
vibe tasks pickup <taskId> --step

# per-item review panel + arbiter
vibe tasks pickup <taskId> --flow pickup-review
```

`--flow` accepts only checklist-aware flows, the ones that declare a per-item
segment (default `pickup`). Anything else is rejected with the list of eligible
flows.

The long form, to set other run options at the same time:

```bash
vibe run "<task title>" \
  --task <taskId> \
  --flow pickup-review \
  --checklist continuous
```

## Related

- [Flow](/docs/concepts/flow) - the recipe a Task runs through.
- [Workflow](/docs/concepts/workflow) - the default Flow's eight steps, in order.
- [Run state](/docs/concepts/state) - the statuses a Task accumulates.
- [Worktree](/docs/concepts/worktree) - where a Task's edits live before you merge.
