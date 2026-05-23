# Guides and Quality Arbitration: Implementation Plan

Status: proposed phased plan
Primary Guide: `quality-arbitration`

## Product Definition

Guides are selectable run recipes for Amaco. They package a repeatable way to create a feature or review a change across local CLI agents while keeping the run observable and reproducible.

Guides should answer:

- What steps happen?
- Which participant role owns each step?
- Which provider/model slot should run that participant?
- What brief and artifacts does each step receive?
- Which steps are optional, gated, or bounded loops?
- How is context retained or reconstructed?
- What final record proves what happened?

Skills remain prompt attachments. Guides may attach Skills, but they own workflow shape.

## First Built-In Guide

`quality-arbitration` should ship as the reference Guide.

| Step | Default participant | Default purpose | Required output |
| --- | --- | --- | --- |
| `plan` | planner side | Propose implementation plan and risks. | Plan artifact. |
| `plan-review` | challenger side | Challenge plan quality before code changes. | Findings with severity and disposition request. |
| `implement` | planner side | Implement against plan and accepted plan feedback. | Worktree diff plus execution artifact. |
| `implementation-review` | challenger side | Review architecture, code, tests, and behavior. | Structured findings and review decision. |
| `challenge-response` | planner side | Fix, accept, or rebut findings with evidence. | Finding responses and any new diff. |
| `second-review` | challenger side or third slot | Re-review diff and responses. | Resolved/unresolved finding set. |
| `decision-summary` | Amaco summarizer slot | Summarize evidence, validation, disagreement, risk, and next action. | Decision artifact and final run recommendation. |

The initial Guide should be sequential. Optional steps may be disabled at run start, but the first implementation should not require arbitrary DAG execution.

## Suggested Guide Definition Shape

Use structured data for execution and Markdown for human guidance.

```text
.amaco/guides/quality-arbitration/
  guide.yml
  GUIDE.md
  prompts/
    plan-review.md
    challenge-response.md
    decision-summary.md
```

`guide.yml` should be schema-validated. `GUIDE.md` is the readable catalog entry and optional long-form guidance. This avoids overloading the current Skill frontmatter parser with nested step configuration.

Illustrative schema:

```yaml
id: quality-arbitration
version: 1
label: Quality Arbitration
description: Cross-provider plan, implementation, challenge, second review, and decision summary.
slots:
  builder:
    label: Builder
    defaultAgent: executor
  challenger:
    label: Challenger
    defaultAgent: reviewer
  arbiter:
    label: Arbiter
    defaultAgent: verifier
steps:
  - id: plan
    kind: agent-turn
    slot: builder
    role: planner
    outputs: [plan]
  - id: plan-review
    kind: review-turn
    slot: challenger
    inputs: [task-brief, plan]
    outputs: [findings]
    optional: true
  - id: implement
    kind: agent-turn
    slot: builder
    role: executor
    inputs: [task-brief, plan, accepted-findings]
    outputs: [execution, diff]
  - id: validation
    kind: validation
    inputs: [diff]
    outputs: [validation]
  - id: implementation-review
    kind: review-turn
    slot: challenger
    inputs: [plan, diff, validation]
    outputs: [findings, review-decision]
  - id: challenge-response
    kind: response-turn
    slot: builder
    inputs: [findings, diff, validation]
    outputs: [finding-responses, diff]
  - id: second-review
    kind: review-turn
    slot: challenger
    inputs: [findings, finding-responses, diff, validation]
    outputs: [finding-resolutions, review-decision]
  - id: decision-summary
    kind: summary-turn
    slot: arbiter
    inputs: [plan, findings, finding-responses, finding-resolutions, diff, validation]
    outputs: [decision-summary]
```

Names above are product vocabulary, not a final schema lock. The implementation should start with only the fields required by the first built-in Guide and reject unsupported features loudly.

## Run Initiation

### Shared request

Create one resolved request shape used by CLI, dashboard, and shell:

```ts
type GuideRunRequest = {
  task: string;
  taskId?: string;
  guideId: string;
  brief?: string;
  enabledSteps?: string[];
  skippedOptionalSteps?: string[];
  slotProviders: Record<string, string>;
  stepProviders?: Record<string, string>;
  runtimeSkills?: string[];
  readOnly?: boolean;
  concise?: boolean;
  contextPolicy?: "balanced" | "compact" | "artifact-heavy";
};
```

Persist a resolved immutable snapshot under the run directory before execution:

```text
.amaco/runs/<run-id>/guide.json
```

The snapshot should include defaults after resolution, provider ids, step order, skipped steps, prompt/template versions, context policy, and Guide source.

### Dashboard

Extend the Mission Control composer with a Guide control that opens a run setup panel:

- select `default workflow` or a discovered Guide,
- show the Guide brief and ordered steps,
- select provider per slot first and per step only when overridden,
- choose optional step inclusion,
- show attached runtime Skills and context policy,
- submit the resolved request,
- show step progress and provider participant lanes once running.

The UI should not claim a CLI session is persistent unless the runtime ledger says it is. It can show `session reused`, `new session`, or `artifact rehydrated`.

### CLI

Add scriptable commands before the richer wizard:

```bash
amaco guides list
amaco guides show quality-arbitration
amaco run "add audit logging" --guide quality-arbitration
amaco run "add audit logging" --guide quality-arbitration \
  --guide-slot builder=claude \
  --guide-slot challenger=codex \
  --guide-slot arbiter=claude
```

Then add an interactive terminal path:

```bash
amaco run --guide quality-arbitration --interactive
```

The wizard should use the same resolver as the dashboard, print the resolved steps before start, and produce a command summary for replayable non-interactive use.

### Shell

The Ink shell needs parity, not a dashboard-only shortcut:

- a Guides page or command-palette entry for discovered Guides,
- an interactive setup screen for task brief, optional steps, slots, and providers,
- run inspector rows for current Guide step and participant/session state,
- retained CLI command hints for the same resolved run.

## Runtime Architecture

### 1. Guide discovery and validation

Add a `src/guides/` domain:

- schema and versioning,
- discovery from built-ins plus `.amaco/guides`,
- resolver that merges Guide defaults, project provider config, run overrides, task metadata, Skills, and policies,
- doctor checks for malformed Guides, missing prompt fragments, unknown slots, missing providers, invalid output contracts.

Discovery must not execute user code.

### 2. Guide runner

Add a runner that executes resolved sequential steps:

- `agent-turn`
- `review-turn`
- `response-turn`
- `validation`
- `approval-gate`
- `summary-turn`

Reuse worktree creation, permission resolution, prompt/artifact persistence, provider streaming, metrics, suggestions, validation, and approvals. Keep the default orchestrator path working while this runner matures.

Do not start with arbitrary DAGs. If a Guide requests an unsupported branch or loop, reject it at resolve time. Add bounded loops only after Quality Arbitration proves the step ledger and restart story.

### 3. Step ledger and state

Extend run state or add a Guide step state file with:

- `guideId`, `guideVersion`, and `resolvedGuidePath`,
- `currentStepId`,
- per-step status: pending, running, passed, blocked, failed, skipped,
- per-step provider id, agent id, permission profile, input packet hash, artifact refs, started/ended timestamps,
- per-turn session reference and reuse mode.

Recommended artifacts:

```text
artifacts/guides/<step-id>/prompt.md
artifacts/guides/<step-id>/output.md
artifacts/guides/<step-id>/context-packet.json
artifacts/guides/findings.json
artifacts/guides/finding-responses.json
artifacts/guides/decision-summary.md
```

Recommended events:

- `guide.selected`
- `guide.resolved`
- `guide.step.started`
- `guide.step.completed`
- `guide.step.failed`
- `guide.step.skipped`
- `guide.context.built`
- `guide.session.opened`
- `guide.session.reused`
- `guide.session.rehydrated`
- `guide.findings.updated`
- `guide.decision.completed`

### 4. Participant session ledger

Add a capability-oriented provider turn layer:

```ts
type ProviderTurnCapabilities = {
  oneShot: boolean;
  resumeSession: boolean;
  interactiveSession: boolean;
  reportsSessionId: boolean;
  reportsTokenUsage: boolean;
};

type ProviderTurnInput = {
  providerId: string;
  participantId: string;
  stepId: string;
  prompt: string;
  cwd: string;
  priorSessionRef?: string;
  contextPacketPath: string;
};
```

Run-local ledger:

```text
.amaco/runs/<run-id>/participants.json
```

The ledger should record participant slot, provider id, provider-reported model/session refs, session open/reuse timestamps, fallback reason, and context packet refs.

Policy:

1. Reuse or resume a participant session when the configured provider adapter supports it.
2. Persist every prompt packet and output even when a live session exists.
3. Fall back to stateless artifact rehydration when a CLI cannot resume or a session is lost.
4. Never give Guide YAML raw shell control over provider resume flags.

That policy satisfies the local-CLI constraint without making runs unrecoverable when a process exits.

### 5. Context packet builder

Context packets are the token-efficiency layer.

Each step should declare required and optional inputs. The packet builder should choose:

- compact task brief,
- prior step summaries,
- exact artifact refs,
- diff summary plus changed-file list,
- validation summary and failing command excerpts,
- unresolved findings only,
- explicit user notes and approval decisions.

Avoid sending full prior artifacts by default. Use full artifacts only when the step contract needs them or the user picks an artifact-heavy context policy.

Record:

- included artifacts and hashes,
- omitted optional inputs,
- compaction summaries,
- token/cost information when a provider reports it,
- fallback reason when a participant had to be rehydrated.

## Quality Data Model

Quality Arbitration should emit structured data that can later become a local evaluation dataset.

Minimum records:

- finding id, source step, severity, category, file refs, claim, evidence,
- builder response: accept, fix, rebut, defer, needs-human,
- diff/test evidence after response,
- second-review resolution: resolved, still-open, invalid-finding, needs-human,
- final Amaco summary and final human disposition when the user supplies one,
- provider id/model/session refs/tokens/cost for each step.

Candidate categories:

- correctness,
- architecture,
- security,
- tests,
- performance,
- maintainability,
- UX/product behavior,
- policy/permission risk.

The dataset should label outcomes from evidence and human decisions. It should not equate "model A disagreed with model B" with a confirmed defect.

## Phased Delivery

Checklist convention: mark an item complete only when code and focused tests land together. Keep exit checks open until the phase behavior is verified end to end.

### Phase 0: contracts and fixture

- [x] Lock Guide vs Skill vocabulary.
- [x] Add the two schemas: Guide definition and resolved Guide snapshot.
- [x] Add one deterministic fake Quality Arbitration fixture for tests.
- [x] Define JSON contracts for findings, responses, and decision summary.

Exit:

- [x] Malformed Guide definitions fail validation.
- [x] The built-in Guide resolves against configured providers without running them.

### Phase 1: discovery and start-run UX

- [x] Add built-in and project Guide discovery.
- [x] Add `amaco guides list/show`.
- [x] Add `amaco run --guide ...` with slot provider overrides.
- [x] Add dashboard Guide picker and resolved-step preview.
- [x] Add shell command-palette entry and inspectable Guide catalog.

Exit:

- [x] All surfaces produce the same resolved snapshot for the same inputs.

Phase 1 resolves and previews Guide requests. `amaco run --guide ...`, Mission
Control, and the shell runner all stop before guided execution until the
sequential Guide runner lands in Phase 2.

### Phase 2: sequential Guide runner

- [x] Implement step state, step events, prompt/output artifacts, validation step, final summary step.
- [x] Reuse current provider streaming, worktree, permission, Skill, MCP, approval, and metrics plumbing.
- [x] Expose current Guide step in Mission Control, run detail, replay, and shell runs page.

Exit:

- [x] Quality Arbitration completes with stateless provider turns from persisted artifacts.

### Phase 3: participant/session retention

- [x] Introduce provider capability reporting and participant ledger.
- [x] Add provider adapters for session reuse where a local CLI has a supported resume/interactive path.
- [x] Keep artifact rehydration as fallback.
- [x] Surface reuse/rehydration in UI, TUI, metrics, and events.

Exit:

- [x] Builder and challenger can maintain separate run-local context when their CLIs support it, and restart/fallback remains auditable.

Phase 3 keeps generic CLI providers on the persisted-artifact handoff path and
records the fallback in `participants.json`, Guide state, metrics, and events.
Typed `claude-code` providers open a session per Guide slot and resume that same
run-local session for later slot turns; other provider adapters should only opt
in after they can report a reliable session reference.

### Phase 4: arbitration semantics

- [x] Parse structured findings, responses, and second-review resolutions.
- [x] Create a decision summary that references validation and disagreement records.
- [x] Feed accepted suggestions and review-pass tooling where appropriate.
- [x] Add local export for arbitration datasets.

Exit:

- [x] A user can compare judgment quality by evidence, not by scrolling prose.

Phase 4 accepts explicit `AMACO_GUIDE_OUTPUT` JSON blocks for findings,
builder responses, second-review resolutions, and decision summaries. Parsed
records land in `arbitration.json` plus canonical Guide artifacts; prose-only
providers keep running with parse gaps recorded. Accepted or fixed findings
become review suggestions and a draft review pass, and
`amaco guides export-arbitration <runId>` exports the local evidence record.

### Phase 5: migrate and generalize

- [x] Decide whether the legacy default workflow becomes a built-in Guide or stays a special runner.
- [x] Add bounded loops/gates once sequential step behavior is stable.
- [x] Consider Guide suggestions based on task type, risk, touched files, and past outcomes.

Exit:

- [x] Guide architecture supports more than Quality Arbitration without hiding unsafe complexity in templates.

Phase 5 keeps the legacy default workflow in `Orchestrator.run()` for now.
It remains the stable special runner while Guide runs prove more templates and
restart behavior; converting it to a built-in Guide would add migration risk
without improving the selected-Guide product surface yet.

Generalization is intentionally bounded. Guide `approval-gate` steps now need
typed approval metadata and use the existing approval ledger. A Guide step may
declare a fixed `repeat.times` bound, which the resolver expands into explicit
sequential snapshot steps such as `review-repeat-2`. Phase 5 does not add
adaptive branches or data-driven loop exits to YAML.

Guide suggestions are advisory only. The shared classifier scores task wording,
risk level, touched files, and recent local Guide outcomes; CLI/API/dashboard
surfaces can show the suggestion, but the user still chooses the Guide before a
run starts.


### Phase 6: reorganize structure

- [x] Split the Guide domain into catalog, schema/contract, and runtime modules.
- [x] Move Guide phase coverage and fixtures into a dedicated test tree.
- [x] Record Guide folder ownership so future templates do not flatten the domain again.
- [x] Rewrite the README as a concise current product entrypoint.

Exit:

- [x] Guide definitions, schemas, runtime records, and tests have clear homes without a repo-wide rename churn.

Phase 6 keeps the wider Amaco domain layout intact. The flatness introduced by
the Guide work is now organized under `src/guides/{catalog,schemas,runtime}`
and `tests/guides/`; `src/guides/README.md` pins those ownership boundaries.

### Phase 7: interactive CLI Guide setup

- [x] Add `amaco run --guide <id> --interactive` as a Guide-only terminal wizard.
- [x] Collect or revise task, Guide brief, context policy, participant providers, and optional step inclusion before resolution.
- [x] Feed the wizard result through the same Guide resolver and resolved-step preview used by scriptable CLI runs.
- [x] Print an equivalent non-interactive command so terminal selections can be replayed and shared.

Exit:

- [x] A terminal user can start Quality Arbitration without hand-writing every Guide flag, while the final run remains reproducible from CLI arguments.

Phase 7 closes the plain CLI initiation gap first. The Ink shell already shows
the Guide catalog and running Guide state, but it still needs its own setup
screen before shell initiation has the same step and slot picker as Mission
Control and `amaco run --interactive`.

### Phase 8: context packets and prompt budgeting

- [x] Move Guide context selection into a reusable context builder.
- [x] Make `contextPolicy` affect prompt materialization instead of only being recorded on the snapshot.
- [x] Make participant context mode affect handoffs: reused sessions receive summaries and artifact refs instead of full prior artifacts.
- [x] Record packet budgets, source hashes, prompt hashes, inclusion reasons, and estimated token savings.
- [x] Emit `guide.context.built` events with budget data for replay/metrics follow-up.

Exit:

- [x] Compact and reused-session Guide turns stop replaying bulky prior artifacts into prompts while retaining exact artifact references for recovery and audit.

Phase 8 is heuristic rather than model-generated compaction. It summarizes
diff and validation JSON structurally, clips prose artifacts deterministically,
and keeps exact full content in persisted artifacts. A later phase can add
provider-assisted summaries, but this slice makes the token budget visible and
testable without adding another model call.

## Testing Plan

### Unit tests

- Guide schema and discovery.
- Resolver precedence: task metadata, Guide defaults, project config, CLI/UI override.
- Context packet input selection and compaction policy.
- Findings/response/decision parsers.
- Provider capability and session fallback behavior.

### Integration tests

- Fake providers complete Quality Arbitration end to end.
- Different providers per slot produce distinct metrics and artifacts.
- A lost session rehydrates from artifacts and records the fallback.
- Read-only and approval policies reject incompatible Guide steps honestly.
- Retry/replay keep the resolved Guide snapshot stable.

### Surface tests

- CLI command generation and parser coverage.
- Dashboard spawn body -> argv parity.
- Shell snapshot/current step visibility.
- Run detail, live output, replay, and final report show Guide step records.

### Manual smoke tests

- Claude builder plus Codex challenger on a small repo change.
- Reverse provider roles on the same task.
- Abort mid-step, inspect artifacts, retry from a fresh run.
- Kill the UI while CLI run continues; inspect the same Guide run from shell.

## Decisions To Make Before Implementation

1. Should a slot pick a provider id only, or a provider id plus provider-specific model profile?
2. Should the first session-retention slice target resumable one-shot CLIs before long-lived PTY sessions?
3. Phase 0 starts with strict JSON contracts for Guide outputs. Decide during runner work whether provider prompts also need Markdown marker extraction as a fallback.
4. Should `decision-summary` be provider-backed, deterministic from structured records, or a deterministic skeleton with an optional provider-written narrative?
5. Should a task store a default Guide id, or should Guide choice stay run-local until behavior stabilizes?

## First Implementation Slice Recommendation

Start with:

1. Guide discovery/resolution.
2. A built-in `quality-arbitration` sequential plan.
3. CLI and dashboard resolved-step selection.
4. Stateless artifacts-first execution for the first three steps: plan, plan-review, implement.

Do not begin with persistent CLI sessions. Add the participant ledger interface immediately, but make the first implementation prove the artifact contracts and start-run UX first. Once step boundaries and context packets are correct, session retention can be added behind a capability adapter without rewriting the Guide product surface.
