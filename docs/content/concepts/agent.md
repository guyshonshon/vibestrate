---
title: Agent
description: A scoped execution unit — one role in the workflow, bound to a provider, a prompt template, a permission profile, and any attached skills.
section: concepts
slug: concepts/agent
---

**Professional explanation.** An agent is a scoped execution unit that receives task context, a role-specific instruction template, a permission profile, and access to a configured provider. It performs one named role inside a workflow — for example *planner* or *reviewer* — and produces a structured artifact the orchestrator routes to the next stage.

**Simple explanation.** An agent is a worker with a job and a set of rules. You assign each role to a provider — Claude Code, Codex, Ollama — and the agent stays in its lane.

## Why it matters

Splitting a task into named agent roles is what makes Amaco's loop inspectable. The planner only plans. The reviewer only reviews. When something goes wrong, you can read each role's output independently and see where the chain broke.

It also lets you mix models. The planner might be a strong reasoning model. The executor might be a cheap, fast one. The reviewer might be a different vendor's model entirely, so it doesn't share the same blind spots as the executor.

## The six built-in agents

Each is a configured row under `agents:` in `project.yml`. The role names are fixed; the provider, prompt template, permission profile, and skill list are yours to set.

| Role | What it does |
|---|---|
| `planner` | Reads the task and produces a structured plan. |
| `architect` | Expands the plan with module boundaries and interfaces. |
| `executor` | Edits files in the worktree. |
| `fixer` | Addresses review findings without rebuilding from scratch. |
| `reviewer` | Critiques the diff against the plan, returns APPROVED / CHANGES_REQUESTED / BLOCKED. |
| `verifier` | Final gate before `merge_ready` — checks for unresolved findings and validation gaps. |

See the [agents reference](/docs/reference/agents) for the source of each role's prompt template.

## How an agent's prompt is assembled

For each agent invocation, Amaco builds the prompt from:

1. The role's template (e.g. `.amaco/agents/planner.md`).
2. The project rules file (`.amaco/rules.md`).
3. Any attached skills — both the agent's configured skills and per-run skills.
4. The current task description.
5. The artifacts produced by previous stages (plan, architecture, diff, validation output).

The order matters: project rules come first so they bind the agent's behavior; skills follow as domain context; the task description and prior artifacts come last as the immediate brief.

## Common mistakes

- **Assigning the same model to planner and reviewer.** They'll agree with themselves. Use different vendors for the contrast.
- **Loading every skill on every agent.** Each skill is more context the agent has to process. Attach skills to the role that actually uses them.
- **Editing the prompt template to add task-specific instructions.** Templates are durable; task-specific instructions go in the task description.

## Related

- [Provider](/docs/concepts/provider) — what an agent talks to.
- [Skill](/docs/concepts/skill) — what an agent reads as domain context.
- [Workflow](/docs/concepts/workflow) — the sequence of agents in a run.
