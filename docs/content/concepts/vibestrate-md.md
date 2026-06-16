---
title: VIBESTRATE.md & Consult
description: A committed manual the orchestrator reads about your project, plus a read-only advisor you can ask anything.
section: concepts
slug: concepts/vibestrate-md
---

Vibestrate is growing a **responsible orchestrator**: a project-aware supervisor that reads your project before it acts, and that you can talk to. Two pieces land first, and they answer two different needs.

<div class="docs-cards">

**VIBESTRATE.md is the operating manual.**
A committed file at your project root that tells the orchestrator what this project is and how you like it run. It reads it before every task, so you never re-explain your project.

**Consult is the CTO you can just ask.**
A read-only advisor that knows your real project. Ask it anything - which flow to use, why a run blocked, what is left - and it answers from evidence. It recommends, it never acts.

</div>

<div class="docs-callout">

**An advisor, not an actor.** Consult is the senior voice you can pull aside mid-build. It reads your project, weighs the trade-offs, and tells you what it would do - then stops. It starts no runs, writes no files, and changes nothing. The decision stays yours.

</div>

## VIBESTRATE.md

A `VIBESTRATE.md` file at your project root (normally committed) is the orchestrator's durable **operating manual**: what this project is and how you like it run. Keep it concise and prune it. Suggested sections, written in plain prose, are a project model (what this project is, its domains, architecture boundaries, critical flows), the development commands in order (install, test, typecheck, lint, build, run locally), your orchestration preferences (which flows and crews to favor, when to use heavier review, when to stay lean), risk rules (when to propose sandbox mode, approval gates, isolated execution, or extra validation), and a catch-all for codebase conventions, known constraints, and lessons learned:

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

`VIBESTRATE.md` is *advisory to the orchestrator* - its durable project model. It can never override a code-enforced gate.

## Consult

Ask the orchestrator a question and get an answer grounded only in your project's real context. It is read-only: it recommends, it never acts.

```bash
vibe consult "Should this auth refactor use a heavier review flow?"
vibe consult "Why did the last run block?" --run <runId>
vibe consult "What's left here?" --task <taskId>
vibe consult "..." --file src/server/routes/consult.ts
```

In the dashboard, the **Consult** button (top bar) opens the same thing.

Consult is **not** a generic chatbot. It answers only from *controlled* project context: `VIBESTRATE.md`, your `project.yml` (providers, profiles, crews, policies), recent run outcomes and validation evidence, agent-visible annotations, and - when you pass them - a task, a run, or selected files. All of it is read-only, path-guarded, secret-redacted, and bounded.

It is **honest about its verification boundary.** Because the orchestrator is itself a model, an answer states a **confidence** and lists **caveats** - the things it could not verify from the evidence - instead of presenting model confidence as fact. It may recommend actions (start a run, pick a flow, request sandbox mode) and, when it has an evidence-backed improvement, **propose** a `VIBESTRATE.md` update. A proposal is **never auto-applied** - it's saved for review, and a human applies it explicitly (`vibe guide apply <id>`, or the **Apply** button on the consult card). Applying appends the reviewed text to the manual through a guarded writer (Action Broker `file.write`, path-guarded, and **refused** if the content carries secret-shaped tokens), so you review the diff before committing.

Consult runs through the same read-only **assist** path as the rest of Vibestrate: broker-gated, no worktree, no writes. Its evidence is audited under `runs/consult/`.

## Surfaces

- **CLI:** `vibe consult "<question>" [--task <id>] [--run <id>] [--file <path>] [--json]`; manage the guide with `vibe guide init | show | proposals | apply <id> | reject <id>`.
- **Shell:** type `consult "<question>"` at the command prompt.
- **API:** `POST /api/consult`; `GET /api/vibestrate`, `POST /api/vibestrate/init`, `GET /api/vibestrate/proposals`, `POST /api/vibestrate/proposals/:id/apply|reject`.
- **Web:** the **Consult** top-bar button, with Apply/Dismiss on a proposed update.

Related: [[safety]], [[configuration]], [[crew]], [[profile]].
