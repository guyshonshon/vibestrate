---
title: Repository map
description: A tour of the source tree, showing what lives where and where to start reading.
slug: architecture/directory-map
---

## In simple words

A tour of `src/`. Not exhaustive - small helpers are omitted - but every top-level directory and stable extension point is here.

```
src/
  core/        the run engine and its state
  agents/      who runs a seat
  providers/   adapters over the CLIs
  flows/       recipes and their schema
  safety/      the Action Broker
  policies/    your rules
  ui/          Mission Control
  cli/         the vibe command
```

<div class="docs-callout tip">

**Tip.** To find where a *behaviour* lives, its concept page is usually faster than this map - most name the file that owns them at the end of their Going deeper section.

</div>

## The four you will touch most

<div class="docs-cards">

**`core/`**
The run engine: state, steps, the brief carried between turns.

**`providers/`**
Thin adapters over the CLIs. Adding a provider starts here.

**`flows/`**
Flow definitions and the schema that validates them.

**`safety/` and `policies/`**
The gate every effect crosses, and the rules it consults.

</div>

<div class="docs-callout">

**Did you know?** The state machine deliberately sits at the root of `core/` rather than a subdirectory. It is the thing everything else agrees with, and burying it one level down made it read as an implementation detail of whichever folder it landed in.

</div>


## Going deeper

### The shape of `src/`

```text
cli/            the vibe command-line program
server/         local HTTP/SSE API behind vibe ui
ui/             React dashboard (Mission Control)
shell/          Ink TUI behind vibe shell
core/           run engine, state machine, stores,
                metrics, validation, context
supervisor/     picks persona, lens, flow, posture
flows/          Flow schema, catalog, runtime, hub
agents/         crew -> role -> profile -> skills
providers/      local CLIs, adapters, MCP config
project/        .vibestrate/project.yml schema
safety/         Action Broker, apply gateway
policies/       owner-taught project rules
git/            worktrees, merges, merge-preview
roadmap/        tasks, planner, proposals
reviews/        review suggestions and bundles
scheduler/      background run queue
setup/          onboarding, doctor, provider setup
notifications/  rules, routing and delivery
consult/        read-only project Q&A + handbook
spec-up/        the Spec-up phase
terminal/       PTY terminal sessions
workspace/      multi-project navigator
utils/          fs, json, paths, time, run ids
```

### The frontends

- `src/cli/` - the commander program. `index.ts` builds the command tree (exported as `buildVibestrateProgram` so the docs generator can introspect it without parsing argv); implementations live under `src/cli/commands/`, grouped by area.
- `src/server/` - the Fastify HTTP/SSE API behind `vibe ui`, one route module per domain in `routes/`, plus `security.ts` and static serving of the built dashboard.
- `src/ui/` - the React dashboard SPA, built separately and served by the server. `app/routes/` is one file per screen; `lib/cli-hints.ts` maps each route to its equivalent commands.
- `src/shell/` - the Ink TUI behind `vibe shell`. `ink/pages/` is one file per screen.

Read first: `src/cli/index.ts`, `src/server/server.ts`.

### `src/core/`

The run engine. At the root live the hubs everything shares:

- `orchestrator.ts` - drives a run through its flow steps.
- `state-machine.ts` - run statuses and the transition allowlist.
- `diff-service.ts` - diffs, secret detection and redaction.
- `path-guard.ts` - refuses reads and writes outside known-safe roots.
- `policy-engine.ts` - the preflight gate that refuses a run whose config could write outside the worktree.
- `provider-resilience.ts` - classifies a provider failure and picks the backoff.
- `run-entry.ts`, `effort-heuristic.ts`, `guarded-fetch.ts`, `error-format.ts`, `detached-run.ts`.

The domain clusters:

- `run-engine/` - the orchestrator's extracted machinery: flow state, outputs, resume seeding, validation, reporting, the approval gate, the budget governor, saga turns.
- `run/` - run lifecycle and gates: launcher, lock, pause, approvals, phase snapshots, merge readiness, audits, replay, briefs.
- `stores/` - append-only per-run persistence: artifacts, events, issues, provider streams, notes, control directives.
- `metrics/` - token and cost schemas, pricing, the store, spend caps, the OTLP exporter, dashboard roll-ups.
- `validation/` - validation execution and validation-profile management.
- `context/` - what feeds the agents: prompt builder, context sources, the project ledger and its digest, known methodologies.
- `codebase/` - read-only project and git inspection for the dashboard: search, watch, file tree and view, history, annotations.
- `assist/` - the one-shot, read-only, broker-gated provider call returning schema-validated JSON; the primitive consult and spec-up build on.
- `saga/` - the multi-step saga run: the between-steps supervisor turn, invariants ledger, budget.
- `execution/` - pluggable run execution backends (local worktree, Docker).
- `workflow/` - the default stage list and its schemas.

Read first: `src/core/state-machine.ts`, `src/core/orchestrator.ts`.

### `src/flows/`

- `schemas/flow-schema.ts` - the Zod schema for `FlowDefinition`.
- `catalog/builtin-flows.ts` - the built-in catalog; `catalog/flows/` holds the definitions themselves.
- `catalog/flow-discovery.ts` - project flow discovery, one directory per flow.
- `runtime/` - the participant ledger, arbitration, context builder.
- `authoring/flow-assist.ts` - drafts a flow from an English description, or revises the one being edited.
- `hub/` - the Flows Hub client and its pre-publish secret and leak guards.

Read first: `src/flows/catalog/flows/core.ts`.

### `src/agents/`

The crew -> role -> profile -> skills chain.

- `crew-registry.ts` / `crew-schema.ts` / `crew-presets.ts` - the Crew a run uses.
- `role-registry.ts` / `role-schema.ts` - Role config and the JSON role file.
- `default-roles.ts` plus `default-prompts/<role>.json` - the built-in roles and their prompt templates.
- `profile-schema.ts` / `profile-usage.ts` - Profiles.
- `skill-discovery.ts` / `skill-loader.ts` / `skill-assignment-service.ts` - skill packs and their assignment to roles.

Read first: `src/agents/crew-registry.ts`.

### `src/providers/`

- `provider-schema.ts` - the discriminated union of the four provider kinds.
- `provider-detection.ts` - the static `KNOWN_PROVIDERS` registry and the runtime detector.
- `provider-apply.ts` - which model and effort flags each provider actually accepts.
- `provider-runner.ts` - the uniform invocation interface.
- `claude-code-provider.ts` - the deeper Claude Code integration.
- `presets/` - verified flag sets for `presetReady` providers.
- `adapters/` - per-provider output adapters.
- `mcp/` - MCP server config resolution and the materialized `mcp.json` writer.

Read first: `src/providers/provider-detection.ts`.

### The remaining domains

- `src/supervisor/` - the decision layer shaping a run before the engine executes it: personas and archetypes, review lenses, flow sizing, workflow selection, posture, protected paths. Read first: `select-workflow.ts`.
- `src/project/` - `config-schema.ts` (the root `projectConfigSchema`), `config-loader.ts`, `project-detector.ts`, and `init-template.ts`, which is exactly what `vibe init` writes.
- `src/safety/` - the Action Broker (allow/deny/require_approval per effect), the apply gateway, the diff gate, run assurance, access-policy evaluation, permission profiles. Read first: `action-broker.ts`.
- `src/policies/` - owner-taught policy rules and the engine enforcing them at review and merge time.
- `src/git/` - worktrees, merge and conflict services, init, commit credit, plus the gated merge-preview (`integration-service.ts`, `merge-advisor.ts`) dry-running real merges into an integration branch, never main.
- `src/setup/` - `doctor-service.ts` (the report both `vibe doctor` and the Setup page render), `setup-service.ts`, `provider-setup-service.ts`, `config-view.ts`, `config-update-service.ts`.
- `src/roadmap/` - tasks: stores, planner, proposals, dependency graph.
- `src/reviews/` - review suggestions and suggestion bundles.
- `src/scheduler/` - the managed background scheduler process and run queue.
- `src/notifications/` - notification service, router, rules, local delivery gateways.
- `src/consult/` - read-only Q&A over controlled context, plus the compiled handbook corpus.
- `src/spec-up/` - a chain of fresh read-only runs glued by consult.
- `src/terminal/` - PTY terminal sessions.
- `src/workspace/` - the multi-project navigator behind **All projects**.
- `src/utils/` - fs, json, paths, time, run ids, file mutex, OS detection.

### Top-level dirs

- `docs/` - this docs system: `content/` is handwritten, `generated/` is derived from source by `scripts/generate-docs-metadata.ts`, and `content/_nav.json` is the only source of truth for navigation.
- `scripts/` - utility scripts, including the docs generator.
- `tests/` - the Vitest suite.
- `.vibestrate/` - your project's local state, created by `vibe init`.
