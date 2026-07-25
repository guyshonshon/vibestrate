import { useMemo, useState } from "react";
import { ChevronRight, Cpu, GitBranch, Wrench, Bot, ShieldQuestion } from "lucide-react";
import type { RunAudit, AuditStep, EngagementEntry, PerItemVerdict } from "../../lib/types.js";

// ── Live run node-tree ───────────────────────────────────────────────────────
// The supervisor + agents, as a tree, refreshed on the run-detail poll. The flow
// is the supervisor root; each step is a DAG node (depth-indented from `needs`,
// phase-grouped by `stage`); the inside-the-turn agent activity (tools +
// sub-agents, or an opaque box) hangs off each step as leaves. The supervisor's
// own moments ride the engagement lane. Data comes from buildRunAudit - layer-1
// orchestration is exact; layer-2 provider internals are partial/opaque (see
// docs/design/run-audit-graph.md), and this view says so rather than faking it.

const STAGE_ORDER = [
  "planning",
  "architecting",
  "executing",
  "reviewing",
  "verifying",
] as const;

const STAGE_LABEL: Record<string, string> = {
  planning: "Planning",
  architecting: "Architecting",
  executing: "Executing",
  reviewing: "Reviewing",
  verifying: "Verifying",
};

function fmtTokens(step: AuditStep): string | null {
  const i = step.tokensIn ?? 0;
  const o = step.tokensOut ?? 0;
  const n = i + o;
  if (n <= 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function fmtDuration(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtCost(usd: number | null): string | null {
  if (usd == null || usd <= 0) return null;
  return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
}

type StatusKind = "running" | "done" | "bad" | "pending";

function statusKind(status: string): StatusKind {
  const s = status.toLowerCase();
  if (s === "running" || s === "active" || s === "in_progress") return "running";
  if (s === "passed" || s === "done" || s === "approved" || s === "merge_ready") return "done";
  if (s === "failed" || s === "blocked" || s === "aborted" || s === "changes_requested") return "bad";
  return "pending";
}

function statusInk(kind: StatusKind): string {
  return kind === "done"
    ? "var(--s-ok-ink)"
    : kind === "running"
      ? "var(--s-soft-ink)"
      : kind === "bad"
        ? "var(--s-warn-ink)"
        : "var(--s-ink-faint)";
}

function statusFill(kind: StatusKind): string {
  return kind === "done"
    ? "var(--s-ok)"
    : kind === "running"
      ? "var(--s-soft)"
      : kind === "bad"
        ? "rgba(245, 158, 11, 0.16)"
        : "var(--s-slab-2)";
}

const toneInk: Record<EngagementEntry["tone"], string> = {
  ok: "var(--s-ok-ink)",
  warn: "var(--s-warn-ink)",
  bad: "var(--s-warn-ink)",
  info: "var(--s-ink-dim)",
};

/** Longest-path depth from `needs` edges, so the DAG reads as an indented tree. */
function depthMap(steps: AuditStep[]): Map<string, number> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle guard (DAG should have none)
    seen.add(id);
    const step = byId.get(id);
    const needs = step?.needs ?? [];
    const d = needs.length === 0 ? 0 : 1 + Math.max(...needs.map((p) => compute(p, seen)));
    depth.set(id, d);
    return d;
  };
  steps.forEach((s) => compute(s.id, new Set()));
  return depth;
}

function TelemetryCell({ value, unit }: { value: string | null; unit: string }) {
  return (
    <div
      style={{
        minWidth: 58,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        color: value ? "var(--s-ink-dim)" : "var(--s-ink-faint)",
        fontSize: 11.5,
      }}
    >
      {value ? (
        <>
          <span style={{ color: "var(--s-ink)", fontWeight: 600 }}>{value}</span>
          <span style={{ marginLeft: 3, opacity: 0.7 }}>{unit}</span>
        </>
      ) : (
        <span style={{ opacity: 0.5 }}>-</span>
      )}
    </div>
  );
}

function StepRow({
  step,
  depth,
  engagement,
  expanded,
  onToggle,
}: {
  step: AuditStep;
  depth: number;
  engagement: EngagementEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const kind = statusKind(step.status);
  const toolTotal = step.tools.reduce((a, t) => a + t.count, 0);
  const hasDetail =
    step.tools.length > 0 ||
    step.subAgents.length > 0 ||
    step.attempts.length > 0 ||
    step.internalsOpaque ||
    engagement.length > 0;
  return (
    <div style={{ borderTop: "1px solid var(--s-line)" }}>
      <div
        onClick={hasDetail ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          paddingLeft: 10 + depth * 18,
          cursor: hasDetail ? "pointer" : "default",
        }}
      >
        {/* tree guide + status pip */}
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            borderRadius: 9,
            flexShrink: 0,
            background: statusFill(kind),
            border: `1.5px solid ${statusInk(kind)}`,
            boxShadow: kind === "running" ? `0 0 0 3px var(--s-soft)` : "none",
          }}
        />
        <ChevronRight
          size={13}
          style={{
            color: "var(--s-ink-faint)",
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform 120ms",
            opacity: hasDetail ? 1 : 0,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--s-ink)" }}>
              {step.label}
            </span>
            {step.seat ? (
              <span style={{ fontSize: 11.5, color: "var(--s-ink-faint)" }}>{step.seat}</span>
            ) : null}
            {step.decision ? (
              <span
                style={{
                  fontSize: 10.5,
                  padding: "1px 6px",
                  borderRadius: 5,
                  color: statusInk(kind),
                  background: statusFill(kind),
                }}
              >
                {step.decision}
              </span>
            ) : null}
            {step.fellBack ? (
              <span style={{ fontSize: 10.5, color: "var(--s-warn-ink)" }}>fell back</span>
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: "var(--s-ink-faint)", marginTop: 1 }}>
            {step.roleLabel ?? step.roleId ?? step.kind}
            {step.model ? ` · ${step.model}` : ""}
            {step.retries > 0 ? ` · ${step.retries} retr${step.retries === 1 ? "y" : "ies"}` : ""}
          </div>
        </div>
        <TelemetryCell value={fmtTokens(step)} unit="tok" />
        <TelemetryCell value={toolTotal > 0 ? String(toolTotal) : null} unit="tools" />
        <TelemetryCell value={fmtDuration(step.durationMs)} unit="" />
        <TelemetryCell value={fmtCost(step.costUsd)} unit="" />
      </div>

      {expanded && hasDetail ? (
        <div
          style={{
            paddingLeft: 10 + depth * 18 + 26,
            paddingRight: 12,
            paddingBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {step.internalsOpaque ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                color: "var(--s-ink-faint)",
                fontStyle: "italic",
              }}
            >
              <ShieldQuestion size={13} /> provider streamed no internals - what the agent
              did inside this turn is opaque.
            </div>
          ) : null}
          {step.tools.length > 0 ? (
            <div>
              <Leaf icon={<Wrench size={12} />} label="Tools" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                {step.tools.map((t) => (
                  <span
                    key={t.name}
                    style={{
                      fontSize: 11,
                      padding: "2px 7px",
                      borderRadius: 5,
                      background: "var(--s-slab-2)",
                      color: "var(--s-ink-dim)",
                    }}
                  >
                    {t.name}
                    <span style={{ color: "var(--s-ink-faint)", marginLeft: 4 }}>x{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {step.subAgents.length > 0 ? (
            <div>
              <Leaf icon={<Bot size={12} />} label="Sub-agents" />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5 }}>
                {step.subAgents.map((a, i) => (
                  <div key={`${a.name}-${i}`} style={{ fontSize: 11.5, color: "var(--s-ink-dim)" }}>
                    <span style={{ color: "var(--s-ink)", fontWeight: 600 }}>{a.name}</span>
                    {a.description ? (
                      <span style={{ color: "var(--s-ink-faint)" }}> - {a.description}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {step.attempts.length > 1 ? (
            <div>
              <Leaf icon={<GitBranch size={12} />} label="Attempts" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                {step.attempts.map((at) => (
                  <span
                    key={at.index}
                    style={{ fontSize: 11, color: "var(--s-ink-faint)" }}
                  >
                    {at.index + 1}. {at.outcome}
                    {at.detail ? ` (${at.detail})` : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {engagement.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {engagement.map((e) => (
                <div key={e.seq} style={{ fontSize: 11.5, color: toneInk[e.tone] }}>
                  <span style={{ fontWeight: 600 }}>{e.title}</span>
                  {e.detail ? <span style={{ color: "var(--s-ink-faint)" }}> - {e.detail}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Leaf({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--s-ink-faint)" }}>
      <span style={{ color: "var(--s-ink-dim)" }}>{icon}</span>
      {label}
    </div>
  );
}

const VERDICT_INK: Record<PerItemVerdict["verdict"], string> = {
  approved: "var(--s-ok-ink)",
  changes_requested: "var(--s-warn-ink)",
  none: "var(--s-ink-faint)",
};

const VERDICT_FILL: Record<PerItemVerdict["verdict"], string> = {
  approved: "var(--s-ok)",
  changes_requested: "rgba(245, 158, 11, 0.13)",
  none: "var(--s-slab-2)",
};

const VERDICT_LABEL: Record<PerItemVerdict["verdict"], string> = {
  approved: "approved",
  changes_requested: "changes requested",
  none: "no verdict",
};

function ChecklistVerdictsPanel({ verdicts }: { verdicts: PerItemVerdict[] }) {
  if (verdicts.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 10,
        borderTop: "1px solid var(--s-line)",
        paddingTop: 8,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--s-ink-faint)",
          letterSpacing: 0.3,
          marginBottom: 6,
        }}
      >
        Per-item review verdicts
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {verdicts.map((v) => (
          <div
            key={v.itemIndex}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11.5,
            }}
          >
            {/* static status dot - no pulse, no animation */}
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 7,
                flexShrink: 0,
                background: VERDICT_FILL[v.verdict],
                border: `1.5px solid ${VERDICT_INK[v.verdict]}`,
              }}
            />
            <span style={{ color: "var(--s-ink-dim)", minWidth: 60 }}>
              Item {v.itemIndex + 1}
            </span>
            {/* flat tinted text label - no pill rounding */}
            <span
              style={{
                fontSize: 10.5,
                padding: "1px 5px",
                borderRadius: 3,
                color: VERDICT_INK[v.verdict],
                background: VERDICT_FILL[v.verdict],
                fontWeight: 600,
              }}
            >
              {VERDICT_LABEL[v.verdict]}
            </span>
            {v.fixIterations > 0 ? (
              <span style={{ fontSize: 10.5, color: "var(--s-fg-muted)" }}>
                {v.fixIterations} fix {v.fixIterations === 1 ? "iteration" : "iterations"}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RunTree({
  audit,
  engagement,
  checklistVerdicts = [],
}: {
  audit: RunAudit | null;
  engagement: EngagementEntry[];
  checklistVerdicts?: PerItemVerdict[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const depth = useMemo(() => depthMap(audit?.steps ?? []), [audit]);
  // Engagement anchored to a step shows on that step; root/run/fanout moments
  // ride the supervisor header lane.
  const engByStep = useMemo(() => {
    const m = new Map<string, EngagementEntry[]>();
    for (const e of engagement) {
      if (e.stepId) m.set(e.stepId, [...(m.get(e.stepId) ?? []), e]);
    }
    return m;
  }, [engagement]);
  // Step-anchored moments render on their step (engByStep); the rest - root/run
  // anchored - ride the supervisor header lane. deriveEngagement always pairs a
  // root/run anchor with a null stepId, so !e.stepId covers them.
  const supervisorLane = useMemo(
    () => engagement.filter((e) => !e.stepId),
    [engagement],
  );

  if (!audit) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--s-ink-faint)", fontSize: 13 }}>
        No activity tree yet. It appears once the run starts writing its events.
      </div>
    );
  }

  const grouped = STAGE_ORDER.map((stage) => ({
    stage: stage as string,
    steps: audit.steps.filter((s) => (s.stage ?? "") === stage),
  })).filter((g) => g.steps.length > 0);
  const other = audit.steps.filter((s) => !STAGE_ORDER.includes((s.stage ?? "") as never));
  if (other.length > 0) grouped.push({ stage: "other", steps: other });

  const rootKind = statusKind(audit.status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Supervisor (flow root) */}
      <div
        style={{
          border: `1px solid var(--s-line)`,
          borderRadius: 12,
          padding: "12px 14px",
          background: "var(--s-slab)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Cpu size={16} style={{ color: "var(--s-accent-bright)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--s-ink)" }}>
              {audit.flow?.label ?? "Supervisor"}
              <span style={{ marginLeft: 8, fontSize: 11.5, color: statusInk(rootKind) }}>
                {audit.status}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--s-ink-faint)", marginTop: 1 }}>
              {audit.totals.turns} turn{audit.totals.turns === 1 ? "" : "s"}
              {audit.totals.retries > 0 ? ` · ${audit.totals.retries} retries` : ""}
              {audit.totals.fallbacks > 0 ? ` · ${audit.totals.fallbacks} fallbacks` : ""}
              {fmtCost(audit.totals.costUsd) ? ` · ${fmtCost(audit.totals.costUsd)}` : ""}
            </div>
          </div>
          {audit.assuranceVerdict ? (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 6,
                color: statusInk(statusKind(audit.assuranceVerdict)),
                background: statusFill(statusKind(audit.assuranceVerdict)),
              }}
            >
              {audit.assuranceVerdict}
            </span>
          ) : null}
        </div>
        {supervisorLane.length > 0 ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
            {supervisorLane.slice(0, 6).map((e) => (
              <div key={e.seq} style={{ fontSize: 11.5, color: toneInk[e.tone] }}>
                <span style={{ fontWeight: 600 }}>{e.title}</span>
                {e.detail ? <span style={{ color: "var(--s-ink-faint)" }}> - {e.detail}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        <ChecklistVerdictsPanel verdicts={checklistVerdicts} />
      </div>

      {/* Phase groups -> step tree */}
      {grouped.map((g) => {
        const done = g.steps.filter((s) => statusKind(s.status) === "done").length;
        return (
          <div
            key={g.stage}
            style={{
              border: "1px solid var(--s-line)",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--s-slab)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "var(--s-glass-2)",
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--s-ink-dim)", letterSpacing: 0.2 }}>
                {STAGE_LABEL[g.stage] ?? g.stage}
              </span>
              <span style={{ fontSize: 11, color: "var(--s-ink-faint)", fontVariantNumeric: "tabular-nums" }}>
                {done}/{g.steps.length}
              </span>
            </div>
            {g.steps.map((s) => (
              <StepRow
                key={s.id}
                step={s}
                depth={depth.get(s.id) ?? 0}
                engagement={engByStep.get(s.id) ?? []}
                expanded={expanded.has(s.id)}
                onToggle={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
