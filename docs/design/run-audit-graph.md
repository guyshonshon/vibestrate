# Design: Run audit graph (a tree of everything that happened)

Status: **PROPOSED - design for review, not yet built.** Owner: maintainer.

A single, complete, visual hierarchy of what happened inside a task/run: the
orchestrator -> the flow's steps (the DAG we already draw) -> each step's agent
turn(s) -> what each turn did (succeeded, got rate-limited then retried, fell back
to another model, paused for a human, downgraded, failed-but-tolerated) -> and,
where the provider exposes it, what happened *inside* a turn (tool calls,
sub-agents the provider spawned). One screen to understand a whole run.

This is an **audit** view (evidence-backed, from what was recorded) and a
**visualization**. It is the natural payoff of the resilience work (U2-U5): those
slices already *emit* the rich events (retries with a class, fallbacks, pauses,
cap actions); this makes them legible as a tree instead of a flat log.

---

## Why

Today a run's story is spread across surfaces: the flow graph (step structure +
live status), the event log (a flat ndjson stream), per-step artifacts, and
metrics. To answer "what actually happened, and why did it take so long / cost
what it did?" you cross-reference all of them. For a long unattended run with
retries, fallbacks, and fan-outs, that's hard. The audit graph folds it into one
hierarchy you can read top-down and drill into.

---

## The honesty boundary (the most important design constraint)

There are two layers, and they must never be conflated:

1. **vibestrate's orchestration (FULL, authoritative).** vibestrate owns the
   events, state, and metrics, so the tree of orchestrator -> steps -> turns ->
   attempts -> outcomes is *completely* knowable and exact.
2. **Inside a provider turn (the "opaque box", PARTIAL).** When a provider (e.g.
   Claude Code) spawns its own sub-agents / tool calls during a turn, vibestrate
   sees inside *only if the provider streams structured detail*
   (claude-code `stream-json`). Otherwise the turn is a black box - we know it ran,
   its duration/cost and a `toolCallCount` at best, but not its internal tree.

The audit graph must render layer 1 fully and **mark layer 2 honestly**: show
provider-internal nodes where the stream gives them, and an explicit "opaque -
provider internals not exposed" node otherwise. Never fabricate the inside of the
box. (See `custom-workflow-dags.md`, "the opaque box".)

---

## Node model

A run folds into a typed tree (a pure derivation; see Data sources):

```
run (task, final status, assurance verdict)
└─ flow <id> (the DAG; edges = step `needs`)
   ├─ step <id> (kind, seat, resolved role/profile/provider, status)
   │   └─ attempt 1..N  (one per provider invocation of this step)
   │        · outcome: success | rate-limited | transient | usage-limit |
   │                   fell-back | paused | downgraded | failed | tolerated-failure
   │        · model/provider, cost, duration, tokens, exitCode
   │        · backoff before the next attempt (if any)
   │        └─ provider-internal (when exposed): tool calls / sub-agents,
   │             else an "opaque box" node (+ toolCallCount if known)
   ├─ [parallel group]  (a fan-out wave; children are concurrent steps)
   └─ control events attached in-place: approval (pause), budget.limit,
        spend.action (downgrade/reduce-effort), needs-testing flag
```

- **Attempts** are the key new altitude: a step that got rate-limited twice then
  fell back is one step with three attempts (rate-limited -> rate-limited ->
  fell-back -> success), so "rate-limited -> the next call of that" is exactly the
  attempt chain the user described.
- **Edges**: flow `needs` (already drawn) for step structure; containment for
  step->attempt->provider-internal; the attempt sequence carries the
  retry/fallback causality.

---

## Data sources (all already recorded)

- **`events.ndjson`** - the spine. `flow.step.started/completed/failed/skipped`,
  `flow.step.retried` (carries `class` + `attempt` from U2), `provider.fallback`
  (U3), `budget.limit` / `spend.action` (U1/U4), `approval.requested/approved/
  rejected` (pause), `flow.frontier.scheduled` (fan-out groups),
  `provider.started/completed/failed`.
- **Run state** (`state.json`) - the flow DAG (`steps[].needs`), per-step final
  status, current step.
- **Metrics** (`runtime-metrics.json`) - per-role-turn provider/model, cost,
  duration, tokens, `toolCallCount`.
- **Provider stream** (`provider-stream-store`) - per-turn streamed chunks; for
  `stream-json` providers, the normalized turn can yield tool-call / sub-agent
  detail for layer 2.
- **Run assurance** (`assurance.json`) - the verdict + caps to badge the root.

Nothing new needs to be captured for layer 1 - it's a *derivation* over existing
evidence (like `run-assurance.ts`). Layer 2 depends on provider stream richness.

---

## Phased plan

- **Phase A - the derivation + text view.** `src/core/run-audit.ts`:
  `buildRunAuditTree({ events, state, metrics })` -> typed tree (pure, testable
  without UI). A `vibe audit <runId>` CLI that prints the tree (like
  `vibe assurance`) and `GET /api/runs/:id/audit`. This alone is a big usability
  win and is fully verifiable.
- **Phase B - the visual.** Render the tree on the run-detail page: extend the
  existing layered DAG (`flow-graph-layout.ts`) so step nodes are expandable to
  reveal attempts + outcomes (color-coded: retry/fallback/pause/tolerated-fail),
  with the event timeline cross-linked. Shell-TUI parity (the shared layout
  module already serves web + CLI + shell).
- **Phase C - inside the box.** Surface provider-internal tool calls / sub-agents
  from the stream for `stream-json` providers; honestly render "opaque" otherwise.
  Optionally add a normalized "sub-agent" event other adapters can populate later.

Each phase is independently shippable; A is the foundation.

---

## Open questions

1. **Separate "Audit" tab vs. enriching the existing Flow graph in place?**
   (Lean: enrich the run-detail graph - one place - with an expand/collapse for
   attempt detail, plus a text `vibe audit` for CLI.)
2. **How much layer-2 detail is worth it** before providers commonly stream it?
   (Phase C may stay thin until `stream-json` adoption is broad.)
3. **Scale** - a marathon run can have thousands of attempts/events. The
   derivation should stream/fold the ndjson and the UI should virtualize/collapse
   by default (summaries with drill-down), not render everything at once.
4. **Live vs. terminal** - build the tree incrementally for a running task, or
   only at terminal state? (Lean: derive on demand from the append-only event log,
   so it works live and after.)

---

## Related

- `custom-workflow-dags.md` - the DAG substrate + the opaque-box framing.
- `unattended-resilience.md` - U2-U5 emit the attempt-level events this graph reads.
- `policy-enforcement-assurance.md` - the assurance verdict that badges the root.
