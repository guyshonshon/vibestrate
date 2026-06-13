# Design docs index

The per-doc status map for everything in `docs/design/`. These docs are
internal (not rendered on the docs site); each records the *why* behind a
decision so future sessions don't re-derive it. Audited 2026-06-11.

**Maintenance rule:** when a doc's work ships or is superseded, update its own
`Status:` line *and* its row here. One-off artifacts (design handoff prompts,
scratch plans) go to `docs/archive/` (gitignored), not here.

## Product spine - living architecture (read these first)

| Doc | What it is |
| --- | --- |
| [`responsible-orchestrator.md`](./responsible-orchestrator.md) | **The current product spine.** Orchestrator as project-aware supervisor; authority bounded by verifiable evidence. Shipping in slices (1-4 shipped, see TODO). |
| [`vocabulary.md`](./vocabulary.md) | Settled names: Task + Flow + Crew = Run; Flow / Step / Seat / Crew / Role / Profile / Provider. The naming standard for all code + docs. |
| [`custom-workflow-dags.md`](./custom-workflow-dags.md) | The graph execution substrate (DAGs, fan-out/join, frontier scheduler). Phases A/B/D shipped; *product framing* superseded by responsible-orchestrator (DAGs are a primitive the orchestrator chooses, not the identity). |
| [`roadmap-and-sequencing.md`](./roadmap-and-sequencing.md) | The debate doc behind the Phase 2-6 feature decisions - answers + rationale. Master sequence; TODO.md tracks status. |

## Active - open or partially shipped plans

| Doc | Status |
| --- | --- |
| [`run-experience-and-usability-batch.md`](./run-experience-and-usability-batch.md) | **The current batch (June 2026).** Seven slices: blocked-run UX, live transcript, hub UI, express/sizer, control center, UI revamp, git helpers. Adversarially reviewed; nothing shipped yet. |
| [`proportional-orchestration.md`](./proportional-orchestration.md) | B3 (change-scoped validation) shipped 0.7.33. A2/A3/A1 are the batch's P4 slices. |
| [`flows-hub.md`](./flows-hub.md) | Hub registry decisions (settled). Read side + seating built on a stranded branch; batch P3 merges it + adds the web browser; publish later. |
| [`policy-enforcement-assurance.md`](./policy-enforcement-assurance.md) | The safety pillar (issue #7). S0-S5 shipped; S6 (OS sandbox) partially unblocked - provider-native sandbox (codex) shipped off-by-default via T14 slice 1; the rest waits on the deferred Docker backend + credential proxy. |
| [`rewind-phase-2.md`](./rewind-phase-2.md) | Phase 1 + 2 shipped (resume at review/fix/verify via phase snapshots). Safety follow-ups tracked in ISSUES.md (ISSUE-001). |

## Open proposals - designed, nothing shipped

| Doc | Status |
| --- | --- |
| [`always-on-execution.md`](./always-on-execution.md) | Always-on / laptop-closed execution. Proposed, adversarially reviewed (2026-06). Backlogged. |
| [`provider-structured-output.md`](./provider-structured-output.md) | Structured provider output for live streaming + real CLI metrics. Endorsed direction, not built (Phase 4 A7 residual). |
| [`crew-flow-authoring.md`](./crew-flow-authoring.md) | Open crew/flow authoring decisions (loops, per-role effort, persisted bindings). Decision doc, not built. |
| [`docker-backend.md`](./docker-backend.md) | **T14 sandboxed execution backend** (the S6 unblocker). **Slice 1 shipped: provider-native sandbox, OFF by default** (`execution.isolation: sandboxed` → `codex exec --sandbox`, codex-only OS confinement, verified). Docker + credential proxy **deferred** (premature; no concrete pull). Filesystem isolation is real; exfil/credential isolation needs the deferred host proxy. Adversarially reviewed (Opus). |

## Shipped - design of record for behavior now on main

| Doc | Shipped as |
| --- | --- |
| [`api-contract.md`](./api-contract.md) | Phase 2: `/api/v1`, bearer auth, flow import/export. |
| [`assist-primitive.md`](./assist-primitive.md) | Phase 3: one-shot read-only structured assist runs (`runAssist`). |
| [`runner-unification.md`](./runner-unification.md) | One execution model - every run executes a Flow. |
| [`flows-unification.md`](./flows-unification.md) | The A/B decision record that led to runner unification. |
| [`pickup-execution.md`](./pickup-execution.md) | Checklist pick-up execution (per-item band, forward-carry). |
| [`unattended-resilience.md`](./unattended-resilience.md) | U1-U7 complete (0.7.13-0.7.21): budgets, retries, fallback, pause, usage-limit waits. |
| [`run-audit-graph.md`](./run-audit-graph.md) | Phases A-D (0.7.18-0.7.25): audit tree, visuals, turn internals, engagement lane. |
| [`orchestrator-personas.md`](./orchestrator-personas.md) | Slices 1-2 (0.7.30-0.7.31): staff-engineer + security personas. Follow-ups open (TODO). |
| [`structured-handoff-contracts.md`](./structured-handoff-contracts.md) | Builder-side handoff contracts, opt-in (0.6.0 slice 3). |
| [`provider-apply-layer.md`](./provider-apply-layer.md) | `provider-apply.ts` as the single source for model/effort application. |
| [`provider-permission-mode.md`](./provider-permission-mode.md) | Write capability reaches the claude CLI permission mode (0.7.32). |
| [`multi-project-navigator.md`](./multi-project-navigator.md) | Workspace navigator over isolated per-project tenants. |

## Archived (moved to `docs/archive/`, gitignored)

- `crew-page-redesign-prompt.md`, `flows-hub-ui-design-prompt.md` - one-off
  claude.ai/design handoff prompts (2026-06-11 cleanup; zero inbound refs).
- Older superseded plans (`CODEX_PLAN.md`, `roadmap.md`, TODO iterations,
  scratch notes) were already there.
