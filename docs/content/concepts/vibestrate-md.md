---
title: VIBESTRATE.md & Consult
description: The project's operating manual the orchestrator reads, and a read-only, project-aware advisor you can ask anything.
section: concepts
slug: concepts/vibestrate-md
---

# VIBESTRATE.md & Consult

## Basically

Vibestrate is growing a **responsible orchestrator** - a project-aware supervisor
that reads your project before it acts, and that you can talk to. Two pieces of
that land first:

- **`VIBESTRATE.md`** - a concise, committed operating manual at your project
  root. It is what the orchestrator reads to understand the project.
- **Consult** - ask the orchestrator a question and get an answer grounded only
  in your project's real context. It is read-only: it recommends, it never acts.

## VIBESTRATE.md

A root-level `VIBESTRATE.md` (normally committed) is the orchestrator's durable
**operating manual**. Keep it concise; prune it. Suggested sections:

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

It is **distinct** from `.vibestrate/rules.md`, and the precedence is explicit:

| Layer | What it is | Enforced? |
| --- | --- | --- |
| **Policy** (`.vibestrate/policies/`) | Hard, code-enforced gates | Yes - code |
| **`VIBESTRATE.md`** | The orchestrator's operating manual | No - advisory |
| **`.vibestrate/rules.md`** | Per-turn prompt guidance for roles | No - advisory |

`VIBESTRATE.md` is *advisory to the orchestrator* - its durable project model. It
can never override a code-enforced gate.

## Consult

```bash
vibe consult "Should this auth refactor use a heavier review flow?"
vibe consult "Why did the last run block?" --run <runId>
vibe consult "What's left here?" --task <taskId>
vibe consult "..." --file src/server/routes/consult.ts
```

In the dashboard, the **Consult** button (top bar) opens the same thing.

Consult is **not** a generic chatbot. It answers only from *controlled* project
context: `VIBESTRATE.md`, your `project.yml` (providers, profiles, crews,
policies), recent run outcomes and validation evidence, agent-visible
annotations, and - when you pass them - a task, a run, or selected files. All of
it is read-only, path-guarded, secret-redacted, and bounded.

It is **honest about its verification boundary.** Because the orchestrator is
itself a model, an answer states a **confidence** and lists **caveats** - the
things it could not verify from the evidence - instead of presenting model
confidence as fact. It may recommend actions (start a run, pick a flow, request
sandbox mode) and, when it has an evidence-backed improvement, **propose** a
`VIBESTRATE.md` update - but a proposal is shown, not applied.

Consult runs through the same read-only **assist** path as the rest of Vibestrate:
broker-gated, no worktree, no writes. Its evidence is audited under
`runs/consult/`.

## Surfaces

- **CLI:** `vibe consult "<question>" [--task <id>] [--run <id>] [--file <path>] [--json]`.
- **Shell:** type `consult "<question>"` at the command prompt.
- **API:** `POST /api/consult` `{ question, taskId?, runId?, files? }`.
- **Web:** the **Consult** top-bar button.

Related: [[safety]], [[configuration]], [[crew]], [[profile]].
