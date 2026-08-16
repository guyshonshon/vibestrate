---
title: Ponytail - the minimalism posture
description: Code-writing agents default to the smallest solution that works - question whether the task needs to exist, reach for the standard library, one line before fifty. On by default.
slug: concepts/ponytail
---

Left alone, a coding agent tends to over-build: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough. **Ponytail** is the posture that pushes back. It injects a "lazy senior dev" ruleset into the agents that write code, so their default is the smallest change that actually works. It is on by default; `vibe config set ponytail false` (or the dashboard config editor) turns it off.

Only the seats that produce a diff see it - the implementer and the fixer. Planners, reviewers, the arbiter and the verifier run without it, so the check on a change stays independent of the posture that wrote it. Minimal is not careless: the correctness rules survive the posture, and every diff still passes the post-turn gate and your review.

## What it makes an agent do

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

**One line before fifty?**
The smallest version that works, not the most general one.

</div>

The result is smaller, less speculative diffs: fewer new files, fewer dependencies, less dead flexibility built "just in case."

## What it will not trade away

The ladder runs *after* the agent understands the problem, not instead of it. The rules it is told never to be lazy about: read the task and trace the real flow first, validate at trust boundaries, handle the errors that would lose data, fix a bug at its root rather than at the caller that reported it, and leave one runnable check behind. Ponytail trims the *speculative* work, not the correctness work.

## Why only the writers

The split mirrors how [reviewLenses](/docs/concepts/supervisor) aim the reviewers and the Spec-up posture aims the planners: each role gets the guidance for *its* job. A reviewer judging whether a change is right must not also be told to make it smaller - that is the writer's job, and the reviewer stays an independent check.

In code the rule is narrow: a model turn at the **executing** stage whose output includes a diff. That is the implementer and the fixer, and nothing else.

## Trust and provenance

The posture is committed project config, never fetched at run time - the same trust class as the rest of your run settings, and every diff still passes the [post-turn gate](/docs/concepts/safety) before it can merge. It is vendored verbatim from the open-source [ponytail skill](https://github.com/DietrichGebert/ponytail) (MIT), so it behaves the same across every provider with no plugin dependency.

## Going deeper

- [[seat]], [[role]] - who fills a Flow's steps; ponytail aims the code-writing ones.
- [[workflow]] - the stages a run moves through, and which seat owns each.
- [[safety]] - the diff gate and review that hold regardless of posture.
