---
title: Repository map
description: A tour of the source tree, showing what lives where and where to start reading.
section: architecture
slug: architecture/directory-map
---

This is a tour of `src/`, the source tree. The list isn't exhaustive, since small helpers are omitted, but every top-level directory and stable extension point appears here.

## The frontends

- `src/cli/` - the commander program, the command-line entry point. `index.ts` builds the command tree (exported as `buildVibestrateProgram` so the docs generator can introspect it without parsing argv); each command's implementation lives under `src/cli/commands/`, grouped by area.
- `src/server/` - the local Fastify HTTP/SSE API behind `vibe ui`, one route module per domain, plus the static serving of the built dashboard.
- `src/ui/` - the React dashboard SPA (Mission Control), built separately and served by the server.
- `src/shell/` - the Ink TUI behind `vibe shell`.

Read first: `src/cli/index.ts`, `src/server/server.ts`.

## `src/core/`

The run engine and the surrounding plumbing.

- `orchestrator.ts` - drives a run through its flow steps.
- `state-machine.ts` - the run status enum + transition allowlist.
- `path-guard.ts` - refuses reads/writes outside known-safe roots.
- `validation-runner.ts` - runs `commands.validate`.
- `artifact-store.ts` - reads and writes per-run artifacts.
- `prompt-builder.ts` - assembles the prompt for an agent invocation.
- `approval-service.ts` - manages `waiting_for_approval` and decisions.
- `pause-service.ts` - durable pause flag.
- `assist/` - the one-shot, read-only, broker-gated provider call returning schema-validated JSON; the primitive consult and spec-up build on.
- `saga/` - the multi-step saga run: the between-steps supervisor turn, invariants ledger, and budget.
- `execution/` - pluggable run execution backends (local worktree, Docker).
- `workflow/` - the default workflow stage list and its schemas/types.

Read first: `src/core/state-machine.ts`, `src/core/orchestrator.ts`.

## `src/supervisor/`

The supervisor decision layer that shapes a run before the engine executes it: personas and archetypes, review lenses, flow sizing, workflow selection, posture, and protected paths.

Read first: `src/supervisor/select-workflow.ts`.

## `src/flows/`

The Flow system.

- `schemas/flow-schema.ts` - the Zod schema for `FlowDefinition`.
- `catalog/builtin-flows.ts` - the built-in flow catalog.
- `catalog/flow-discovery.ts` - project Flow discovery.
- `runtime/` - the participant ledger, arbitration, context builder.

Read first: `src/flows/catalog/builtin-flows.ts`.

## `src/agents/`

Who runs a seat: the crew -> role -> profile -> skills configuration chain.

- `crew-registry.ts` / `crew-schema.ts` / `crew-presets.ts` - the Crew (team of roles) a run uses.
- `role-registry.ts` / `role-schema.ts` - Role config.
- `default-roles.ts` + `default-prompts/<role>.md` - the built-in roles and their prompt templates.
- `profile-schema.ts` / `profile-usage.ts` - Profiles (how strong/expensive a role runs).
- `skill-discovery.ts` / `skill-loader.ts` / `skill-assignment-service.ts` - skill packs and their assignment to roles.

Read first: `src/agents/crew-registry.ts`.

## `src/providers/`

Local provider integration. A provider is the agent backend, such as a generic CLI or Claude Code, that Vibestrate invokes.

- `provider-schema.ts` - the discriminated union of provider kinds.
- `provider-detection.ts` - the static `KNOWN_PROVIDERS` registry and the runtime detector.
- `provider-runner.ts` - the uniform invocation interface.
- `claude-code-provider.ts` - the deeper Claude Code integration.
- `presets/` - verified flag sets for `presetReady` providers.
- `mcp/` - MCP server config resolution and the materialized `mcp.json` writer.

Read first: `src/providers/provider-detection.ts`.

## `src/project/`

Project config.

- `config-schema.ts` - the root `projectConfigSchema`.
- `config-loader.ts` - reads and validates `.vibestrate/project.yml`.
- `project-detector.ts` - finds the project root and infers language.

Read first: `src/project/config-schema.ts`.

## `src/safety/` and `src/policies/`

The guardrail cluster.

- `safety/` - the Action Broker (allow/deny/require_approval per effect), the apply gateway, the diff gate, run assurance, access-policy evaluation, and permission profiles (`read_only`, `code_write`, etc.).
- `policies/` - owner-taught project policy rules and the engine that enforces them at review/merge time.

Read first: `src/safety/action-broker.ts`.

## `src/git/`

Git plumbing: worktrees, merge/conflict services, init, commit credit - plus the gated merge-preview (`integration-service.ts`, `merge-advisor.ts`) that dry-runs real merges into an integration branch, never main.

## The remaining domains

- `src/roadmap/` - the roadmap/task domain: stores, planner, proposals, dependency graph.
- `src/reviews/` - review suggestions and suggestion bundles (applying reviewer findings as patches).
- `src/scheduler/` - the managed background scheduler process and run queue.
- `src/setup/` - onboarding: setup service, doctor, provider setup, config updates.
- `src/notifications/` - notification service, router, rules, and delivery gateways.
- `src/consult/` - project-aware read-only Q&A over controlled context.
- `src/spec-up/` - the Spec-up phase: a chain of fresh read-only runs glued by consult.
- `src/terminal/` - the PTY terminal session feature.
- `src/workspace/` - the multi-project navigator.
- `src/utils/` - shared low-level helpers (fs, json, paths, time, run ids, file mutex, OS detection).

## Top-level dirs

These directories sit at the repository root, alongside `src/`.

- `docs/` - this docs system, both content and generated metadata.
- `scripts/` - utility scripts including `generate-docs-metadata.ts`.
- `tests/` - Vitest test suite.
- `.vibestrate/` - your project's local Vibestrate state (created by `vibe init`).
