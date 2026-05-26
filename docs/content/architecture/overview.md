---
title: Architecture overview
description: How Amaco's pieces fit together — orchestrator, providers, agents, state machine, worktrees, dashboard.
section: architecture
slug: architecture/overview
---

Amaco is a single Node process that orchestrates other local processes. There is no daemon, no service mesh, no cloud component.

## The components

```text
                ┌──────────────────────────────────────────┐
                │              amaco CLI                   │
                │     (commander program in src/cli)       │
                └──────────────┬───────────────────────────┘
                               │
                ┌──────────────▼───────────────────────────┐
                │            Orchestrator                  │
                │      (src/core/orchestrator.ts)          │
                │                                          │
                │   drives the workflow stage-by-stage,    │
                │   transitions the state machine,         │
                │   writes artifacts under .amaco/runs/    │
                └──────────────┬───────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────────┐
        │                      │                          │
        ▼                      ▼                          ▼
  ┌──────────┐         ┌────────────┐            ┌─────────────────┐
  │  Agents  │         │ Validation │            │ Mission Control │
  │ (src/agents)       │ (src/core/ │            │ (src/server +   │
  │          │         │  validation-           │  src/ui)        │
  │ planner, │         │  runner)   │            │                 │
  │ executor,│         │            │            │ Fastify server  │
  │ reviewer,│         │ runs your  │            │ + React UI      │
  │ ...      │         │ commands   │            │                 │
  └────┬─────┘         └────────────┘            └─────────────────┘
       │
       ▼
  ┌──────────────────┐
  │    Providers     │
  │ (src/providers)  │
  │                  │
  │ claude, codex,   │
  │ aider, ollama,   │
  │ opencode         │
  └────┬─────────────┘
       │
       ▼
  ┌──────────────────┐
  │ Local CLI binary │
  │ (your machine)   │
  └──────────────────┘
```

## What the orchestrator owns

- Stage sequencing — driving a run through the workflow.
- State machine transitions — calling `assertTransition` before every move.
- Worktree lifecycle — create, bind a branch, commit per stage.
- Artifact persistence — every prompt, response, decision, and event under `.amaco/runs/<runId>/`.
- Approval handling — pause for `waiting_for_approval`, resume on decide.
- Pause/resume — the user-requested pause flag, durable across restarts.

## What an agent invocation does

For each stage that runs a model:

1. Build the prompt — role template + project rules + skills + task + prior artifacts.
2. Resolve the provider — agent config or run override.
3. Apply the permission profile — `readOnly`, `code_write`, etc.
4. Stream the provider call — capturing stdout/stderr + metrics.
5. Parse the output — into the role's expected artifact shape.
6. Validate the artifact — Zod schema or per-role contract.
7. Persist the artifact.
8. Return control to the orchestrator.

## What Mission Control reads

The Fastify server in `src/server/` exposes read-only routes over the persisted state — `.amaco/runs/`, `project.yml`, the provider registry, the skills index. Write-side routes are narrow and audited: approval decisions, pause/resume requests, suggestion bundle applies. The browser never executes arbitrary commands.

## What's deliberately *not* in the architecture

- **No global daemon.** When you close the terminal, Amaco's process ends. Runs that are mid-stage end with it (most cleanly at the next stage boundary because of how pause works under the hood).
- **No remote.** No relay, no telemetry beacon, no automatic update check.
- **No model API.** Amaco doesn't hold tokens. The local provider CLIs do that themselves.
- **No OS sandboxing.** Path guards and permission profiles refuse risky operations, but they're enforced by Amaco itself, not by the OS.

## Related

- [Repository map](/docs/architecture/directory-map) — where each module lives.
- [Run state](/docs/concepts/state) — what the orchestrator drives transitions through.
