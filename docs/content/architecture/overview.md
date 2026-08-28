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

<svg viewBox="0 0 500 320" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="The vibe CLI, Mission Control and the vibe shell all reach the same run launcher, which drives the orchestrator. Everything the orchestrator drives - the worktree, the provider CLI and validation commands - crosses the Action Broker first.">
  <polygon points="17.74,22 29.74,5 102.26,5 114.26,22 102.26,39 29.74,39" fill="var(--violet-deep)"/>
  <text x="66" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">vibe CLI</text>
  <polygon points="178.762,22 190.762,5 309.238,5 321.238,22 309.238,39 190.762,39" fill="var(--violet-deep)"/>
  <text x="250" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Mission Control</text>
  <polygon points="379.175,22 391.175,5 476.825,5 488.825,22 476.825,39 391.175,39" fill="var(--violet-deep)"/>
  <text x="434" y="27" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">vibe shell</text>
  <path d="M66 42 L66 62 L250 62" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="242,57.5 250,62 242,66.5" fill="var(--fg-200)"/>
  <path d="M434 42 L434 62 L250 62" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="242,57.5 250,62 242,66.5" fill="var(--fg-200)"/>
  <path d="M250 42 L250 74" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,66 250,74 254.5,66" fill="var(--fg-200)"/>
  <rect x="140" y="78" width="220" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="250" y="105" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">run-launcher</text>
  <path d="M250 122 L250 136" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,128 250,136 254.5,128" fill="var(--fg-200)"/>
  <rect x="100" y="140" width="300" height="56" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="250" y="166" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Orchestrator</text>
  <text x="250" y="184" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="middle">state, steps, budget, gates</text>
  <path d="M250 196 L250 210" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,202 250,210 254.5,202" fill="var(--fg-200)"/>
  <rect x="40" y="214" width="420" height="46" rx="14" fill="var(--violet-deep)"/>
  <text x="250" y="243" font-size="15" font-weight="600" fill="#ffffff" text-anchor="middle">Action Broker</text>
  <path d="M110 260 L110 274" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="105.5,266 110,274 114.5,266" fill="var(--fg-200)"/>
  <path d="M250 260 L250 274" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="245.5,266 250,274 254.5,266" fill="var(--fg-200)"/>
  <path d="M390 260 L390 274" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="385.5,266 390,274 394.5,266" fill="var(--fg-200)"/>
  <rect x="20" y="278" width="160" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="100" y="303" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">git worktree</text>
  <rect x="190" y="278" width="120" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="250" y="303" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">provider CLI</text>
  <rect x="320" y="278" width="160" height="40" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="400" y="303" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">validation</text>
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

<svg viewBox="0 0 500 300" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A role turn assembles its prompt, resolves permissions, asks the broker to allow a provider spawn, then spawns a detached child process. Vibestrate cannot see inside that process: only the stream comes back, and is normalized into artifacts.">
  <rect x="0" y="0" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="26" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">prompt assembled</text>
  <path d="M108 42 L108 48" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,40 108,48 112.5,40" fill="var(--fg-200)"/>
  <rect x="0" y="52" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="78" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">permissions resolved</text>
  <path d="M108 94 L108 100" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,92 108,100 112.5,92" fill="var(--fg-200)"/>
  <rect x="0" y="104" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="108" y="130" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">broker: provider.spawn</text>
  <path d="M108 146 L108 152" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,144 108,152 112.5,144" fill="var(--fg-200)"/>
  <rect x="0" y="156" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="182" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">resilience loop</text>
  <path d="M108 198 L108 214" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="103.5,206 108,214 112.5,206" fill="var(--fg-200)"/>
  <rect x="0" y="218" width="216" height="42" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="108" y="244" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">normalize and assess</text>
  <rect x="262" y="8" width="238" height="182" rx="14" fill="var(--bg-300)" stroke="var(--violet-deep)" stroke-width="1.5"/>
  <text x="278" y="34" font-size="15" font-weight="600" fill="var(--fg-100)">child process group</text>
  <polygon points="267.175,68 279.175,51 364.825,51 376.825,68 364.825,85 279.175,85" fill="var(--violet-deep)"/>
  <text x="322" y="73" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">vendor CLI</text>
  <polygon points="379.175,68 391.175,51 476.825,51 488.825,68 476.825,85 391.175,85" fill="var(--violet-deep)"/>
  <text x="434" y="73" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">sub-agents</text>
  <text x="280" y="116" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">nothing in here can be</text>
  <text x="280" y="140" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">intercepted per tool</text>
  <text x="280" y="164" font-size="11.5" fill="var(--fg-100)" font-family="var(--font-mono)" text-anchor="start">or per request</text>
  <path d="M220 92 L258 92" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="250,87.5 258,92 250,96.5" fill="var(--fg-200)"/>
  <path d="M258 134 L224 134" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="232,129.5 224,134 232,138.5" fill="var(--fg-200)"/>
  <text x="0" y="288" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">ask gates each change, never each command</text>
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
