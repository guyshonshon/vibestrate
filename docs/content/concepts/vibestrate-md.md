---
title: VIBESTRATE.md
description: A committed manual at your project root that the orchestrator reads before every task, so you never re-explain your project.
section: concepts
slug: concepts/vibestrate-md
---

`VIBESTRATE.md` is a committed file at your project root that tells the orchestrator what this project is and how you like it run. It reads the file before every task, so you never re-explain your project.

<div class="docs-callout">

**The operating manual, not a hard rule.** VIBESTRATE.md is durable, project-aware guidance the orchestrator leans on. It is advisory: it shapes how a run is planned, but it can never override a code-enforced [policy](/docs/concepts/safety).

</div>

## What goes in it

Keep it concise and prune it. Suggested sections, written in plain prose:

```md
# VIBESTRATE.md

## Project Model
What this project is, its domains, architecture boundaries, critical flows.

## Development Commands
Install, test, typecheck, lint, build, run locally - in order.

## Orchestration Preferences
Preferred flows and crews; when to use heavier review; when to stay lean.

## Risk Rules
When to propose sandbox mode, approval gates, isolated execution, extra
validation. (e.g. "propose sandbox mode when a task touches provider execution
or secret/credential paths.")

## Codebase Conventions · Known Constraints · Lessons Learned
```

## How it ranks against other guidance

It is distinct from `.vibestrate/rules.md`, and the precedence is explicit:

| Layer | What it is | Enforced? |
| --- | --- | --- |
| **Policy** (`.vibestrate/policies/`) | Hard, code-enforced gates | Yes - code |
| **`VIBESTRATE.md`** | The orchestrator's operating manual | No - advisory |
| **`.vibestrate/rules.md`** | Per-turn prompt guidance for roles | No - advisory |

`VIBESTRATE.md` is advisory to the orchestrator, its durable project model. It can never override a code-enforced gate.

## Ask it questions

You don't only write to VIBESTRATE.md. You can also ask the orchestrator about your project and get an answer grounded in it. That read-only advisor is [Consult](/docs/concepts/consult).

## The codebase map: machine-owned, not authored

Next to VIBESTRATE.md sits a different kind of memory: `.vibestrate/CODEBASE.md` and `.vibestrate/codebase-map.json`, regenerated on demand by `vibe learn` (and best-effort by `vibe init`). Where VIBESTRATE.md is *your* intent - project model, conventions, lessons - the codebase map is a deterministic scan: stack, scripts, top-level layout, languages, entry points, best-effort HTTP routes, and tooling markers. Nobody writes it by hand; regenerating it (`vibe learn`) always produces the same map from the same repo state, so there is nothing to keep in sync.

The map grounds the planner - injected once per run alongside the project's ledger digest - and Consult, so both reason from the real shape of your project instead of asking you to describe it. Judges (review, verify) stay clean-room and never see it, the same isolation VIBESTRATE.md gets. It refreshes automatically whenever a run reaches a terminal outcome, and marks itself stale in `vibe learn show` when your `HEAD` has moved since it was generated.

```bash
vibe learn                                 # regenerate the map
vibe learn show                            # print the current CODEBASE.md
```

Related: [[consult]], [[safety]], [[configuration]].
