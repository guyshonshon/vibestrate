// ── Run audit graph (derivation) ────────────────────────────────────────────
//
// Fold a run's recorded evidence - the event stream, the run state (the flow
// DAG + final step statuses), the per-turn metrics, and the assurance verdict -
// into one hierarchical "what happened" tree: run -> flow -> steps -> per-step
// attempts (rate-limited -> retry -> fallback -> success), plus run-level control
// events (budget limits, cap actions, pauses). This is the orchestration layer,
// which vibestrate fully owns and so can render exactly. Provider-internal detail
// (the "opaque box" - sub-agents inside a turn) is a later phase and is only
// available when a provider streams it.
//
// Pure derivation (testable without disk), mirroring run-assurance.ts.
// Design: docs/design/run-audit-graph.md.

import { pathExists, readText } from "../utils/fs.js";
import { runEventsPath, runStatePath } from "../utils/paths.js";
import { runStateSchema } from "./state-machine.js";
import { MetricsStore } from "./metrics-store.js";
import { readRunAssurance } from "../safety/run-assurance.js";
import type { VibestrateEvent } from "./event-log.js";
import type { RuntimeMetrics } from "./runtime-metrics.js";
import type { RunState } from "./state-machine.js";

export type AuditAttemptOutcome =
  | "success"
  | "rate-limit"
  | "transient"
  | "fallback"
  | "paused"
  | "tolerated-failure"
  | "failed";

export type AuditAttempt = {
  index: number;
  outcome: AuditAttemptOutcome;
  /** Short note: the retry class+attempt, the fallback profile, etc. */
  detail: string | null;
};

export type AuditStep = {
  id: string;
  label: string;
  kind: string;
  seat: string | null;
  status: string;
  /** DAG dependencies (the graph edges). */
  needs: string[];
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  toolCallCount: number | null;
  /** Resilience retries recorded for this step (rate-limit/transient). */
  retries: number;
  fellBack: boolean;
  /** Review/verification decision the step produced, if any. */
  decision: string | null;
  /** Ordered "what happened" markers for this step. */
  attempts: AuditAttempt[];
};

export type AuditControlEvent = {
  type: string;
  message: string;
};

export type RunAudit = {
  schemaVersion: 1;
  runId: string;
  task: string;
  status: string;
  flow: { id: string; label: string } | null;
  assuranceVerdict: string | null;
  steps: AuditStep[];
  /** Run-level events not tied to a single step (budget/spend/approval). */
  control: AuditControlEvent[];
  totals: {
    turns: number;
    retries: number;
    fallbacks: number;
    costUsd: number | null;
  };
};

function eventStepId(e: VibestrateEvent): string | null {
  const d = e.data as Record<string, unknown> | undefined;
  const id = d?.stepId;
  return typeof id === "string" ? id : null;
}

/** Pure derivation - no disk. */
export function deriveRunAudit(input: {
  runId: string;
  state: RunState | null;
  metrics: RuntimeMetrics | null;
  events: VibestrateEvent[];
  assuranceVerdict: string | null;
}): RunAudit {
  const { state, metrics, events } = input;
  const roles = metrics?.roles ?? [];

  // Per-step metric rollup (sum across this step's turn invocations).
  const metricFor = (stepId: string) => {
    const rs = roles.filter((r) => r.stageId === stepId);
    if (rs.length === 0) {
      return { provider: null, model: null, costUsd: null, durationMs: null, toolCallCount: null };
    }
    const costs = rs.map((r) => r.totalCostUsd).filter((c): c is number => c != null);
    const tools = rs.map((r) => r.toolCallCount).filter((c): c is number => c != null);
    return {
      provider: rs[rs.length - 1]!.providerId ?? null,
      model: rs[rs.length - 1]!.model ?? null,
      costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      durationMs: rs.reduce((a, r) => a + (r.durationMs ?? 0), 0),
      toolCallCount: tools.length ? tools.reduce((a, b) => a + b, 0) : null,
    };
  };

  // Spine: the flow steps from run state (authoritative DAG + final status). When
  // there's no flow state, fall back to the steps the event stream mentions.
  const stateSteps = state?.flow?.steps ?? [];
  const stepIds: { id: string; label: string; kind: string; seat: string | null; status: string; needs: string[] }[] =
    stateSteps.length > 0
      ? stateSteps.map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          seat: s.seat ?? null,
          status: s.status,
          needs: s.needs ?? [],
        }))
      : [...new Set(events.map(eventStepId).filter((x): x is string => !!x))].map((id) => ({
          id,
          label: id,
          kind: "agent-turn",
          seat: null,
          status: "unknown",
          needs: [],
        }));

  let totalRetries = 0;
  let totalFallbacks = 0;

  const steps: AuditStep[] = stepIds.map((s) => {
    const m = metricFor(s.id);
    const stepEvents = events.filter((e) => eventStepId(e) === s.id);
    const attempts: AuditAttempt[] = [];
    let retries = 0;
    let fellBack = false;
    let decision: string | null = null;

    for (const e of stepEvents) {
      const d = (e.data ?? {}) as Record<string, unknown>;
      if (e.type === "flow.step.retried") {
        retries += 1;
        const cls = d.class === "rate-limit" || d.class === "transient" ? (d.class as AuditAttemptOutcome) : "transient";
        attempts.push({ index: 0, outcome: cls, detail: `attempt ${String(d.attempt ?? retries)}` });
      } else if (e.type === "provider.fallback" && d.ok === true) {
        fellBack = true;
        attempts.push({ index: 0, outcome: "fallback", detail: d.fallbackProfile ? `→ ${String(d.fallbackProfile)}` : null });
      } else if (e.type === "approval.requested") {
        attempts.push({ index: 0, outcome: "paused", detail: "awaiting approval" });
      } else if (e.type === "review.decision" || e.type === "verification.decision") {
        decision = typeof d.decision === "string" ? d.decision : decision;
      }
    }

    // Final outcome from the terminal status.
    if (s.status === "passed") {
      attempts.push({ index: 0, outcome: "success", detail: null });
    } else if (s.status === "failed") {
      const failEv = [...stepEvents].reverse().find((e) => e.type === "flow.step.failed");
      const continued = (failEv?.data as Record<string, unknown> | undefined)?.continued === true;
      attempts.push({
        index: 0,
        outcome: continued ? "tolerated-failure" : "failed",
        detail: (failEv?.data as Record<string, unknown> | undefined)?.error
          ? String((failEv!.data as Record<string, unknown>).error)
          : null,
      });
    }
    attempts.forEach((a, i) => (a.index = i + 1));

    totalRetries += retries;
    if (fellBack) totalFallbacks += 1;

    return {
      id: s.id,
      label: s.label,
      kind: s.kind,
      seat: s.seat,
      status: s.status,
      needs: s.needs,
      provider: m.provider,
      model: m.model,
      costUsd: m.costUsd,
      durationMs: m.durationMs,
      toolCallCount: m.toolCallCount,
      retries,
      fellBack,
      decision,
      attempts,
    };
  });

  // Run-level control events (not tied to one step).
  const CONTROL_TYPES = new Set([
    "budget.limit",
    "spend.capped",
    "spend.action",
    "spend.warning",
    "run.rewound",
  ]);
  const control: AuditControlEvent[] = events
    .filter((e) => CONTROL_TYPES.has(e.type) || (e.type.startsWith("approval.") && !eventStepId(e)))
    .map((e) => ({ type: e.type, message: e.message }));

  const stepCosts = steps.map((s) => s.costUsd).filter((c): c is number => c != null);

  return {
    schemaVersion: 1,
    runId: input.runId,
    task: state?.task ?? input.runId,
    status: state?.status ?? "unknown",
    flow: state?.flow ? { id: state.flow.flowId, label: state.flow.label } : null,
    assuranceVerdict: input.assuranceVerdict,
    steps,
    control,
    totals: {
      turns: roles.length,
      retries: totalRetries,
      fallbacks: totalFallbacks,
      costUsd: stepCosts.length ? stepCosts.reduce((a, b) => a + b, 0) : metrics?.totalCostUsd ?? null,
    },
  };
}

async function readEvents(projectRoot: string, runId: string): Promise<VibestrateEvent[]> {
  const file = runEventsPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  const text = await readText(file).catch(() => "");
  const out: VibestrateEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as VibestrateEvent);
    } catch {
      // skip a malformed line
    }
  }
  return out;
}

/** Read a run's evidence from disk and derive its audit tree. */
export async function buildRunAudit(projectRoot: string, runId: string): Promise<RunAudit> {
  let state: RunState | null = null;
  const statePath = runStatePath(projectRoot, runId);
  if (await pathExists(statePath)) {
    try {
      state = runStateSchema.parse(JSON.parse(await readText(statePath)));
    } catch {
      state = null;
    }
  }
  const metrics = await new MetricsStore(projectRoot, runId).read().catch(() => null);
  const events = await readEvents(projectRoot, runId);
  const assurance = await readRunAssurance(projectRoot, runId).catch(() => null);
  return deriveRunAudit({
    runId,
    state,
    metrics,
    events,
    assuranceVerdict: assurance?.verdict ?? null,
  });
}
