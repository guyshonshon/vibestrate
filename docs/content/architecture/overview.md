---
title: Architecture overview
description: How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.
section: architecture
slug: architecture/overview
---

Vibestrate is a single Node process that orchestrates other local processes. There is no daemon, no service mesh, no cloud component.

## The components

Here is how the pieces stack up, from the command you type down to the model on your machine.

```text
                ┌──────────────────────────────────────────┐
                │                vibe CLI                       │
                │     (commander program in src/cli)       │
                └──────────────┬───────────────────────────┘
                               │
                ┌──────────────▼───────────────────────────┐
                │            Orchestrator                  │
                │      (src/core/orchestrator.ts)          │
                │                                          │
                │   drives the workflow stage-by-stage,    │
                │   transitions the state machine,         │
                │   writes artifacts under .vibestrate/runs/    │
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

The `vibe` CLI is the commander program in `src/cli`, and it hands work to the Orchestrator in `src/core/orchestrator.ts`. The orchestrator runs the show, and below it sit three siblings. Agents live in `src/agents`: the planner, executor, reviewer, and the rest. Validation lives in `src/core/validation-runner` and runs your commands. Mission Control is a Fastify server plus a React UI, split across `src/server` and `src/ui`. Agents reach down through the Providers in `src/providers` (claude, codex, aider, ollama, opencode), which call a local CLI binary on your machine.

## What the orchestrator owns

The orchestrator keeps a run moving and remembers where it is. It owns:

- Stage sequencing - driving a run through the workflow.
- State machine transitions - calling `assertTransition` before every move.
- Worktree lifecycle - create, bind a branch, commit per stage.
- Artifact persistence - every prompt, response, decision, and event under `.vibestrate/runs/<runId>/`.
- Approval handling - pause for `waiting_for_approval`, resume on decide.
- Pause/resume - the user-requested pause flag, durable across restarts.

## What an agent invocation does

An agent invocation is one stage handing a task to a model and turning the result into a usable artifact.

For each stage that runs a model:

1. Build the prompt - role template + project rules + skills + task + prior artifacts.
2. Resolve the provider - agent config or run override.
3. Apply the permission profile - `readOnly`, `code_write`, etc.
4. Stream the provider call - capturing stdout/stderr + metrics.
5. Parse the output - into the role's expected artifact shape.
6. Validate the artifact - Zod schema or per-role contract.
7. Persist the artifact.
8. Return control to the orchestrator.

## What Mission Control reads

Mission Control is the dashboard, and it watches far more than it touches.

The Fastify server in `src/server/` exposes read-only routes over the persisted state - `.vibestrate/runs/`, `project.yml`, the provider registry, the skills index. Write-side routes are narrow and audited: approval decisions, pause/resume requests, suggestion bundle applies. The browser never executes arbitrary commands.

## What's deliberately *not* in the architecture

Some things are missing on purpose. Each absence is a choice about where Vibestrate stops.

- **No global daemon.** When you close the terminal, Vibestrate's process ends. Runs that are mid-stage end with it (most cleanly at the next stage boundary because of how pause works under the hood).
- **No remote.** No relay, no telemetry beacon, no automatic update check.
- **No model API.** Vibestrate doesn't hold tokens. The local provider CLIs do that themselves.
- **No OS sandboxing.** Path guards and permission profiles refuse risky operations, but they're enforced by Vibestrate itself, not by the OS.

## Related

- [Repository map](/docs/architecture/directory-map) - where each module lives.
- [Run state](/docs/concepts/state) - what the orchestrator drives transitions through.
