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

<svg viewBox="0 0 560 274" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The vibe CLI, Mission Control and the vibe shell all reach the same run launcher, which drives the orchestrator. Everything the orchestrator drives - the worktree, the provider CLI and validation commands - crosses the Action Broker first.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="160" height="32" rx="8"/>
    <rect x="190.5" y="0.5" width="160" height="32" rx="8"/>
    <rect x="400.5" y="0.5" width="160" height="32" rx="8"/>
    <rect x="160.5" y="60.5" width="220" height="32" rx="8"/>
    <rect x="120.5" y="110.5" width="300" height="46" rx="8"/>
    <rect x="20.5" y="234.5" width="170" height="30" rx="8"/>
    <rect x="200.5" y="234.5" width="140" height="30" rx="8"/>
    <rect x="350.5" y="234.5" width="190" height="30" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="60.5" y="174.5" width="420" height="42" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M80 32 L80 44 L270 44"/>
    <path d="M480 32 L480 44 L270 44"/>
    <path d="M270 32 L270 60"/>
    <path d="M270 92 L270 110"/>
    <path d="M270 156 L270 174"/>
    <path d="M110 216 L110 234"/>
    <path d="M270 216 L270 234"/>
    <path d="M430 216 L430 234"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="264,40.5 270,44 264,47.5"/>
    <polygon points="264,40.5 270,44 264,47.5"/>
    <polygon points="266.5,54 270,60 273.5,54"/>
    <polygon points="266.5,104 270,110 273.5,104"/>
    <polygon points="266.5,168 270,174 273.5,168"/>
    <polygon points="106.5,228 110,234 113.5,228"/>
    <polygon points="266.5,228 270,234 273.5,228"/>
    <polygon points="426.5,228 430,234 433.5,228"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="80" y="20">vibe CLI</text>
    <text x="270" y="20">Mission Control</text>
    <text x="480" y="20">vibe shell</text>
    <text x="270" y="80">run-launcher</text>
    <text x="270" y="132">Orchestrator</text>
    <text x="270" y="194">Action Broker</text>
    <text x="105" y="253">git worktree</text>
    <text x="270" y="253">provider CLI</text>
    <text x="445" y="253">validation</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="270" y="147">state, steps, budget, gates</text>
    <text x="270" y="209">allow / require approval / deny</text>
  </g>
</svg>

Three front doors, one core, and one boundary. Nothing reaches the worktree, a provider or your validation commands without crossing the Action Broker.

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

<svg viewBox="0 0 560 238" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A role turn assembles its prompt, resolves permissions, asks the broker to allow a provider spawn, then spawns a detached child process. Vibestrate cannot see inside that process: only the stream comes back, and is normalized into artifacts.">
  <g fill="currentColor" fill-opacity="0.04">
    <rect x="270" y="8" width="290" height="150" rx="10"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="220" height="32" rx="8"/>
    <rect x="0.5" y="40.5" width="220" height="32" rx="8"/>
    <rect x="0.5" y="80.5" width="220" height="32" rx="8"/>
    <rect x="0.5" y="120.5" width="220" height="32" rx="8"/>
    <rect x="292.5" y="40.5" width="110" height="34" rx="8"/>
    <rect x="422.5" y="40.5" width="116" height="34" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="178.5" width="220" height="32" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M110 32 L110 40"/>
    <path d="M110 72 L110 80"/>
    <path d="M110 112 L110 120"/>
    <path d="M110 160 L110 178"/>
    <path d="M224 96 L266 96"/>
    <path d="M266 140 L224 140"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="106.5,34 110,40 113.5,34"/>
    <polygon points="106.5,74 110,80 113.5,74"/>
    <polygon points="106.5,114 110,120 113.5,114"/>
    <polygon points="106.5,172 110,178 113.5,172"/>
    <polygon points="260,92.5 266,96 260,99.5"/>
    <polygon points="230,136.5 224,140 230,143.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="110" y="20">prompt assembled</text>
    <text x="110" y="60">permissions resolved</text>
    <text x="110" y="100">broker: provider.spawn</text>
    <text x="110" y="140">resilience loop</text>
    <text x="110" y="198">normalize and assess</text>
    <text x="347" y="61">vendor CLI</text>
    <text x="480" y="61">sub-agents</text>
  </g>
  <g fill="currentColor" fill-opacity="0.62" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="280" y="25" text-anchor="start">child process group</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="245" y="88" text-anchor="middle">spawn</text>
    <text x="245" y="132" text-anchor="middle">stream</text>
    <text x="292" y="105" text-anchor="start">no per-tool and no per-request</text>
    <text x="292" y="121" text-anchor="start">interception is possible here</text>
    <text x="292" y="141" text-anchor="start">this is why ask means approve</text>
    <text x="292" y="157" text-anchor="start">each change, not each command</text>
    <text x="0" y="232" text-anchor="start">exit 0 AND non-empty output, or the turn failed</text>
  </g>
</svg>

One role turn, end to end. The box on the right is the part Vibestrate cannot see into, which is why the permission model gates changes rather than commands.

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
