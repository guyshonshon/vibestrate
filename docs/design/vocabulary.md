# Vocabulary (canonical terms)

The settled names for Amaco's core concepts (Epic D / D1). Use these in code,
config, UI, and docs. The goal is as few, as clear concepts as possible.

| Term | Means | Not |
|---|---|---|
| **Role** | A seat in the workflow — planner, architect, executor, fixer, reviewer, verifier. Has a prompt, a permission profile, skills, and a bound provider. | ~~Agent~~ (renamed; see below) |
| **Provider** | A local coding-agent CLI that supplies the model (Claude Code, Codex, Aider, Ollama, OpenCode). One provider can back many roles. | ~~Engine~~ (rejected) |
| **Crew** | The set of roles working a run; also the dashboard page that shows roles and the providers they run on. | — |
| **Flow** | A reusable, versioned recipe of ordered steps + roles + approval gates. The fixed plan→build→verify workflow is the built-in **default flow**. Edited in the **Flow Builder**. | ~~Guide~~ (renamed to Flow) |
| **Task** | The plain-language request the user submits. | — |
| **Run** | One execution of a task (its own runId, worktree, artifacts, state). | — |
| **Supervisor** | The product role Amaco plays for the user — the review/verification layer over coding agents. | — |
| **Orchestrator** | The internal engine that drives a run's stages. | — |

## Agent → Role

"Agent" is renamed to **Role** across config, API, code, and UI. One rule
keeps the rename honest:

- **Only the internal seat concept is renamed.** The phrase *"coding-agent
  CLI"* / *"AI coding agents"* refers to the external **provider** tools — the
  industry's term for Claude Code, Codex, etc. That prose stays; it is not the
  role concept.

It is a **clean rename — no backward-compatibility shims.** Amaco is
pre-release beta with no published-user config or run history to preserve, so
the old names are simply replaced, not dual-read:

- Config key `agents:` → `roles:` (no fallback read of `agents:`).
- Prompt scaffolding `.amaco/agents/<role>.md` → `.amaco/roles/<role>.md`.
- Metrics field `agentId` → `roleId`.
- Event types `agent.started|completed|failed` → `role.started|completed|failed`.

## Page model

The dashboard merges the separate **Agents** and **Providers** pages into one
**Crew** page: a Roles section (each role → its provider, permissions, skills)
and a Providers section (detect / configure / test the CLIs). This is what
makes the role↔provider relationship legible in one place.
