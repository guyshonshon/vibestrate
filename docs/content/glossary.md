---
title: Glossary
description: Beginner-friendly definitions for the terms used throughout Amaco's docs.
section: ops
slug: glossary
---

Short definitions for the vocabulary Amaco's docs assume.

**Agent.** A worker with one role in a workflow — planner, executor, reviewer. Bound to a provider, a prompt template, a permission profile, and any attached skills. See [Agent](/docs/concepts/agent).

**Approval gate.** A point in a workflow or Guide where the orchestrator pauses for explicit human approval. Configured via `policies.requireApprovalAtStages` or step `kind: approval-gate` in a Guide.

**Artifact.** Any file produced or recorded by a run — plan, architecture, diff, validation output, review findings, verification summary. Lives under `.amaco/runs/<runId>/`.

**CLI.** The `amaco` command-line tool. The primary surface, alongside Mission Control.

**Effort.** A coarse bucket — `low | medium | high` — that maps to a provider via `effortMap` in `project.yml`. Used as a shorthand for "run this on the cheap model" vs "run this on the expensive model."

**Guide.** A saved run recipe. Like the default workflow, but with named slots, custom step ordering, optional gates, and bounded repeats. See [Guide](/docs/concepts/guide).

**Mission Control.** The local web dashboard, served by `amaco ui`. Inspect runs, approve gates, read diffs, edit config.

**Orchestrator.** The component that drives a run through its stages. Lives in `src/core/orchestrator.ts`. Transitions the state machine, persists artifacts, hands off between agents.

**Permission profile.** A named set of allowed and disallowed actions for an agent — `read_only`, `code_write`, etc. Declared under `permissions.profiles` in `project.yml`. Attached to each agent via `agents.<role>.permissions`.

**Phase.** Same as stage. (Internally, "stage" is the term.)

**Plan.** The planner agent's structured output. The first stage of the default workflow produces it.

**Project root.** The git repository where `amaco init` was run. Where `.amaco/` lives.

**Provider.** A local CLI Amaco can drive to talk to a model. Claude Code, Codex, Aider, Ollama, OpenCode are the built-in ones. See [Provider](/docs/concepts/provider).

**Replay.** The read-only inspector for a persisted run. `amaco replay <runId>`.

**Roadmap task.** An entry in `.amaco/roadmap/roadmap.json` that you can link a run to via `--task <taskId>`. Separate from the run itself.

**Run.** A live instance of the workflow, born from a task. Has its own runId, worktree, branch, status, artifacts, events.

**Skill.** A markdown attachment that loads alongside an agent's prompt. Lives under `.amaco/skills/` or `.claude/skills/`. See [Skill](/docs/concepts/skill).

**Slot.** A named participant in a Guide — `builder`, `challenger`, `arbiter`. Each slot has a default agent and can be bound to a specific provider per run.

**Stage.** One step in the workflow — `planning`, `executing`, etc. Each stage has an entering status and an exiting status.

**State machine.** The set of legal run-status transitions. Enforced by `assertTransition` in `src/core/state-machine.ts`.

**Status.** The current state of a run. Drawn from a fixed enum: `created`, `planning`, `planned`, ... `merge_ready`, `blocked`, `failed`, `aborted`. See [Run state](/docs/concepts/state).

**Task.** A description of what you want done, submitted to Amaco. Triggers a run. See [Task](/docs/concepts/task).

**Terminal status.** One of `merge_ready`, `blocked`, `failed`, `aborted`. Once reached, a run cannot transition out.

**Validation.** The stage that runs `commands.validate` from `project.yml` — typecheck, tests, build, lint. The ground-truth check between executor and reviewer.

**Worktree.** A separate git working directory bound to its own branch. Amaco creates one per run under `git.worktreeDir`. See [Worktree](/docs/concepts/worktree).

**Workflow.** The static, ordered description of stages a run progresses through. See [Workflow](/docs/concepts/workflow).
