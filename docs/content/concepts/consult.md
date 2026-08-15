---
title: Consult
description: An advisor that knows your real project. Ask it anything - it answers, and the most it can leave behind is a proposal waiting on you.
slug: concepts/consult
---

**Consult** is the senior voice you can pull aside mid-build. Ask the orchestrator a question and get an answer grounded only in your project's real context. It never touches your code: no run starts, no file in your repository changes, nothing merges. It reads your project, weighs the trade-offs, and tells you what it would do, then stops - the decision stays yours.

There is one exception, and it is inert by design: if you state a durable rule while you're asking, consult can write down a **proposal** for you to confirm. **What consult can leave behind**, below, is the whole list.

For a conversation that persists, and that can act on what you say when you allow it, see [Supervisor Control](concepts/supervisor-control). Consult stays the one-shot way in.

## Ask it anything

```bash
vibe consult "Should this auth refactor use a heavier review flow?"
vibe consult "Why did the last run block?" --run <runId>
vibe consult "What's left here?" --task <taskId>
vibe consult "..." --file src/server/routes/consult.ts
```

In the dashboard, the orb at the bottom-right opens the same thing from any screen.

## What it knows about your project

Consult is not a generic chatbot. What it knows about your work is *controlled* context and nothing more: your `VIBESTRATE.md`, your `project.yml` (providers, profiles, crews, policies), recent run outcomes and validation evidence, agent-visible annotations, and, when you pass them, a task, a run, or selected files. All of it is read-only, path-guarded, secret-redacted, and bounded.

## It knows Vibestrate itself

Alongside your project, consult carries Vibestrate's own documentation: these pages, the command tree, and the `project.yml` schema, compiled into the build. Ask "how do I make a crew" and it answers from the Crew page and the real `vibe crew` commands rather than from a model's memory of some other tool.

The lookup is deterministic keyword retrieval, not a model call and not a search service, so the same question always brings back the same pages and it works offline. It only fires when your question uses Vibestrate's own vocabulary: ask why a React build failed and no product pages are pulled in at all. The pages are part of the build and are not configurable - there is nothing to install, point at, or keep in sync.

## It can see the screen you asked from

Some screens hand the orb a snapshot of what you are looking at, so you can ask about the thing in front of you instead of describing it again. The **New run** composer publishes the brief you have typed, the flow and crew you picked, the run options, and any planner questions still on screen; the spec-up questions screen publishes the round and your answers so far.

The snapshot is a typed projection of state the dashboard already holds, never a screenshot or a scrape of the page, and its text is secret-redacted server-side before it reaches a provider. Screens that publish nothing leave the orb exactly as it was: grounded in the project alone.

## It is honest about what it can't verify

Because the orchestrator is itself a model, an answer states a **confidence** and lists **caveats** - the things it could not verify from the evidence - instead of presenting model confidence as fact.

It may recommend actions (start a run, pick a flow, request sandbox mode) and, when it has an evidence-backed improvement, **propose** a `VIBESTRATE.md` update.

## What consult can leave behind

Two kinds of proposal, and nothing else. Both wait for you.

A **`VIBESTRATE.md` update** is saved for review and never auto-applied. A human applies it explicitly (`vibe guide apply <id>`, or the **Apply** button on the consult card). Applying appends the reviewed text to the manual through a guarded writer (Action Broker `file.write`, path-guarded, and refused if the content carries secret-shaped tokens), so you review the diff before committing.

A **policy proposal** is the one thing consult writes on its own. If you state a durable review rule while asking ("stop using em-dashes"), consult appends it to `projectPolicies` in `.vibestrate/project.yml` as a pending row. That row is a real edit to a tracked file, so it shows up in `git diff` - and it is inert until you confirm it:

<div class="docs-callout">

**A proposed policy changes nothing until you confirm it.** It is written with `confirmedAt: null`, which is the gate both consumers check: the reviewer never injects it and the merge gate never enforces it. It is also forced to `tier: advise` with no matcher, whatever the model asked for, so a model cannot author a rule that blocks a merge. Confirm it with `vibe policies confirm <id>` (or the Policies page), or drop it with `vibe policies reject <id>`.

</div>

Everything else is off the table. Consult starts no run, edits no file in your repository, changes no setting that governs a run, and merges nothing. It goes through the same **assist** path as the rest of Vibestrate: broker-gated, no worktree, no agent turn that can reach your codebase. Its evidence is audited under `runs/consult/`.

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
