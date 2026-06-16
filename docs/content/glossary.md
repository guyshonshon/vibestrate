---
title: Glossary
description: Plain-language definitions for the words you'll meet across these docs.
section: ops
slug: glossary
---

Short, plain definitions for the words Vibestrate's docs use.

<div class="docs-glossary">

**Action Broker.** The one checkpoint every real effect has to pass through, whether that's starting a provider, running a command, or writing a file. For each effect it decides allow, deny, or ask a human first, then writes down what it decided and why in `.vibestrate/runs/<runId>/actions.ndjson`. This is where **Policy** actually gets enforced in the running code.

**Crew.** Your local team of Roles. A run picks one Crew (default: `defaultCrew`) and matches the Flow's Seats to the Roles in it. See [Crew](/docs/concepts/crew).

**Role.** One teammate inside a Crew. It carries instructions (a prompt), permissions, skills, the Profile it runs on, and the Seats it's allowed to fill. See [Role](/docs/concepts/role).

**Seat.** A spot a Flow step needs someone in (for example `implementer`). It's a request the Crew answers with a Role whose `seats` list includes that seat. See [Seat](/docs/concepts/seat).

**Profile.** How strong and how expensive a Role runs: its provider, model, power, and timeout. Power is specific to each provider. See [Profile](/docs/concepts/profile).

**Approval gate.** A spot in a workflow or Flow where Vibestrate stops and waits for a person to say yes before going on. You set it with `policies.requireApprovalAtStages`, or with a step of `kind: approval-gate` inside a Flow.

**Context source.** A file or URL you hand to a run or task so its contents get pasted into **every** agent's prompt (`vibe run --context-file/--context-url`, or a task's context panel). Files are checked first so secret files are refused and secret-looking text is hidden; URLs are fetched safely, size-capped, and cleaned before any prompt sees them. A source that fails is quietly skipped with a note rather than breaking the run.

**Artifact.** Any file a run makes or saves along the way - the plan, the architecture notes, the diff, the validation output, review findings, the verification summary. They all live under `.vibestrate/runs/<runId>/`.

**CLI.** The `vibe` command-line tool. The main way you drive Vibestrate, alongside Mission Control.

**Effort.** A rough how-hard-is-this hint - `low | medium | high` - saved to help with planning. It doesn't pick a provider anymore; how strong a worker actually runs is the [Profile](/docs/concepts/profile)'s job.

**Flow.** A saved recipe for a run. Like the default workflow, but with named Seats, your own step order, optional pause points, and limited repeats. See [Flow](/docs/concepts/flow).

**Instructions.** Your project's house rules in `.vibestrate/rules.md`, pasted into every agent's prompt on every turn. These are *guidance*, not a guarantee - the model may follow them or ignore them, the way a teammate may or may not read the style guide. Contrast with **Policy**, which is enforced in code. Use instructions for "this is how we work"; use policy for "this must not happen."

**Mission Control.** The local web dashboard you open with `vibe ui`. Use it to look at runs, approve gates, read diffs, and edit config.

**Orchestrator.** The part that pushes a run through its stages: it moves the state machine forward, saves artifacts, and hands work from one agent to the next.

**Permission profile.** A named bundle of allowed and forbidden actions for a Role - `read_only`, `code_write`, and so on. Declared under `permissions.profiles` in `project.yml`. Attached to each Role via `crews.<crewId>.roles.<role>.permissions`. (This is a different thing from a runtime [Profile](/docs/concepts/profile).)

**Phase.** Same as stage. (Inside the code, "stage" is the word that's used.)

**Plan.** The structured output the planner agent produces. The first stage of the default workflow makes it.

**Policy.** A gate enforced by code, not just a line in a prompt. Policies live in `.vibestrate/policies/*.yml` (and as approval gates via `policies.requireApprovalAtStages`); the **Action Broker** checks them and can `deny` a real effect or flag it as `require_approval`. A rule the model can't sweet-talk its way around. Contrast with **Instructions** (`rules.md`), which only get pasted into prompts as advice.

**Project root.** The git repository where `vibe init` was run. It's where `.vibestrate/` lives.

**Provider.** Whatever Vibestrate uses to talk to a model: a local **CLI** (Claude Code, Codex, Aider, Ollama, OpenCode), a **cloud API** (`http-api` → Anthropic/OpenAI with your own env-ref key, marked external), or a **local model server** (`localhost-proxy` → Ollama/LM Studio/vLLM, no egress). See [Provider](/docs/concepts/provider).

**Replay.** A look-only viewer for a run that's already saved. `vibe replay <runId>`.

**Roadmap task.** An item in `.vibestrate/roadmap/roadmap.json` that you can tie a run to with `--task <taskId>`. It's a separate thing from the run itself.

**Run.** One live pass through the workflow, started from a task. It has its own runId, worktree, branch, status, artifacts, and events.

**Skill.** A markdown file that loads alongside an agent's prompt. They live under `.vibestrate/skills/` or `.claude/skills/`. See [Skill](/docs/concepts/skill).

**Stage.** One step in the workflow - `planning`, `executing`, etc. Each stage has a status it begins in and a status it ends in.

**State machine.** The list of run-status changes that are allowed. Enforced by `assertTransition`, so a run can't jump to a status the rules don't permit.

**Status.** Where a run is right now, drawn from a fixed enum: `created`, `planning`, `planned`, ... `merge_ready`, `blocked`, `failed`, `aborted`. See [Run state](/docs/concepts/state).

**Task.** A description of what you want done, submitted to Vibestrate. It kicks off a run. See [Task](/docs/concepts/task).

**Assist.** A single, **read-only** ask with a structured answer: Vibestrate puts one question to a provider and gets back validated JSON - no worktree, no fix loop, no run lifecycle. The spawn still goes through the [Action Broker](#) like any other effect, so it's allowed and logged (evidence in `.vibestrate/runs/assist/`). It's the building block for **Enhance** (and later overview/suggest).

**Enhance.** An [Assist](#) that *breaks* a task/card into an ordered **Checklist** - e.g. "Add a health endpoint" → `1. define the route`, `2. return json`, `3. add a test`. It only **proposes**; you accept. The model never writes to the board on its own. Run it with `vibe tasks enhance <id>` (add `--apply` to append) or the "Enhance" button on a task. Different from macro **Proposals**, which create *separate* cards.

**Board columns (coarse).** The planning board sorts cards into five broad columns - **Planned · In-progress · Needs testing · Completed · Archived** - worked out from a card's status plus its needs-testing / archived overlays. They shift on their own as the run status changes. They're a kanban for humans, kept on purpose simpler than the orchestrator's fine run stages (planning/executing/reviewing/…), which live in [Mission Control](#). **Archived** is a card you've filed away (a flag, independent of run status).

**Needs testing.** A heads-up that doesn't block anything, raised by a reviewer/verifier (`HUMAN_REVIEW: ADVISORY`) when a run finished fine but a person should *eyeball* something the model can't perceive - visual layout, animation, 3D, UX feel. The run keeps its verdict (it isn't stuck waiting, unlike an [Approval gate](#)); the linked card is flagged, and a human verdict routes it - "looks good" → Done, "needs work" → reopened. It shows up as a banner on the task and a badge on the board card.

**Pick-up execution.** Running a card's [Checklist](#) one item at a time inside one run and one worktree: the flow's `checklistSegment` repeats once per item (micro-plan → implement), committing each item and carrying a compact summary forward to the next, with one holistic plan before and one review after. **Continuous** runs items back-to-back; **step-by-step** pauses between them. Start it with `vibe tasks pickup <id>` or the "Run checklist" button. An instant task is just the one-item version of this.

**Checklist.** An ordered list of **items** (todos) that lives *inside* a task/card - the concrete breakdown of what the card involves (e.g. `1. /health returns json`, `2. test the endpoint`). Kept on the task on purpose, so the context isn't scattered across many cards. Each item has a status (`pending`/`in_progress`/`done`/`blocked`). Manage it with `vibe tasks checklist …` or on the task detail page. (Different from a Flow **Step**, which is a workflow phase.)

**Terminal status.** One of `merge_ready`, `blocked`, `failed`, `aborted`. Once a run reaches one of these, it can't transition out.

**Telemetry export.** An opt-in, one-off `vibe telemetry export <runId> --endpoint <url>` that turns a finished run's metrics into an OpenTelemetry (OTLP) trace - a root run span + a child span per role turn (provider, model, tokens, cost) - and POSTs it to *your own* collector (Langfuse, Tempo, Jaeger). Off by default; nothing leaves until you run it. `vibe telemetry trace` prints the same JSON without sending.

**Validation.** The stage that runs `commands.validate` from `project.yml` - typecheck, tests, build, lint. The hard, factual check that sits between executor and reviewer.

**Integration.** Joining together the branches of several finished (`merge_ready`) runs. Vibestrate previews the merges first (real `git merge` dry-runs that surface conflicts), then integrates the clean ones **sequentially into a dedicated integration branch** - never `main`, never pushed, stopping at the first conflict for you to resolve. `vibe integrate preview/apply` or the Integration panel on the Runs page.

**Workspace.** The user-level registry of Vibestrate projects you've opened (`~/.vibestrate/workspace.json`). Each `vibe ui` adds its project (and the port it bound); the dashboard's project switcher lists them and hops to another project's dashboard. Projects stay fully independent - each is its own `vibe ui` on its own port - so several can run at once. The **All projects** view (dashboard page, or `vibe workspace overview`) reads each registered project's runs and rolls them up - active/recent runs, outcomes, and spend per project plus combined totals. Each project is a fully isolated tenant: its own `vibe ui` server + scheduler, processing its own queue, knowing nothing about the others. The workspace is a **navigator** - **Open** any project (overview card, the switcher, or `vibe workspace open <label>`/`--all`) and it loads in a new tab; a *dormant* project is started on a free port on demand (its own server + scheduler), a *live* one is reused. **Close** shuts a project back down - it asks that project's own server to stop its scheduler and exit (freeing the port), with a confirmation that warns when active runs or queued tasks are in flight. There is no cross-project control plane - to run work in a project, open it and let its own scheduler process it. `vibe workspace list/add/remove/overview/open/close`.

**Worktree.** A separate git working directory bound to its own branch. Vibestrate creates one per run under `git.worktreeDir`. See [Worktree](/docs/concepts/worktree).

**Workflow.** The static, ordered description of the stages a run progresses through. See [Workflow](/docs/concepts/workflow).

</div>
