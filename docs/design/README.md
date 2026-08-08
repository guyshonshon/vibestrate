# Design docs index

The per-doc status map for `docs/design/`. These docs are internal (not
rendered on the docs site); each records the *why* behind a decision so future
sessions don't re-derive it. Statuses audited against `main` on 2026-08-08.

**Maintenance rule:** when a doc's work ships or is superseded, update its own
`Status:` line *and* its row here. One-off artifacts (design handoff prompts,
scratch plans) go to `docs/archive/` (gitignored), not here.

**Coverage:** not every file in `docs/design/` has a row yet - this index covers
the product spine and the multi-slice plans. If you touch a doc that is missing
from a table below, add its row while you are there.

## Product spine - living architecture (read these first)

| Doc | What it is |
| --- | --- |
| [`responsible-orchestrator.md`](./responsible-orchestrator.md) | **The current product spine.** Orchestrator as project-aware supervisor; authority bounded by verifiable evidence. Shipping in slices: 1-5 shipped, Slice 2b partial and Phase C (write-parallelism) still open - see TODO. |
| [`vocabulary.md`](./vocabulary.md) | Settled names: Task + Flow + Crew = Run; Flow / Step / Seat / Crew / Role / Profile / Provider. The naming standard for all code + docs. |
| [`custom-workflow-dags.md`](./custom-workflow-dags.md) | The graph execution substrate (DAGs, fan-out/join, frontier scheduler). Phases A + B shipped (0.7.0) and Phase D shipped in both shapes (0.7.28, 0.25.0); Phase C (write-parallelism) deferred. *Product framing* superseded by responsible-orchestrator (DAGs are a primitive the orchestrator chooses, not the identity). |
| [`roadmap-and-sequencing.md`](./roadmap-and-sequencing.md) | The debate doc behind the Phase 2-6 feature decisions - answers + rationale. Master sequence; TODO.md tracks status. |

## Active - open or partially shipped plans

| Doc | Status |
| --- | --- |
| [`proportional-orchestration.md`](./proportional-orchestration.md) | Part A complete: A1 sizer, A2 protected-path matcher, A3 `express` flow shipped 0.7.37-0.7.40. Part B: B3 (change-scoped validation) shipped 0.7.33; B1/B2 (stack census -> proposed validators) still proposed. |
| [`flows-hub.md`](./flows-hub.md) | Hub registry decisions (settled). Read side + seating merged and the web hub browser shipped (0.7.41); **publish shipped 0.24.0**. Install/search still being planned (tracking issue #3). |
| [`policy-enforcement-assurance.md`](./policy-enforcement-assurance.md) | The safety pillar (issue #7). S0-S5 shipped; S6 (OS sandbox) partially shipped - provider-native codex sandbox (off by default) plus the opt-in Docker container backend (0.11.0). The clean-room/credential path still waits on the deferred egress + credential proxy. |
| [`design-system-rollout.md`](./design-system-rollout.md) | **App-wide rollout of the coal/chalk design foundation** (merged to main `f55c8725`). Phases 0-3 shipped (0.27.0-0.30.0); the per-domain page redesigns finished through the UI-revamp track and the legacy-design sweep (see [`legacy-sweep-inventory.md`](./legacy-sweep-inventory.md), closed 2026-07-25), and the header-consistency pass (0.71.1) brought the last two pages over. Every page is on the foundation; only the doc's own Phase 7 cleanup list is unverified. |

## Open proposals - designed, nothing shipped

| Doc | Status |
| --- | --- |
| [`always-on-execution.md`](./always-on-execution.md) | Always-on / laptop-closed execution. Proposed, adversarially reviewed (2026-06). Backlogged. |
| [`provider-structured-output.md`](./provider-structured-output.md) | Structured provider output for live streaming + real CLI metrics. Endorsed direction, not built (Phase 4 A7 residual). |
| [`crew-flow-authoring.md`](./crew-flow-authoring.md) | Open crew/flow authoring decisions (loops, per-role effort, persisted bindings). Decision doc, not built. |
| [`context-scaling.md`](./context-scaling.md) | Inter-step context / token scaling. **Assessed + measured (2026-06): don't build a code knowledge graph; evolve the existing `FlowContextPacket` when a measured bottleneck appears.** Answers the "Graphy" backlog item. |

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
| [`orchestrator-personas.md`](./orchestrator-personas.md) | Slices 1-2 (0.7.30-0.7.31): staff-engineer + security personas, plus reviewLens filtering + the `prefersPosture` nudge (0.19.0). Follow-ups open (TODO). |
| [`run-experience-and-usability-batch.md`](./run-experience-and-usability-batch.md) | All seven slices shipped + merged (0.7.35-0.7.44): blocked-run UX, live transcript, hub merge + web browser, protected paths / `express` / sizer, control center, UI revamp, git onboarding + guided merge-to-main. |
| [`rewind-phase-2.md`](./rewind-phase-2.md) | Phases 1 + 2: resume at review/fix/verify via phase snapshots. Safety follow-ups (ISSUE-001) all resolved in 0.7.98: strengthened guard, restore-health in assurance, restore preview, orphan-ref sweep, one ref per run. |
| [`docker-backend.md`](./docker-backend.md) | **T14 sandboxed execution backend** (the S6 unblocker). Slice 1: provider-native sandbox, off by default (`execution.isolation: sandboxed` → `codex exec --sandbox`). Slice 2: `execution.backend: docker`, opt-in, fail-closed, two mounts only (0.11.0). Egress + credential proxy still deferred, so exfil isolation is not closed. Adversarially reviewed (Opus). |
| [`structured-handoff-contracts.md`](./structured-handoff-contracts.md) | Builder-side handoff contracts, opt-in (0.6.0 slice 3). |
| [`provider-apply-layer.md`](./provider-apply-layer.md) | `provider-apply.ts` as the single source for model/effort application. |
| [`provider-permission-mode.md`](./provider-permission-mode.md) | Write capability reaches the claude CLI permission mode (0.7.32). |
| [`multi-project-navigator.md`](./multi-project-navigator.md) | Workspace navigator over isolated per-project tenants. |
| [`git-tree-merge.md`](./git-tree-merge.md) | **0.18.0:** interactive git tree + supervisor-assisted merge (predict/apply/undo + AI conflict resolution). UI-only; reviewed by ~39 Opus-4.8 agents (3 BLOCKERs fixed). |

## Archived (moved to `docs/archive/`, gitignored)

- `crew-page-redesign-prompt.md`, `flows-hub-ui-design-prompt.md` - one-off
  claude.ai/design handoff prompts (2026-06-11 cleanup; zero inbound refs).
- Older superseded plans (`CODEX_PLAN.md`, `roadmap.md`, TODO iterations,
  scratch notes) were already there.
