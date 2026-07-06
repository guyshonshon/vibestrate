---
title: Ponytail - the minimalism posture
description: Code-writing agents default to the smallest solution that works - question whether the task needs to exist, reach for the standard library, one line before fifty. On by default.
section: concepts
slug: concepts/ponytail
---

Left alone, a coding agent tends to over-build: a helper class where a function would do, a dependency where the standard library was fine, fifty lines where one was enough. **Ponytail** is the posture that pushes back. It injects a "lazy senior dev" ruleset into the agents that write code, so their default is the smallest change that actually works.

<div class="docs-callout">

**On by default.** Ponytail is the built-in backbone behavior for code-writing agents - you don't turn it on. Turn it off with `vibe config set ponytail false` (or the dashboard config editor) if you'd rather they not self-restrain.

</div>

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

**One line before fifty?**
The smallest version that works, not the most general one.

</div>

The result is smaller, less speculative diffs: fewer new files, fewer dependencies, less dead flexibility built "just in case."

## The guards stay on

Minimal does not mean careless. The hard rules survive the posture: understand the problem before touching it, validate at trust boundaries, fail fast on bad input, and leave one runnable check behind. Ponytail trims the *speculative* work, not the correctness work.

## Only the code-writers see it

Ponytail is aimed narrowly at the seats that produce a diff - the **implementer** and **fixer** (model turns at the executing stage that edit the worktree). The agents that judge or plan the work never see it:

<div class="docs-chips"><span>implementer: ponytail on</span><span>fixer: ponytail on</span><span>planner / architect: no</span><span>reviewer / arbiter: no</span><span>verifier: no</span></div>

That split is deliberate. It mirrors how [reviewLenses](concepts/supervisor) aim the reviewers and the Spec-up posture aims the planners: each role gets the guidance for *its* job. A reviewer judging whether the change is right must not also be told to make it smaller - that's the writer's job, and the reviewer stays an independent check.

## Trust and provenance

The posture is committed project config, never fetched at run time - the same trust class as the rest of your run settings, and every diff still passes the [post-turn gate](concepts/safety) and your review before it can merge. It is vendored verbatim from the open-source [ponytail skill](https://github.com/DietrichGebert/ponytail) (MIT), so it behaves the same across every provider with no plugin dependency.

## Going deeper

- [[seat]], [[role]] - who fills a Flow's steps; ponytail aims the code-writing ones.
- [[workflow]] - the stages a run moves through, and which seat owns each.
- [[safety]] - the diff gate and review that hold regardless of posture.
