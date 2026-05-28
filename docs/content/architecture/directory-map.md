---
title: Repository map
description: A tour of the source tree — what lives where, and where to start reading.
section: architecture
slug: architecture/directory-map
---

A flowd tour of `src/`. The list isn't exhaustive — small helpers and utilities are omitted — but every stable extension point appears here.

## `src/cli/`

The commander program. `index.ts` builds the command tree (exported as `buildVibestrateProgram` so the docs generator can introspect it without parsing argv). Each command's implementation lives under `src/cli/commands/`, grouped by area.

Read first: `src/cli/index.ts`.

## `src/core/`

The orchestrator and the surrounding plumbing.

- `orchestrator.ts` — drives a run through its stages.
- `state-machine.ts` — the run status enum + transition allowlist.
- `path-guard.ts` — refuses writes outside known-safe roots.
- `validation-runner.ts` — runs `commands.validate`.
- `artifact-store.ts` — reads and writes per-run artifacts.
- `prompt-builder.ts` — assembles the prompt for an agent invocation.
- `approval-service.ts` — manages `waiting_for_approval` and decisions.
- `pause-service.ts` — durable pause flag.

Read first: `src/core/state-machine.ts`, `src/core/orchestrator.ts`.

## `src/workflow/`

The default workflow definition.

- `default-workflow.ts` — the array of stages and the role per stage.
- `workflow-schema.ts` — Zod schemas for workflow config.
- `workflow-types.ts` — the `RunStatus` type and `TERMINAL_STATUSES`.

Read first: `src/workflow/default-workflow.ts`.

## `src/agents/`

Agent role schema and built-in prompt templates.

- `agent-schema.ts` — `agentConfigSchema` and the list of built-in roles.
- `default-prompts/<role>.md` — the role-specific prompt templates copied into a fresh `.vibestrate/agents/` on `vibe init`.

Read first: `src/agents/agent-schema.ts`.

## `src/providers/`

Local provider integration.

- `provider-schema.ts` — the discriminated union for cli vs. claude-code providers.
- `provider-detection.ts` — the static `KNOWN_PROVIDERS` registry and the runtime detector.
- `provider-runner.ts` — the uniform invocation interface.
- `provider-capabilities.ts` — capability map per provider config.
- `claude-code-provider.ts` — the deeper Claude Code integration.
- `presets/` — verified flag sets for `presetReady` providers.

Read first: `src/providers/provider-detection.ts`.

## `src/skills/`

Skill discovery and assignment.

- `skill-schema.ts` — the `LoadedSkill` shape.
- `skill-discovery.ts` — filesystem walker for `.vibestrate/skills/` + `.claude/skills/`.
- `skill-loader.ts` — reads a skill file into a runtime object.
- `skill-assignment-service.ts` — attaches skills to agents.

Read first: `src/skills/skill-discovery.ts`.

## `src/flows/`

The Flow system.

- `schemas/flow-schema.ts` — the Zod schema for `FlowDefinition`.
- `catalog/builtin-flows.ts` — the `quality-arbitration` built-in.
- `catalog/flow-discovery.ts` — project Flow discovery.
- `runtime/` — the participant ledger, arbitration, context builder.

Read first: `src/flows/catalog/builtin-flows.ts`.

## `src/project/`

Project config.

- `config-schema.ts` — the root `projectConfigSchema`.
- `config-loader.ts` — reads and validates `.vibestrate/project.yml`.
- `project-detector.ts` — finds the project root and infers language.
- `init-template.ts` — the files written by `vibe init`.

Read first: `src/project/config-schema.ts`.

## `src/server/` + `src/ui/`

Mission Control.

- `src/server/` — Fastify routes, WebSocket, static-file serving.
- `src/ui/` — the React app served by the server.

Read first: `src/server/index.ts`.

## `src/scheduler/`

Background scheduler for queued runs.

- `state.json` — durable queue snapshot.
- The scheduler can be managed in-process by `vibe ui` (`--no-scheduler` opts out).

## `src/policies/` and `src/permissions/`

- `policies` — repo-level policy rules and the policy engine.
- `permissions` — per-agent permission profiles (`read_only`, `code_write`, etc.).

## `src/notifications/`

Local notifications + delivery gateways.

## Top-level dirs

- `docs/` — this docs system, both content and generated metadata.
- `scripts/` — utility scripts including `generate-docs-metadata.ts`.
- `tests/` — Vitest test suite.
- `.vibestrate/` — your project's local Vibestrate state (created by `vibe init`).
