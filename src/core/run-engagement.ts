// ── Orchestrator engagement (derivation) ────────────────────────────────────
//
// Fold the run's event stream into an ordered, classified list of the moments
// the orchestrator *engaged*: where it took a turn, made a judgment call, or a
// code-enforced gate fired. This is the "where did the supervisor do something"
// lane that sits beside the run graph.
//
// The classification axis is the honesty boundary from
// docs/design/responsible-orchestrator.md: the orchestrator is itself a model,
// so a "judgment" (workflow selection, a review/verification verdict) is
// advisory and can be wrong, while an "enforced" gate (the diff gate, an Action
// Broker denial, a budget ceiling, a required approval) is deterministic and
// authoritative. The two must never be conflated - rendering a model verdict as
// if it were a hard guarantee is exactly the "laundering model confidence as
// supervision" failure the design forbids. "structural" is neither: it is the
// orchestrator executing the chosen workflow shape (a fan-out wave, a rewind).
//
// Pure derivation (testable without disk), mirroring run-audit.ts. Works live
// (the event log is append-only) and at terminal state.

import type { VibestrateEvent } from "./event-log.js";

export type EngagementClass = "judgment" | "enforced" | "structural";
export type EngagementTone = "ok" | "warn" | "bad" | "info";
/** Where the entry renders relative to the graph. */
export type EngagementAnchor = "root" | "fanout" | "step" | "run";

export type EngagementEntry = {
  seq: number;
  timestamp: string;
  /** Raw event type, for drill-down. */
  type: string;
  cls: EngagementClass;
  anchor: EngagementAnchor;
  /** The flow step this engagement attaches to, when it has one. */
  stepId: string | null;
  title: string;
  detail: string | null;
  tone: EngagementTone;
};

function str(d: Record<string, unknown>, k: string): string | null {
  const v = d[k];
  return typeof v === "string" ? v : null;
}
function num(d: Record<string, unknown>, k: string): number | null {
  const v = d[k];
  return typeof v === "number" ? v : null;
}
function len(d: Record<string, unknown>, k: string): number {
  const v = d[k];
  return Array.isArray(v) ? v.length : 0;
}
/** A step/stage id from the event payload, if any. */
function stepOf(d: Record<string, unknown>): string | null {
  return str(d, "stepId") ?? str(d, "stageId");
}

type Partial = Omit<EngagementEntry, "seq" | "timestamp" | "type">;

/** Map one event to an engagement entry, or null if it is not a supervisory
 *  moment. Frequent low-signal events (per-attempt retries, provider start/stop,
 *  step start/complete) are deliberately excluded - retries live on the node's
 *  attempt chain; this lane is the orchestrator's decisions and the hard gates. */
function entryFor(e: VibestrateEvent): Partial | null {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const step = stepOf(d);
  const onStep = (): EngagementAnchor => (step ? "step" : "run");

  switch (e.type) {
    // ── Judgment: the orchestrator-as-model made a call (advisory) ──────────
    case "workflow.selected": {
      const conf = str(d, "confidence");
      const risks = len(d, "risks");
      return {
        cls: "judgment",
        anchor: "root",
        stepId: null,
        title: `selected ${str(d, "flowId") ?? "flow"}`,
        detail:
          [conf ? `confidence ${conf}` : null, risks ? `${risks} risk${risks > 1 ? "s" : ""}` : null]
            .filter(Boolean)
            .join(" · ") || null,
        tone: "info",
      };
    }
    case "supervisor.reviewer_profile": {
      const profile = str(d, "reviewerProfile") ?? "reviewer profile";
      const steps = len(d, "steps");
      return {
        cls: "judgment",
        anchor: "root",
        stepId: null,
        title: `review seats pinned to ${profile}`,
        detail: steps ? `${steps} step${steps > 1 ? "s" : ""}` : null,
        tone: "info",
      };
    }
    case "review.decision": {
      const dec = str(d, "decision") ?? "decision";
      return {
        cls: "judgment",
        anchor: "step",
        stepId: step,
        title: `review · ${dec}`,
        detail: null,
        tone: dec === "APPROVED" ? "ok" : dec === "BLOCKED" ? "bad" : "warn",
      };
    }
    case "verification.decision": {
      const dec = str(d, "decision") ?? "decision";
      return {
        cls: "judgment",
        anchor: "step",
        stepId: step,
        title: `verify · ${dec}`,
        detail: null,
        tone: dec === "PASSED" ? "ok" : dec === "FAILED" ? "bad" : "warn",
      };
    }
    case "needs_testing.flagged":
      return {
        cls: "judgment",
        anchor: "step",
        stepId: step,
        title: "flagged needs-testing",
        detail: str(d, "reason"),
        tone: "warn",
      };
    case "flow.handoff.parsed": {
      const parsed = d.parsed === true;
      return {
        cls: "judgment",
        anchor: "step",
        stepId: step,
        title: `handoff ${str(d, "token") ?? ""} ${parsed ? "parsed" : "unparsed"}`.replace(/\s+/g, " ").trim(),
        detail: str(d, "message"),
        tone: parsed ? "ok" : "warn",
      };
    }

    // ── Enforced: a code gate / deterministic system action fired ───────────
    case "action.denied":
      return {
        cls: "enforced",
        anchor: onStep(),
        stepId: step,
        title: `denied · ${str(d, "kind") ?? "action"}`,
        detail: str(d, "verdict") ?? str(d, "effect"),
        tone: "bad",
      };
    case "action.approval_required":
      return {
        cls: "enforced",
        anchor: onStep(),
        stepId: step,
        title: `approval required · ${str(d, "kind") ?? "action"}`,
        detail: null,
        tone: "warn",
      };
    case "approval.requested":
      return {
        cls: "enforced",
        anchor: onStep(),
        stepId: step,
        title: "paused for approval",
        detail: [str(d, "source"), str(d, "reason")].filter(Boolean).join(" · ") || null,
        tone: "warn",
      };
    case "approval.approved":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: "approval approved", detail: str(d, "decisionNote"), tone: "ok" };
    case "approval.rejected":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: "approval rejected", detail: str(d, "decisionNote"), tone: "bad" };
    case "approval.expired":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: "approval expired", detail: null, tone: "bad" };
    case "budget.limit": {
      const resolved = str(d, "resolved");
      return {
        cls: "enforced",
        anchor: "run",
        stepId: null,
        title: `budget limit · ${str(d, "kind") ?? "budget"}`,
        detail: [str(d, "onLimit"), resolved].filter(Boolean).join(" → ") || null,
        tone: resolved === "approved" ? "warn" : "bad",
      };
    }
    case "spend.capped":
      return { cls: "enforced", anchor: "run", stepId: null, title: "spend capped → stop", detail: null, tone: "bad" };
    case "spend.action":
      return { cls: "enforced", anchor: "run", stepId: null, title: `spend · ${str(d, "action") ?? "action"}`, detail: str(d, "fallbackProfile"), tone: "warn" };
    case "spend.warning":
      return { cls: "enforced", anchor: "run", stepId: null, title: "spend warning", detail: null, tone: "warn" };
    case "policy.warning":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: `policy · ${str(d, "kind") ?? str(d, "code") ?? "warning"}`, detail: null, tone: "warn" };
    case "provider.fallback": {
      const ok = d.ok === true;
      const prof = str(d, "fallbackProfile");
      return {
        cls: "enforced",
        anchor: onStep(),
        stepId: step,
        title: ok ? `fell back${prof ? ` → ${prof}` : ""}` : "no usable fallback",
        detail: str(d, "class"),
        tone: ok ? "info" : "bad",
      };
    }
    case "provider.usage_limit": {
      const gaveUp = str(d, "resolved") === "give-up";
      return {
        cls: "enforced",
        anchor: onStep(),
        stepId: step,
        title: `usage limit · ${gaveUp ? "gave up" : (str(d, "action") ?? "hit")}`,
        detail: str(d, "detail"),
        tone: gaveUp ? "bad" : "warn",
      };
    }
    case "provider.retries_exhausted":
      return {
        cls: "enforced",
        anchor: onStep(),
        stepId: step,
        title: `provider exhausted · ${str(d, "class") ?? "failure"}`,
        detail: str(d, "detail"),
        tone: "bad",
      };
    case "provider.effort_ignored":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: "effort ignored", detail: str(d, "effort"), tone: "warn" };
    case "provider.sandboxed":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: `sandboxed · ${str(d, "mode") ?? "os"}`, detail: str(d, "provider"), tone: "info" };
    case "provider.sandbox_unavailable":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: "sandbox unavailable", detail: str(d, "provider"), tone: "warn" };
    case "provider.hardened":
      return { cls: "enforced", anchor: onStep(), stepId: step, title: "read-only hardened · plan", detail: str(d, "provider"), tone: "info" };

    // ── Structural: executing the chosen workflow shape ─────────────────────
    case "flow.frontier.scheduled": {
      const width = num(d, "width") ?? len(d, "stepIds");
      const ids = Array.isArray(d.stepIds) ? (d.stepIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
      return { cls: "structural", anchor: "fanout", stepId: null, title: `fanned out ×${width}`, detail: ids.join(", ") || null, tone: "info" };
    }
    case "run.rewound": {
      const from = str(d, "fromStage");
      return { cls: "structural", anchor: "run", stepId: null, title: `rewound${from ? ` from ${from}` : ""}`, detail: str(d, "sourceRunId"), tone: "info" };
    }

    default:
      return null;
  }
}

/** Pure derivation - no disk. Ordered by the event stream. */
export function deriveEngagement(events: VibestrateEvent[]): EngagementEntry[] {
  const out: EngagementEntry[] = [];
  let seq = 0;
  for (const e of events) {
    const partial = entryFor(e);
    if (!partial) continue;
    out.push({ ...partial, seq, timestamp: e.timestamp, type: e.type });
    seq += 1;
  }
  return out;
}
