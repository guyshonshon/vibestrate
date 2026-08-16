---
title: Architecture overview
description: How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.
slug: architecture/overview
---

Vibestrate is a single Node process that orchestrates other local processes. There is no daemon, no service mesh, no cloud component.

The `vibe` CLI hands work to the orchestrator in `src/core/orchestrator.ts`, which drives a run stage by stage, moves the run state machine, and writes every artifact under `.vibestrate/runs/`. Three siblings sit below it: agents in `src/agents`, validation in `src/core/validation/`, and Mission Control - a Fastify server in `src/server` plus a React dashboard in `src/ui`.

Agents reach a model through the providers in `src/providers` (11 built in, including claude, codex, gemini and ollama). A provider runs a CLI binary already installed on your machine. Vibestrate holds no model API tokens - the provider CLIs hold their own. Path guards and permission profiles are enforced by Vibestrate, not the OS.

## The components

```text
vibe CLI  (src/cli)
   |
   v
Orchestrator  (src/core/orchestrator.ts)
   |
   +--> Agents  (src/agents)
   |       |
   |       v
   |     Providers  (src/providers)
   |       |
   |       v
   |     Local CLI binary on your machine
   |
   +--> Validation  (src/core/validation/)
   |
   +--> Mission Control  (src/server + src/ui)
```

## What the orchestrator owns

The orchestrator keeps a run moving and remembers where it is. It owns:

- Stage sequencing - driving a run through the workflow.
- State machine transitions - `assertTransition` before every move.
- Worktree lifecycle - create, bind a branch, commit per stage.
- Artifact persistence - every prompt, response, decision, and event.
- Approval handling - pause for `waiting_for_approval`, resume on decide.
- Pause/resume - the pause flag, durable across restarts.

## An agent invocation

An agent invocation is one stage handing a task to a model and turning the result into a usable artifact.

For each stage that runs a model:

1. Build the prompt - role template + project rules + skills + task + prior artifacts.
2. Resolve the provider - agent config or run override.
3. Apply the permission profile - `read_only`, `code_write`, and the rest.
4. Stream the provider call - capturing stdout/stderr + metrics.
5. Parse the output - into the role's expected artifact shape.
6. Validate the artifact - Zod schema or per-role contract.
7. Persist the artifact.
8. Return control to the orchestrator.

## What Mission Control sees

Mission Control is the dashboard, and it watches far more than it touches.

The Fastify server in `src/server/` exposes read-only routes over the persisted state - the runs directory, `project.yml`, the provider registry, the skills index. Write-side routes are narrow and audited: approval decisions, pause/resume requests, suggestion bundle applies. The browser never executes arbitrary commands.

## Deliberately missing

Some things are missing on purpose. Each absence is a choice about where Vibestrate stops.

- **No global daemon.** When you close the terminal, Vibestrate's process ends. Runs that are mid-stage end with it (most cleanly at the next stage boundary because of how pause works under the hood). The queue scheduler is the near miss: it can outlive the command that started it, but it exits once the queue drains rather than staying resident.
- **No remote by default.** No relay, no telemetry beacon, no automatic update check, nothing running between you and your models. The two exceptions are both things you trigger by hand: the flow hub, when you search or install, and `vibe telemetry export`, which sends one finished run's metrics to a collector you name and run.
- **No model API.** Vibestrate doesn't hold tokens. The local provider CLIs do that themselves.
- **No OS sandboxing.** Path guards and permission profiles refuse risky operations, but they're enforced by Vibestrate itself, not by the OS.

## Related

- [Repository map](/docs/architecture/directory-map) - where each module lives.
- [Run state](/docs/concepts/state) - what the orchestrator drives transitions through.
- [HTTP API](/docs/architecture/http-api) - the routes Mission Control is built on.
