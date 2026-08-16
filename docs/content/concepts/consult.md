---
title: Consult
description: Ask one question about your project and get an answer grounded in what is really there, and in Vibestrate's own documentation.
slug: concepts/consult
---

**Consult** answers one question about your project. It reads your files, your config and your recent runs. It also reads Vibestrate's own documentation, compiled into the package, so an answer about the product quotes a real command or config key instead of a remembered one.

You reach it two ways: `vibe consult "..."` in a terminal, and the orb at the bottom right of every dashboard screen. It answers for **where you asked from** - screens to open in the browser, commands to run in the terminal. That is not a tone setting. On the dashboard the command reference pages are dropped from the answer's source material before the model sees them, so there is nothing left to copy a terminal instruction out of.

<svg viewBox="0 0 560 116" width="100%" style="max-width:560px;height:auto" role="img" aria-label="One question forks on where you asked it. Asked in the dashboard, the answer names screens to open. Asked in a terminal, it names commands to run.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="38" width="150" height="40" rx="8"/>
    <rect x="210" y="8" width="130" height="40" rx="8"/>
    <rect x="210" y="68" width="130" height="40" rx="8"/>
    <rect x="380" y="8" width="178" height="40" rx="8"/>
    <rect x="380" y="68" width="178" height="40" rx="8"/>
    <path d="M151 58 H180 M180 28 V88 M180 28 H203 M180 88 H203"/>
    <path d="M340 28 H373 M340 88 H373"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M210 28 l-7 -4 v8 z"/>
    <path d="M210 88 l-7 -4 v8 z"/>
    <path d="M380 28 l-7 -4 v8 z"/>
    <path d="M380 88 l-7 -4 v8 z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="76" y="63">your question</text>
    <text x="275" y="33">dashboard</text>
    <text x="469" y="33">screens to open</text>
    <text x="275" y="93">terminal</text>
    <text x="469" y="93">commands to run</text>
  </g>
</svg>

Consult is read-only. No run starts, no file in your repository changes, nothing merges, and the model is given no permission to write. One thing outlives the question, and it does nothing on its own: say a durable review rule while asking and consult writes it into `.vibestrate/project.yml` as a pending **policy proposal**. The code that writes it forces the advise tier and no matcher, whatever the answer asked for, and the rule enforces nothing until you confirm it.

Every answer states a **confidence** and lists **caveats** - what it could not verify. The orchestrator is a model too, and an answer with neither would be model confidence dressed as fact.

For a conversation that persists, and that can act when you allow it, see [Supervisor Control](/docs/concepts/supervisor-control). Consult is the one-shot way in.

## Ask it

```bash
vibe consult "Should this use a heavier flow?"
vibe consult "Why did the last run block?" \
  --run <runId>
vibe consult "What did this week's runs spend?"
vibe consult "What is left here?" --task <taskId>
vibe consult "What does this file do?" \
  --file src/consult/consult.ts
```

`--file` repeats. To answer one question on a model of your choosing, without editing anything:

```bash
vibe consult "..." --profile <id>
vibe consult "..." --provider <id> \
  --model <model> --effort <level>
```

In `vibe shell`, type `consult "..."` at the prompt. That is a terminal, so it answers with commands.

## What it reads

Two halves, kept apart.

<div class="docs-cards">

**Your project.** `VIBESTRATE.md`, `.vibestrate/project.yml` (providers, profiles, crews, policies), recent run outcomes with their review and validation evidence, the codebase map, agent-visible annotations, and - when you pass them - a task, a run, or named files. Read-only, path-guarded, secret-redacted and bounded.

**Vibestrate's documentation.** These pages, the command tree and the config schema, compiled into the build. The lookup is keyword matching, not a model call and not a search service, so it works offline and the same question brings back the same pages.

</div>

The product half stays quiet unless your question uses Vibestrate's own vocabulary. Ask why a React build failed and no product pages are pulled in at all.

Two things this is not. It is not a sandbox: the provider runs as a CLI in your project directory, so a tool-capable model can go and read files itself. And the documentation is part of the build, so a file in your project cannot shadow it, extend it, or put words in it.

## Some screens hand it what you are looking at

The **New run** composer publishes the brief you have typed, the flow and crew you picked, the run options, and any planner questions still on screen. The [Spec-up](/docs/concepts/spec-up) questions screen publishes the round and your answers so far. Everywhere else the orb is grounded in the project alone.

What it gets is a typed projection of state the dashboard already holds, never a screenshot or a scrape of the page, and its text is secret-redacted on the server before it reaches a provider.

## What things cost

Ask about money and consult rolls up the last seven days of spend per provider, from the metrics your runs recorded.

It says when a figure is an **estimate**. A cost a provider CLI reported is quoted as fact. A turn priced here from token counts times a published list price is not, and one estimated turn makes the whole total an estimate. If nothing was recorded in the window, the answer says that rather than producing a number.

## Two questions

<div class="docs-cards">

**"Why did the last run block?"** - answerable. The status, the review decision and the validation evidence are all on disk, so the answer points at what actually happened.

**"What did Claude cost me this week?"** - answerable when the runs recorded metrics, and when they did not, consult says nothing was recorded. It will not price a week it cannot see.

</div>

The same line holds on the product half. Ask about a flag that does not exist and the answer is instructed to say the documentation does not cover it and to lower its confidence, rather than filling the gap from memory. That one is an instruction to the model, not a gate in code - which is why the answer also shows you its caveats.

## What it can leave behind

Two proposals, and nothing else. Both wait for you.

A **`VIBESTRATE.md` update** is saved for review, never auto-applied. A human applies it explicitly, with the Apply button on the answer or from the CLI. Applying appends the reviewed text through a guarded writer - Action Broker `file.write`, path-guarded, refused if the content carries secret-shaped tokens - so you read the diff before you commit it.

```bash
vibe guide proposals
vibe guide apply <id>
vibe guide reject <id>
```

A **policy proposal** is the one thing consult writes on its own. It is a real edit to a tracked file, so it shows up in `git diff`.

<div class="docs-callout">

**A proposed policy changes nothing until you confirm it.** It is written with `confirmedAt: null`, which is the gate both consumers check: the reviewer never injects it and the merge gate never enforces it. Tier and matcher are forced by the code that writes it, so a model cannot author a rule that blocks a merge. See [Policies](/docs/concepts/policies).

</div>

```bash
vibe policies list
vibe policies confirm <policyId>
vibe policies reject <policyId>
```

Everything else is off the table. Consult starts no run, changes no setting that governs a run, and merges nothing. It runs on the same **assist** path as the rest of Vibestrate: the provider spawn crosses the Action Broker, there is no worktree, and no run lifecycle. Its record is audited under `.vibestrate/runs/consult/`.

## Where you drive it

<div class="docs-cards">

**Terminal.** `vibe consult`, and the same command behind `vibe shell`'s consult page.

**Dashboard.** The orb at the bottom right of every screen. It offers two things: asking about your project, which is consult, and working in Vibestrate itself, which is guided walkthroughs and the [Supervisor](/docs/concepts/supervisor-control) conversation.

**API.** `POST /api/consult` asks. `GET /api/vibestrate`, plus its init and proposals routes, read and apply the manual side. The surface is fixed to the dashboard on this route and never read off the request body, so a client cannot ask its way back into terminal instructions.

</div>

## Related

- [VIBESTRATE.md](/docs/concepts/vibestrate-md) - the manual consult reads, and proposes updates to.
- [Policies](/docs/concepts/policies) - the tiers, and what confirming a proposal turns on.
- [Supervisor Control](/docs/concepts/supervisor-control) - the conversation that remembers, and can act.
- [Safety](/docs/concepts/safety) - the Action Broker, and what does not cross it.
