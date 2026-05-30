---
title: Glossary
description: Beginner-friendly definitions for the terms used throughout Vibestrate's docs.
section: ops
slug: glossary
---

Short definitions for the vocabulary Vibestrate's docs assume.

**Action Broker.** The single boundary every real effect crosses (provider spawn, command run, file write, …). It *decides* each action — allow, deny, or require approval — and *records* the decision plus evidence to `.vibestrate/runs/<runId>/actions.ndjson`. This is where **Policy** is enforced in code. Lives in `src/safety/action-broker.ts`.

**Crew.** Your local team of Roles. A run picks one Crew (default: `defaultCrew`) and matches the Flow's Seats to its Roles. See [Crew](/docs/concepts/crew).

**Role.** One teammate inside a Crew — instructions (prompt), permissions, skills, the Profile it runs on, and the Seats it can fill. See [Role](/docs/concepts/role).

**Seat.** What a Flow step needs filled (e.g. `implementer`). A contract the Crew satisfies with a Role whose `seats` includes the seat. See [Seat](/docs/concepts/seat).

**Profile.** How strong and expensive a Role runs: provider + model + power + budget + timeout. Provider-specific power. See [Profile](/docs/concepts/profile).

**Approval gate.** A point in a workflow or Flow where the orchestrator pauses for explicit human approval. Configured via `policies.requireApprovalAtStages` or step `kind: approval-gate` in a Flow.

**Context source.** A file or URL you attach to a run or task so its content is injected into **every** agent's prompt (`vibe run --context-file/--context-url`, or a task's context panel). Files are path-guarded (secret files refused, secret-shaped content redacted); URLs are SSRF-guarded, bounded, and redacted before they reach a prompt. A bad source is skipped with a note, never a hard failure.

**Artifact.** Any file produced or recorded by a run — plan, architecture, diff, validation output, review findings, verification summary. Lives under `.vibestrate/runs/<runId>/`.

**CLI.** The `vibe` command-line tool. The primary surface, alongside Mission Control.

**Effort.** A coarse task-difficulty hint — `low | medium | high` — recorded for planning/heuristics. It no longer maps to a provider; runtime strength is a [Profile](/docs/concepts/profile)'s job.

**Flow.** A saved run recipe. Like the default workflow, but with named Seats, custom step ordering, optional gates, and bounded repeats. See [Flow](/docs/concepts/flow).

**Instructions.** The project guidance in `.vibestrate/rules.md`, injected into every agent's prompt on every turn. These are *guidance*, not guarantees — the model may follow or ignore them, like a teammate reading a style guide. Contrast with **Policy**, which is enforced in code. Use instructions for "this is how we work"; use policy for "this must not happen."

**Mission Control.** The local web dashboard, served by `vibe ui`. Inspect runs, approve gates, read diffs, edit config.

**Orchestrator.** The component that drives a run through its stages. Lives in `src/core/orchestrator.ts`. Transitions the state machine, persists artifacts, hands off between agents.

**Permission profile.** A named set of allowed and disallowed actions for a Role — `read_only`, `code_write`, etc. Declared under `permissions.profiles` in `project.yml`. Attached to each Role via `crews.<crewId>.roles.<role>.permissions`. (Distinct from a runtime [Profile](/docs/concepts/profile).)

**Phase.** Same as stage. (Internally, "stage" is the term.)

**Plan.** The planner agent's structured output. The first stage of the default workflow produces it.

**Policy.** A code-enforced gate — not a prompt instruction. Policies live in `.vibestrate/policies/*.yml` (and as approval gates via `policies.requireApprovalAtStages`); the **Action Broker** evaluates them and can `deny` or `require_approval` for a real effect. A policy the model cannot talk its way past. Contrast with **Instructions** (`rules.md`), which are injected into prompts and only advisory.

**Project root.** The git repository where `vibe init` was run. Where `.vibestrate/` lives.

**Provider.** What Vibestrate drives to talk to a model: a local **CLI** (Claude Code, Codex, Aider, Ollama, OpenCode), a **cloud API** (`http-api` → Anthropic/OpenAI with your own env-ref key, marked external), or a **local model server** (`localhost-proxy` → Ollama/LM Studio/vLLM, no egress). See [Provider](/docs/concepts/provider).

**Replay.** The read-only inspector for a persisted run. `vibe replay <runId>`.

**Roadmap task.** An entry in `.vibestrate/roadmap/roadmap.json` that you can link a run to via `--task <taskId>`. Separate from the run itself.

**Run.** A live instance of the workflow, born from a task. Has its own runId, worktree, branch, status, artifacts, events.

**Skill.** A markdown attachment that loads alongside an agent's prompt. Lives under `.vibestrate/skills/` or `.claude/skills/`. See [Skill](/docs/concepts/skill).

**Stage.** One step in the workflow — `planning`, `executing`, etc. Each stage has an entering status and an exiting status.

**State machine.** The set of legal run-status transitions. Enforced by `assertTransition` in `src/core/state-machine.ts`.

**Status.** The current state of a run. Drawn from a fixed enum: `created`, `planning`, `planned`, ... `merge_ready`, `blocked`, `failed`, `aborted`. See [Run state](/docs/concepts/state).

**Task.** A description of what you want done, submitted to Vibestrate. Triggers a run. See [Task](/docs/concepts/task).

**Assist.** A one-shot, **read-only**, structured-output run: Vibestrate asks a provider one question and gets back validated JSON — no worktree, no fix loop, no run lifecycle. The spawn is gated and audited through the [Action Broker](#) like any other effect (evidence in `.vibestrate/runs/assist/`). Building block for **Enhance** (and later overview/suggest). Lives in `src/assist/`.

**Enhance.** An [Assist](#) that *decomposes* a task/card into an ordered **Checklist** — e.g. "Add a health endpoint" → `1. define the route`, `2. return json`, `3. add a test`. It **proposes**; you accept. The model never writes to the board on its own. Run it with `vibe tasks enhance <id>` (add `--apply` to append) or the "Enhance" button on a task. Distinct from macro **Proposals**, which create *separate* cards.

**Board columns (coarse).** The planning board groups cards into five coarse columns — **Planned · In-progress · Needs testing · Completed · Archived** — derived from a card's status plus its needs-testing / archived overlays. They auto-nudge as the run status changes. These are a human kanban, deliberately coarser than the orchestrator's fine run stages (planning/executing/reviewing/…), which live in [Mission Control](#). **Archived** is a card you've filed away (a flag, independent of run status).

**Needs testing.** A non-blocking advisory a reviewer/verifier can raise (`HUMAN_REVIEW: ADVISORY`) when a run finished fine but a human should *eyeball* something the model can't perceive — visual layout, animation, 3D, UX feel. The run keeps its verdict (it isn't stuck waiting, unlike an [Approval gate](#)); the linked card is flagged, and a human verdict routes it — "looks good" → Done, "needs work" → reopened. Surfaced as a banner on the task and a badge on the board card.

**Pick-up execution.** Running a card's [Checklist](#) item-by-item in one run + one worktree: the flow's `checklistSegment` repeats once per item (micro-plan → implement), committing each item and carrying a compact summary forward to the next, with a holistic plan once before and review once after. **Continuous** runs items back-to-back; **step-by-step** pauses between them. Start it with `vibe tasks pickup <id>` or the "Run checklist" button. An instant task is the degenerate one-item case.

**Checklist.** An ordered list of **items** (todos) that lives *inside* a task/card — the concrete breakdown of what the card entails (e.g. `1. /health returns json`, `2. test the endpoint`). Kept on the task on purpose so context isn't scattered across many cards. Each item has a status (`pending`/`in_progress`/`done`/`blocked`). Manage it with `vibe tasks checklist …` or in the task detail page. (Distinct from a Flow **Step**, which is a workflow phase.)

**Terminal status.** One of `merge_ready`, `blocked`, `failed`, `aborted`. Once reached, a run cannot transition out.

**Validation.** The stage that runs `commands.validate` from `project.yml` — typecheck, tests, build, lint. The ground-truth check between executor and reviewer.

**Worktree.** A separate git working directory bound to its own branch. Vibestrate creates one per run under `git.worktreeDir`. See [Worktree](/docs/concepts/worktree).

**Workflow.** The static, ordered description of stages a run progresses through. See [Workflow](/docs/concepts/workflow).
