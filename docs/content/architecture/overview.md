---
title: Architecture overview
description: How Vibestrate's pieces fit together, from the orchestrator down to the local CLI binary.
slug: architecture/overview
---

## In simple words

Vibestrate is a single Node process orchestrating other local processes. No daemon, no service mesh, no cloud component.

```
you -> vibe (one Node process)
         |-- spawns your coding-agent CLIs as child processes
         |-- manages a git worktree per run
         `-- serves Mission Control on demand
```

Mission Control is that last line: `vibe ui` starts a local Fastify server on `127.0.0.1:4317` and serves the dashboard from the same process. That is the surface you work in; `vibe` drives the same machinery from a script.

<div class="docs-callout tip">

**Tip.** "Single process, no daemon" is literal. Nothing runs when you are not running it: no background service to stop, no port held open, nothing to uninstall beyond the package.

</div>

## The four things it owns

<div class="docs-cards">

**Spawning providers**
Your CLIs, as child processes, reading their stdout.

**A worktree per run**
Created at start, named for the run, left on disk afterwards.

**The record**
Decisions, tokens, spend and artifacts, written locally as it happens.

**The gate**
Every side-effecting action crosses the Action Broker.

</div>

<div class="docs-callout">

**Did you know?** Vibestrate is never in the middle of a model call. Prompts and responses travel directly between the vendor CLI and the vendor's servers; Vibestrate builds the prompt, hands it over and reads what comes back. That is why it holds no API keys.

</div>


## The components

```text
vibe CLI  (src/cli)        Mission Control  (src/server + src/ui)
   |                              |
   +--------------+---------------+
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
```

Both front doors land on the same orchestrator. `vibe shell` is a third, drawing the same surfaces in the terminal.

## The type map

Eight types, in the order they depend on each other. Each concept page opens its
own type up field by field; this is the whole set on one screen.

| Type | What it holds | What it points at |
|---|---|---|
| [Task](/docs/concepts/task) | The intent, its checklist, its history | the runs it started |
| [Run](/docs/concepts/run) | One attempt: status, branch, worktree, verdict | a Crew, a Task, and a snapshot of a Flow |
| [Flow](/docs/concepts/flow) | The ordered recipe, its seats and its loop | its own Steps and Seats, nothing else |
| [Step](/docs/concepts/workflow) | One phase: kind, stage, inputs, outputs | a Seat, when its kind takes one |
| [Seat](/docs/concepts/seat) | A label and a description. That is all | nothing. It is a slot |
| [Crew](/docs/concepts/crew) | Your roster, plus two overrides | its Roles |
| [Role](/docs/concepts/role) | Prompt, permissions, skills, the seats it fills | a Profile |
| [Profile](/docs/concepts/profile) | Model, effort, token cap, timeout | a Provider |
| [Provider](/docs/concepts/provider) | Command, args, env, settings | the binary or endpoint on your machine |

The seam is between Seat and Role. Everything above it is what a flow ships, and
it can travel: no field in Flow, Step or Seat can name a model, a provider or a
price. Everything below it is yours, which is why importing a flow never imports
a bill.

## What the orchestrator owns

The orchestrator keeps a run moving and remembers where it is:

- Stage sequencing - driving a run through the flow.
- State machine transitions - `assertTransition` before every move.
- Worktree lifecycle - create, bind a branch, commit per stage.
- Artifact persistence - every prompt, response, decision, and event.
- Approval handling - pause at `waiting_for_approval`, resume on decide.
- Pause/resume - the pause flag, durable across restarts.

## An agent invocation

One stage handing a task to a model and turning the result into a usable artifact:

1. Build the prompt - role template, project rules, skills, task, prior artifacts.
2. Resolve the provider - agent config or run override.
3. Apply the permission profile - `read_only`, `code_write`, and the rest.
4. Stream the provider call, capturing stdout/stderr and metrics.
5. Parse the output into the role's expected artifact shape.
6. Validate it against its Zod schema or per-role contract.
7. Persist it, and return control to the orchestrator.

## What Mission Control sees

The dashboard watches far more than it touches. The Fastify server in `src/server/` exposes read-only routes over persisted state - the runs directory, `project.yml`, the provider registry, the skills index. Write-side routes are narrow and audited: approval decisions, pause/resume, suggestion applies, flow and crew authoring. Each crosses the Action Broker, so a policy denying file writes stops the browser exactly as it stops the terminal.

There is no privileged back channel - the dashboard is a client of the [HTTP API](/docs/architecture/http-api) like anything else, and the browser never executes arbitrary commands.

## Deliberately missing

Each absence is a choice about where Vibestrate stops.

- **No global daemon.** Close the terminal and the process ends; runs mid-stage end with it, most cleanly at the next stage boundary. The queue scheduler is the near miss: it can outlive the command that started it, but exits once the queue drains rather than staying resident.
- **No remote by default.** No relay, no telemetry beacon, no automatic update check. The two exceptions are both triggered by hand: the flow hub, when you search or install, and `vibe telemetry export`, which sends one finished run's metrics to a collector you name and run.
- **No model API.** Vibestrate holds no tokens. The local provider CLIs do that themselves.
- **No OS sandboxing.** Path guards and permission profiles refuse risky operations, but they are enforced by Vibestrate, not by the OS. [Container isolation](/docs/concepts/sandbox) is the opt-in that moves each provider turn into a disposable Docker container, with an egress allowlist narrowing what it can reach. That is a smaller blast radius, not a wall built for code that is actively hostile.

## Related

- [Repository map](/docs/architecture/directory-map) - where each module lives.
- [Run state](/docs/concepts/state) - what the orchestrator drives transitions through.
- [HTTP API](/docs/architecture/http-api) - the routes Mission Control is built on.
