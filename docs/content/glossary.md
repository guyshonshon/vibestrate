---
title: Glossary
description: Beginner-friendly definitions for the terms used throughout Vibestrate's docs.
section: ops
slug: glossary
---

Short definitions for the vocabulary Vibestrate's docs assume.

**Crew.** Your local team of Roles. A run picks one Crew (default: `defaultCrew`) and matches the Flow's Seats to its Roles. See [Crew](/docs/concepts/crew).

**Role.** One teammate inside a Crew — instructions (prompt), permissions, skills, the Profile it runs on, and the Seats it can fill. See [Role](/docs/concepts/role).

**Seat.** What a Flow step needs filled (e.g. `implementer`). A contract the Crew satisfies with a Role whose `seats` includes the seat. See [Seat](/docs/concepts/seat).

**Profile.** How strong and expensive a Role runs: provider + model + power + budget + timeout. Provider-specific power. See [Profile](/docs/concepts/profile).

**Approval gate.** A point in a workflow or Flow where the orchestrator pauses for explicit human approval. Configured via `policies.requireApprovalAtStages` or step `kind: approval-gate` in a Flow.

**Artifact.** Any file produced or recorded by a run — plan, architecture, diff, validation output, review findings, verification summary. Lives under `.vibestrate/runs/<runId>/`.

**CLI.** The `vibe` command-line tool. The primary surface, alongside Mission Control.

**Effort.** A coarse task-difficulty hint — `low | medium | high` — recorded for planning/heuristics. It no longer maps to a provider; runtime strength is a [Profile](/docs/concepts/profile)'s job.

**Flow.** A saved run recipe. Like the default workflow, but with named Seats, custom step ordering, optional gates, and bounded repeats. See [Flow](/docs/concepts/flow).

**Mission Control.** The local web dashboard, served by `vibe ui`. Inspect runs, approve gates, read diffs, edit config.

**Orchestrator.** The component that drives a run through its stages. Lives in `src/core/orchestrator.ts`. Transitions the state machine, persists artifacts, hands off between agents.

**Permission profile.** A named set of allowed and disallowed actions for a Role — `read_only`, `code_write`, etc. Declared under `permissions.profiles` in `project.yml`. Attached to each Role via `crews.<crewId>.roles.<role>.permissions`. (Distinct from a runtime [Profile](/docs/concepts/profile).)

**Phase.** Same as stage. (Internally, "stage" is the term.)

**Plan.** The planner agent's structured output. The first stage of the default workflow produces it.

**Project root.** The git repository where `vibe init` was run. Where `.vibestrate/` lives.

**Provider.** A local CLI Vibestrate can drive to talk to a model. Claude Code, Codex, Aider, Ollama, OpenCode are the built-in ones. See [Provider](/docs/concepts/provider).

**Replay.** The read-only inspector for a persisted run. `vibe replay <runId>`.

**Roadmap task.** An entry in `.vibestrate/roadmap/roadmap.json` that you can link a run to via `--task <taskId>`. Separate from the run itself.

**Run.** A live instance of the workflow, born from a task. Has its own runId, worktree, branch, status, artifacts, events.

**Skill.** A markdown attachment that loads alongside an agent's prompt. Lives under `.vibestrate/skills/` or `.claude/skills/`. See [Skill](/docs/concepts/skill).

**Stage.** One step in the workflow — `planning`, `executing`, etc. Each stage has an entering status and an exiting status.

**State machine.** The set of legal run-status transitions. Enforced by `assertTransition` in `src/core/state-machine.ts`.

**Status.** The current state of a run. Drawn from a fixed enum: `created`, `planning`, `planned`, ... `merge_ready`, `blocked`, `failed`, `aborted`. See [Run state](/docs/concepts/state).

**Task.** A description of what you want done, submitted to Vibestrate. Triggers a run. See [Task](/docs/concepts/task).

**Terminal status.** One of `merge_ready`, `blocked`, `failed`, `aborted`. Once reached, a run cannot transition out.

**Validation.** The stage that runs `commands.validate` from `project.yml` — typecheck, tests, build, lint. The ground-truth check between executor and reviewer.

**Worktree.** A separate git working directory bound to its own branch. Vibestrate creates one per run under `git.worktreeDir`. See [Worktree](/docs/concepts/worktree).

**Workflow.** The static, ordered description of stages a run progresses through. See [Workflow](/docs/concepts/workflow).
