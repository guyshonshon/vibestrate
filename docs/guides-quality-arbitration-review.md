# Guides and Quality Arbitration: Current-System Review

Status: planning note
Branch intent: define the architecture work before implementing Guides

## Goal

Amaco should let a user start a feature with a reusable Guide instead of manually moving context between local coding CLIs. The first productized Guide should be Quality Arbitration:

1. Plan with one provider.
2. Review the plan with another provider.
3. Implement with the planner/implementer side.
4. Review the diff with the challenger side.
5. Let the implementer challenge or respond.
6. Run a second review.
7. Produce an Amaco decision summary grounded in artifacts and validation.

This is not a Skill. A Skill changes what an agent knows inside one invocation. A Guide changes the run recipe: steps, participants, provider choices, context policy, artifact contracts, gates, and the final decision record.

## Current Architecture

### What is already strong

| Area | Existing asset | Why it matters for Guides |
| --- | --- | --- |
| Run supervision | `src/core/orchestrator.ts`, `src/core/state-machine.ts` | Amaco already owns a durable run record, worktree lifecycle, approval gates, validation, and final status. |
| Artifacts | `src/core/artifact-store.ts` | Every meaningful provider turn can have a prompt and output artifact instead of relying on hidden chat state. |
| Events and replay | `src/core/event-log.ts`, `src/core/run-replay-service.ts` | A Guide can be inspectable if each resolved step emits typed events and artifacts. |
| Metrics | `src/core/runtime-metrics.ts`, `src/core/metrics-store.ts` | Provider duration, cost, token usage, model, tool calls, and Claude session ids already have a place to land. |
| Prompt composition | `src/core/prompt-builder.ts` | Prompts already compose project rules, permissions, prior artifacts, skills, validation results, and concise mode. |
| Skills and MCP | `src/skills/*`, `src/mcp/*` | Guide steps can reuse assigned skills and MCP materialization instead of inventing context attachment again. |
| Quality controls | validation, reviewer/verifier decisions, suggestions, approvals, read-only runs | Quality Arbitration can build on existing validation and review records rather than treating model debate as proof. |
| Multiple surfaces | CLI, local dashboard, Ink shell | The repo already has parity patterns: typed CLI flags, dashboard body-to-argv spawning, CLI hints, and TUI command surfaces. |

### What the system does today

- The workflow is one fixed sequence. `src/workflow/workflow-runner.ts` explicitly says execution still lives inside `Orchestrator.run()`.
- The implemented sequence is plan -> architect -> execute -> validate -> review -> fix loop -> verify. The branch points are reviewer decision, review-loop count, approvals, pause, and read-only short circuits.
- Provider selection is run-wide today. Effort and provider override resolve one provider id for every agent in a run unless agent defaults win.
- Provider execution is one CLI invocation per agent turn. The generic `cli` provider and `claude-code` provider receive a prompt and return buffered output plus optional stream chunks.
- Claude output parsing may record a `sessionId`, but the provider contract does not own session lifecycle, resume, a persistent PTY, or a normalized conversation handle.
- Skills are reusable prompt attachments. They are discovered from `.amaco/skills` and `.claude/skills`, assigned to agents, optionally attached per run, and may add MCP servers.
- The dashboard can spawn a constrained `amaco run` process. The shell can surface runs, skills, approvals, queues, and a command runner. Neither surface has a Guide picker or per-step provider editor.

## Fit Assessment

Amaco already has the right supervisory center for Guides:

- durable local files over invisible orchestrator memory,
- fixed argv provider calls rather than browser shell execution,
- worktree ownership and permission profiles,
- validation and review decisions that can adjudicate model claims,
- observable artifacts, live output, events, metrics, approvals, suggestions, and replay.

The missing work is in the workflow/runtime layer. Quality Arbitration cannot be represented cleanly by adding another Skill or by stuffing more prose into the reviewer prompt.

## Architecture Gaps

### 1. Run shape is hardcoded

`Orchestrator.run()` names each stage, artifact filename, status transition, pause boundary, approval boundary, review loop, and finalization rule. Quality Arbitration adds multiple reviews, a challenge/response turn, per-step participants, and a decision summary. Duplicating those branches in the existing method would make the default workflow harder to reason about.

Needed:

- a resolved Guide plan per run,
- step ids separate from legacy statuses,
- a sequential step runner first,
- bounded loop/gate primitives instead of a general DAG in the first slice.

### 2. State and metrics are stage-centered, not step-centered

Current run state stores status, provider override, effort, runtime skills, concise mode, approval state, and review loop count. Metrics store `agentId` and `stageId`. Quality Arbitration needs to answer:

- which Guide and Guide version were resolved,
- which steps were enabled or skipped,
- which provider/model slot ran each step,
- whether a turn reused a session or reconstructed context,
- what artifact contract each step consumed and produced,
- what disagreement or finding survived into the decision summary.

Needed:

- step state and turn state in run storage,
- stable event names for Guide resolution and Guide step lifecycle,
- metrics keyed by `stepId` and `turnId` while preserving legacy summaries.

### 3. Provider abstraction has no context-retention contract

The present contract is:

```ts
runProvider({ providerId, prompt, cwd, mcpConfigPath, onChunk, signal })
```

That is enough for stateless prompts. It is not enough to keep Claude and Codex working as named participants across several Guide turns.

Needed:

- provider capabilities such as `oneShot`, `resumeSession`, `interactiveSession`, `streaming`, `reportsTokens`, and `reportsContextUsage`,
- a run-local participant/session ledger,
- provider-specific adapters hidden behind a generic turn API,
- an explicit stateless fallback that rehydrates context from artifacts when a CLI cannot resume.

Do not let Guide definitions contain raw provider flags. A Guide should ask for a participant role and context policy; the provider adapter should decide whether a CLI can resume, needs a new process with a session id, or must receive a compact context packet.

### 4. Context policy is implicit

Today prior artifacts are assembled manually at each hardcoded stage. Quality Arbitration needs token-efficient context handoff without losing the evidence chain.

Needed:

- step input selectors such as plan, architecture, diff summary, latest review, validation result, challenge response, and explicit user brief,
- a context packet builder with budget and compaction policy,
- artifact references and hashes in the packet so a summary is auditable,
- per-participant memory policy: retain session when supported, otherwise reconstruct only the required packet.

The durable artifact packet must remain canonical. Session continuity is an optimization, not the only source of truth.

### 5. Quality semantics are too narrow

The default reviewer emits one `DECISION:`. The verifier emits one `VERIFICATION:`. Quality Arbitration needs a structured debate record:

- first review findings,
- implementer acceptance, rebuttal, or fix plan per finding,
- second review resolution,
- final Amaco decision summary that distinguishes validation evidence, reviewer agreement, disagreement, remaining risk, and human-required decisions.

Needed:

- step output schemas or parsers for findings and responses,
- a disagreement ledger,
- a decision-summary artifact that does not pretend consensus when there is none.

### 6. Start-run UX cannot configure a Guide

The dashboard composer can pick effort, provider, runtime skills, read-only, and concise mode. CLI flags and server route mirror those fields. The shell exposes run control and a command runner. None of them let the user:

- choose a premade Guide,
- preview its steps,
- select providers/models per step or participant slot,
- skip optional steps,
- enter a Guide-specific brief,
- see how context/session handling will work.

Needed:

- one shared resolved-run request schema,
- a dashboard Guide picker and step editor,
- CLI flags for scripts plus an interactive terminal wizard,
- TUI parity that uses the same resolver and displays the same resolved step plan.

### 7. Data collection is not arbitration-aware

Runtime metrics can compare provider call counts, duration, cost, token usage when reported, and final run status. They do not capture quality labels for model judgment.

Needed:

- local records of findings, accepted/rejected findings, fixes attributable to findings, validation outcomes after each implementation/fix turn, final decision, and optional human outcome labels,
- comparison dimensions separated from raw cost/token metrics,
- exportable datasets that keep provider/model identity and evidence references without treating model confidence as ground truth.

## Code Quality Risks If Implemented Naively

1. Adding a second giant branch to `Orchestrator.run()` will entangle legacy workflow fixes with Guide rollout.
2. Letting Guide YAML inject raw CLI args will turn provider compatibility and security into template problems.
3. Depending only on live sessions will make replay, restart, and audits incomplete.
4. Copying every artifact into every prompt will defeat token efficiency and make arbitration slower than manual handoff.
5. Surfacing Guides only in the dashboard will violate Amaco's CLI-first and shell parity.
6. Calling every disagreement "quality improvement" without validation or labels will create vanity telemetry.

## Recommended Boundary

Implement Guides as a workflow recipe layer above provider turns and below UI/CLI presentation:

```text
UI / CLI / Shell
        |
Resolved Run Request
        |
Guide Discovery + Guide Resolver
        |
Guide Runner + Context Packet Builder + Participant Session Ledger
        |
Provider Turn API + Validation + Approvals + Artifact/Event/Metrics Stores
```

The default workflow can stay on the legacy orchestrator during the first Guide slice. Quality Arbitration should use the new step concepts without forcing an immediate full migration of every legacy status and artifact name.

## Acceptance Bar For The First Guide Slice

- A run records an immutable resolved Guide plan before provider turns begin.
- Every enabled step has visible prompt/output artifacts, events, metrics, and live output where available.
- Provider assignment can differ by step or participant slot.
- A provider that cannot retain context still completes the Guide from durable artifacts.
- A provider that can resume context records when it reused a session and what durable packet it still received.
- Dashboard, CLI, and shell can all start or inspect the same resolved Guide run.
- Final arbitration output separates evidence, disagreement, validation, residual risk, and required human action.
