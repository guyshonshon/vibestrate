---
title: Ponytail minimalism
description: The posture that stops an agent over-building - smallest change that actually works.
slug: concepts/ponytail
---

## In simple words

Left alone, a coding agent over-builds: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough.

**Ponytail** is the posture that pushes back. It injects a "lazy senior dev" ruleset into the agents that write code, so their default is the smallest change that actually works.

It is on by default, and it is one switch: the `ponytail` row under **General** on the dashboard's **Config** page, or from a terminal:

```bash
vibe config set ponytail false
```

<div class="docs-callout tip">

**Tip.** Only the seats that produce a diff see it - the implementer and the fixer. Planners, reviewers, the arbiter and the verifier run without it, so the check on a change stays independent of the posture that wrote it.

</div>

## What it changes

<div class="docs-cards">

**Fewer dependencies**
Standard library before a package, native platform feature before a library.

**Fewer abstractions**
No interface with one implementation, no config for a value that never varies.

**Smaller diffs**
A one-line bug does not earn a refactor.

**Questions the task**
Sometimes the smallest change that works is no change.

</div>

<div class="docs-callout">

**Did you know?** Minimal is not careless. The correctness rules survive the posture, and every diff still passes the post-turn gate and your review. Ponytail changes what an agent reaches for first, not what it is allowed to skip.

</div>


## Going deeper

### What it makes an agent do

Before writing code, a ponytail agent climbs a ladder and stops at the first rung that answers the problem:

<div class="docs-cards">

**Does this need to exist?**
The cheapest code is the code you don't write. Question the task itself before building it.

**Is it already here?**
Reach for something in the codebase before adding anything new.

**Standard library?**
Prefer what the language already ships over a new helper.

**Native feature?**
Prefer a platform or framework feature over a dependency.

**Already installed?**
Solve it with a dependency the project has before adding one it doesn't.

**Can this be one line?**
If it can, make it one line.

**Only then, write it**
The minimum code that works, not the most general version of it.

</div>

### What it will not trade away

The ladder runs *after* the agent understands the problem, not instead of it. What it is told never to be lazy about: read the task and the code it touches and trace the real flow end to end before picking a rung, validate at trust boundaries, handle the errors that would lose data, fix a bug at its root rather than at the caller that reported it, and leave one runnable check behind. Ponytail trims the *speculative* work, not the correctness work.

### Why only the writers

The split mirrors how [reviewLenses](/docs/concepts/supervisor) aim the reviewers and the Spec-up posture aims the planners: each role gets the guidance for *its* job. A reviewer judging whether a change is right must not also be told to make it smaller - that is the writer's job.

In code the rule is narrow: a model turn at the **executing** stage whose output includes a diff. That is the implementer and the fixer, and nothing else.

<svg viewBox="0 0 560 118" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The implementer and the fixer see the ponytail posture; the planner, reviewer, arbiter and verifier never see it, so the check on a change stays independent of the posture that wrote it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="24" width="262" height="88" rx="8"/>
    <rect x="297" y="24" width="262" height="88" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="132" y="15">sees the posture</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="132" y="58">implementer</text>
    <text x="132" y="86">fixer</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="428" y="15">never sees the posture</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="428" y="58">planner   reviewer</text>
    <text x="428" y="86">arbiter   verifier</text>
  </g>
</svg>

### Trust and provenance

The posture is committed project config, never fetched at run time - the same trust class as the rest of your run settings, and every diff still passes the [post-turn gate](/docs/concepts/safety) before it can merge. It is vendored verbatim from the open-source [ponytail skill](https://github.com/DietrichGebert/ponytail) (MIT), so it behaves the same across every provider with no plugin dependency.

### Related

- [[seat]], [[role]] - who fills a Flow's steps; ponytail aims the code-writing ones.
- [[workflow]] - the stages a run moves through, and which seat owns each.
- [[safety]] - the diff gate and review that hold regardless of posture.
