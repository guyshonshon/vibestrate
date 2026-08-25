---
title: Glossary
description: Plain-language definitions for the words you'll meet across these docs.
slug: glossary
---

## In simple words

Plain definitions for the words these docs use.

<div class="docs-callout tip">

**Tip.** Meeting these for the first time? Read [the big picture](/docs/getting-started/big-picture) instead. It introduces the same words in the order they depend on each other, which is far easier than an alphabetical list.

</div>

The words in one sentence:

```
A Task runs through a Flow, whose steps name Seats,
which your Crew's Roles fill, each on a Profile, which names a Provider.
```

The four you cannot skip:

<div class="docs-cards">

**[Task](/docs/concepts/task)**
The job you want done, in a sentence.

**[Flow](/docs/concepts/flow)**
The ordered steps it runs through.

**[Crew](/docs/concepts/crew)**
The roles that fill those steps.

**[Run](/docs/concepts/run)**
One pass over the task, on its own branch.

</div>

<div class="docs-callout">

**Did you know?** A seat, a role and a profile are three different things that people routinely collapse into "the model". Keeping them apart is exactly what lets a flow written by a stranger run on your models, at your budget, unedited.

</div>

## Every term

<div class="docs-glossary">

**Action Broker.** The one checkpoint every real effect crosses - starting a provider, running a command, writing a file - deciding allow, deny, or ask a human, and recording it in that run's `actions.ndjson`. Default-allow with a policy veto: it is where you impose limits, not a whitelist to satisfy. See [Safety](/docs/concepts/safety).

**Crew.** Your local team of Roles, matched to a Flow's Seats. A run uses `defaultCrew` from `project.yml` unless you pass another. See [Crew](/docs/concepts/crew).

**Role.** One teammate inside a Crew: instructions, permissions, skills, the Profile it runs on, and the Seats it may fill. See [Role](/docs/concepts/role).

**Seat.** A slot a Flow step needs someone in, such as `implementer`, answered by a Role whose `seats` list includes it. See [Seat](/docs/concepts/seat).

**Profile.** How strong and how expensive a Role runs: provider, model, power, timeout. Power is provider-specific. See [Profile](/docs/concepts/profile).

**Approval gate.** Where a run stops and waits for a person. Three things raise one: a stage under `policies.requireApprovalAtStages` (once per run, on the first pass), a step of `kind: approval-gate`, or an agent emitting `HUMAN_APPROVAL: REQUIRED`. The run sits at `waiting_for_approval` until you approve, reject, or request changes.

**Context source.** A file or URL handed to a run or task so its contents reach **every** agent's prompt (`vibe run --context-file/--context-url`, or a task's context panel). Secret files are refused and secret-looking text hidden; URLs are size-capped and cleaned. A source that fails is skipped with a note rather than breaking the run.

**Artifact.** Any file a run makes: each step's prompt and reply, validation output, review findings, the verification summary. All under that run's folder in `.vibestrate/runs/`.

**CLI.** The `vibe` command-line tool - the automation path. Anything the dashboard does it can do, which makes a run scriptable from CI.

**Effort.** A keyword heuristic's reading of how hard a task's text sounds - `low | medium | high` - with its reasons shown so you can disagree. A hint the flow selector weighs, not a setting. Not a Profile's `power`, which is the reasoning level a provider is asked for.

**Flow.** A saved recipe for a run: named Seats, your own step order, optional pause points, bounded repeats. See [Flow](/docs/concepts/flow).

**Instructions.** Your project's house rules in `.vibestrate/rules.md`, pasted into every agent's prompt on every turn. *Guidance*, not a guarantee - the model may follow them or not. Contrast **Policy**, which is enforced in code.

**Mission Control.** The local dashboard, opened with `vibe ui` on `127.0.0.1:4317`. The primary surface: watch runs, approve gates, read diffs, edit crews, flows and config.

**Orchestrator.** What pushes a run through its stages: it moves the state machine, saves artifacts, and hands work between agents.

**Permission profile.** A named bundle of allowed and forbidden actions for a Role - `read_only`, `code_write`, and so on. Declared under `permissions.profiles` in `project.yml`, attached per role. (Not the runtime [Profile](/docs/concepts/profile).)

**Phase.** Same as stage. In the code, "stage" is the word used.

**Plan.** The structured output the planner agent produces, in the default flow's first stage.

**Ponytail.** The minimalism posture injected into the agents that write code, so their default is the smallest change that works. On by default; `vibe config set ponytail false` turns it off. Only the implementer and fixer see it. See [Ponytail](/docs/concepts/ponytail).

**Policy.** A gate enforced by code, not a line in a prompt. Policies live in `.vibestrate/policies/*.yml` (and as approval gates via `policies.requireApprovalAtStages`); the **Action Broker** checks them and can `deny` an effect or flag it `require_approval` - accepted only on `run.complete` and `file.patch`, the two that can pause. A run refuses to start while any policy file is malformed or an id is defined twice: a rule that did not load protects nothing.

**Project root.** The git repository where `vibe init` was run, and where `.vibestrate/` lives.

**Provider.** Whatever Vibestrate uses to reach a model: a local **CLI** (Claude Code, Codex, Gemini CLI, Aider, Ollama and several more), a **cloud API** (`http-api`, your own env-ref key, marked external), or a **local model server** (`localhost-proxy`, no egress). See [Provider](/docs/concepts/provider).

**Replay.** A look-only viewer for a saved run: the **Replay** tab on the run, or `vibe replay <runId>`.

**Roadmap task.** An item in `.vibestrate/roadmap/roadmap.json`, tied to a run with `--task <taskId>`. Separate from the run itself.

**Run.** One live pass through a flow, started from a task. Its own runId, worktree, branch, status, artifacts and events.

**Skill.** A markdown file loaded alongside an agent's prompt, from `.vibestrate/skills/` or `.claude/skills/`. See [Skill](/docs/concepts/skill).

**Stage.** One phase of the flow - `planning`, `executing`, and so on. Each begins in one status and ends in another.

**State machine.** The allowed run-status changes, enforced by `assertTransition`: a run cannot jump to a status the rules do not permit.

**Status.** A run's position right now, from a fixed enum: `created`, `planning`, `planned`, … `merge_ready`, `blocked`, `failed`, `aborted`. See [Run state](/docs/concepts/state).

**Spec-up.** The planning chain that runs *before* any code: it reads a brief, asks the gap questions, then drafts a scope, a spec, an architecture, a risks register and a roadmap of cards. Every step is a read-only run. See [Spec-up](/docs/concepts/spec-up).

**Supervisor.** One word, two things. The **setting** (`persona` in `project.yml`) is the judgment a run brings. The **Supervisor panel** in Mission Control is a conversation with your project that can, when you allow it, act. See [Supervisor](/docs/concepts/supervisor) and [Supervisor Control](/docs/concepts/supervisor-control).

**Consult.** One read-only question about your project, answered from your real files, config and runs plus Vibestrate's own docs. Starts nothing, changes nothing. The orb on any dashboard screen, or `vibe consult "..."`. See [Consult](/docs/concepts/consult).

**Task.** A description of what you want done. It kicks off a run. See [Task](/docs/concepts/task).

**Assist.** A single **read-only** ask with a structured answer: one question to a provider, back comes validated JSON. No worktree, no fix loop, no run lifecycle. Audited like any other effect, with evidence under `.vibestrate/runs/assist/`.

**Enhance.** An Assist that breaks a task into an ordered **Checklist**: "Add a health endpoint" becomes `1. define the route`, `2. return json`, `3. add a test`. It proposes only; you accept. `vibe tasks enhance <id>` (`--apply` appends), or the **Enhance** button on a task. Not macro **Proposals**, which create separate cards, and not the **Conductor**'s ENHANCE verdict, which refines a supervised task's pending steps mid-run.

**Board columns.** The planning board sorts cards into **Planned · In-progress · Needs testing · Completed · Archived**, from a card's status plus its needs-testing and archived overlays, shifting as run status changes. **Archived** is a flag you set, independent of run status.

**Needs testing.** A non-blocking heads-up from a reviewer or verifier (`HUMAN_REVIEW: ADVISORY`) when a run finished fine but a person should eyeball what a model cannot perceive - layout, animation, 3D, feel. The run keeps its verdict, so unlike an approval gate nothing is stuck. A banner on the task and a badge on the board card: **Looks good** sends the card to Done, **Needs work** reopens it.

**Pick-up execution.** Running a card's Checklist one item at a time in one run and one worktree: the flow's `checklistSegment` repeats per item (micro-plan, then implement), committing each and carrying a compact summary forward, with one holistic plan before and one review after. **Continuous** runs items back-to-back; **step-by-step** pauses between them. `vibe tasks pickup <id>` (`--step` to pause), or **Run checklist**.

**Checklist.** An ordered list of items inside a task: the concrete breakdown of the work, kept on the card. Each item has a status (`pending`/`in_progress`/`done`/`blocked`). `vibe tasks checklist …`, or the task detail page. (A Flow **Step** is a different thing: a workflow phase.)

**Run mode.** How a task runs: `plain` (one holistic pass) or `supervised` (the Conductor sequences the steps). A field on the task, not a different kind of task.

**Supervised task.** A task in `supervised` run mode. Its checklist items become **steps**, each with an objective, an acceptance check and optional file hints, and each gets its own executor turn and review. Bounded by `supervised.maxSteps` (20 by default) and `supervised.maxSpendUsd`. See [Supervised tasks](/docs/concepts/supervised-tasks).

**Conductor.** What sequences a supervised task's steps. Between them it runs a cheap read-only supervisor turn returning PROCEED, ENHANCE or ESCALATE, and maintains an **invariants ledger**, an append-only list of cross-cutting decisions re-injected into every later step. ENHANCE triggers a plan-only pass that may refine, reorder or remove *pending* steps; adding a step, or removing one you authored, escalates to you.

**Terminal status.** `merge_ready`, `blocked`, `failed` or `aborted`. A run that reaches one cannot transition out.

**Telemetry export.** Opt-in and one-off: `vibe telemetry export <runId> --endpoint <url>` turns a finished run's metrics into an OpenTelemetry trace - a root run span plus a child span per role turn - and POSTs it to *your own* collector. Off by default; nothing leaves until you run it. `vibe telemetry trace` prints the same JSON without sending.

**Validation.** The stage that runs `commands.validate` from `project.yml` - typecheck, tests, build, lint. The factual check between executor and reviewer.

**Integration.** Joining the branches of several `merge_ready` runs. The merges are previewed first (real `git merge` dry runs that surface conflicts), then the clean ones integrate sequentially into a dedicated integration branch - never `main`, never pushed, stopping at the first conflict for you to resolve. The **Source** page's **Merge** tab, the Integration panel on the Runs page, or `vibe integrate preview/apply`.

**Workspace.** The user-level registry of projects you have opened (`~/.vibestrate/workspace.json`). Each `vibe ui` adds its project and the port it bound, and the sidebar's project switcher hops between them. Projects stay independent - each its own `vibe ui` and scheduler on its own port, with no cross-project control plane. **All projects** (a dashboard page, or `vibe workspace overview`) rolls up runs, outcomes and spend per project plus combined totals. **Open** loads a project in a new tab, starting a dormant one on a free port; **Close** asks that project's server to stop its scheduler and exit, warning first when work is in flight.

**Worktree.** A separate git working directory bound to its own branch. One per run, under `git.worktreeDir`. See [Worktree](/docs/concepts/worktree).

**Workflow.** The static, ordered description of the stages a run progresses through. See [Workflow](/docs/concepts/workflow).

**Container isolation.** Running each provider turn inside a throwaway Docker container, so the blast radius is the container. Off by default (`execution.backend: local-worktree`); `vibe config set execution.backend docker` turns it on. See [Container isolation](/docs/concepts/sandbox).

**Annotation.** A short note pinned to a file so agents read it before they start - "don't refactor this". It never touches your source; annotations live in `.vibestrate/annotations.json`. See [Annotations](/docs/concepts/annotation).

**Project parameters.** Typed answers a Flow needs before it can run, filled once and reused, saved in `.vibestrate/project-params.json`. A `secret: true` param stores only the name of an environment variable, never the value. See [Project parameters](/docs/concepts/project-params).

**VIBESTRATE.md.** A committed file at your project root telling the orchestrator what this project is and how you like it run, read before every task. Advisory like **Instructions**: it shapes planning but never overrides a **Policy**. See [VIBESTRATE.md](/docs/concepts/vibestrate-md).

</div>
