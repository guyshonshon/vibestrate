---
title: Consult
description: A read-only advisor that knows your real project. Ask it anything - it recommends, it never acts.
slug: concepts/consult
---

**Consult** is the senior voice you can pull aside mid-build. Ask the orchestrator a question and get an answer grounded only in your project's real context. It is read-only: it recommends, it never acts. It reads your project, weighs the trade-offs, and tells you what it would do, then stops - the decision stays yours.

For a conversation that persists, and that can act on what you say when you allow it, see [Supervisor Control](concepts/supervisor-control). Consult stays the one-shot, always-read-only way in.

## Ask it anything

```bash
vibe consult "Should this auth refactor use a heavier review flow?"
vibe consult "Why did the last run block?" --run <runId>
vibe consult "What's left here?" --task <taskId>
vibe consult "..." --file src/server/routes/consult.ts
```

In the dashboard, the orb at the bottom-right opens the same thing from any screen.

## It only sees your project

Consult is not a generic chatbot. It answers only from *controlled* project context: your `VIBESTRATE.md`, your `project.yml` (providers, profiles, crews, policies), recent run outcomes and validation evidence, agent-visible annotations, and, when you pass them, a task, a run, or selected files. All of it is read-only, path-guarded, secret-redacted, and bounded.

## It can see the screen you asked from

Some screens hand the orb a snapshot of what you are looking at, so you can ask about the thing in front of you instead of describing it again. The **New run** composer publishes the brief you have typed, the flow and crew you picked, the run options, and any planner questions still on screen; the spec-up questions screen publishes the round and your answers so far.

The snapshot is a typed projection of state the dashboard already holds, never a screenshot or a scrape of the page, and its text is secret-redacted server-side before it reaches a provider. Screens that publish nothing leave the orb exactly as it was: grounded in the project alone.

## It is honest about what it can't verify

Because the orchestrator is itself a model, an answer states a **confidence** and lists **caveats** - the things it could not verify from the evidence - instead of presenting model confidence as fact.

It may recommend actions (start a run, pick a flow, request sandbox mode) and, when it has an evidence-backed improvement, **propose** a `VIBESTRATE.md` update.

<div class="docs-callout">

**A proposal is never auto-applied.** It is saved for review, and a human applies it explicitly (`vibe guide apply <id>`, or the **Apply** button on the consult card). Applying appends the reviewed text to the manual through a guarded writer (Action Broker `file.write`, path-guarded, and refused if the content carries secret-shaped tokens), so you review the diff before committing.

</div>

Consult runs through the same read-only **assist** path as the rest of Vibestrate: broker-gated, no worktree, no writes. Its evidence is audited under `runs/consult/`.

## Surfaces

<div class="docs-cards">

**CLI**
`vibe consult "<question>" [--task <id>] [--run <id>] [--file <path>] [--json]`. Manage the guide with `vibe guide init | show | proposals | apply <id> | reject <id>`.

**Shell**
Type `consult "<question>"` at the command prompt.

**API**
`POST /api/consult`; `GET /api/vibestrate`, `POST /api/vibestrate/init`, `GET /api/vibestrate/proposals`, `POST /api/vibestrate/proposals/:id/apply|reject`.

**Web**
The **Consult** top-bar button, with Apply or Dismiss on a proposed update.

</div>

Related: [[vibestrate-md]], [[supervisor]], [[safety]].
