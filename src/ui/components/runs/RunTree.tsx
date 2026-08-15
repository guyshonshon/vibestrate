import { useMemo, useState } from "react";
import { ChevronRight, Cpu, GitBranch, Wrench, Bot, ShieldQuestion } from "lucide-react";
import type { RunAudit, AuditStep, EngagementEntry, PerItemVerdict } from "../../lib/types.js";
import { Chip, ToneDot, type ChipTone } from "../design/Chip.js";
import { stepKindName } from "../design/stepKind.js";
import { StatTile } from "../design/StatTile.js";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonRows,
  SkeletonStats,
} from "../design/Skeleton.js";

// ── Live run node-tree ───────────────────────────────────────────────────────
// The supervisor + agents, as a tree, refreshed on the run-detail poll. The flow
// is the supervisor root; each step is a DAG node (depth-indented from `needs`,
// phase-grouped by `stage`); the inside-the-turn agent activity (tools +
// sub-agents, or an opaque box) hangs off each step as leaves. The supervisor's
// own moments ride the engagement lane. Data comes from buildRunAudit - layer-1
// orchestration is exact; layer-2 provider internals are partial/opaque, and
// this view says so rather than faking it.

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

// Same 4-bucket semantics the tree always had: "bad" covers both hard
// failures and recoverable stops (blocked/changes-requested) and reads as
// attention (amber), not danger (rose) - failed steps still surface their own
// detail in engagement/attempts. Kept as-is; this migration fixes the token
// resolution, not the color semantics.
const KIND_TONE: Record<StatusKind, ChipTone> = {
  done: "emerald",
  running: "violet",
  bad: "amber",
  pending: "neutral",
};

const DOT_TONE: Record<StatusKind, string> = {
  done: "bg-emerald-400/25 border-emerald-400",
  running: "bg-violet-soft/25 border-violet-soft",
  bad: "bg-amber-soft/25 border-amber-soft",
  pending: "bg-coal-400 border-chalk-400",
};

// "bad" reuses the warn/amber ink, matching the original two-tone scheme
// (ok vs. not-ok) rather than introducing a third color for engagement rows.
const TONE_TEXT: Record<EngagementEntry["tone"], string> = {
  ok: "text-emerald-400",
  warn: "text-amber-soft",
  bad: "text-amber-soft",
  info: "text-chalk-300",
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
    <div className="min-w-[58px] text-right text-meta num-tabular">
      {value ? (
        <>
          <span className="font-semibold text-chalk-100">{value}</span>
          <span className="ml-[3px] text-chalk-400">{unit}</span>
        </>
      ) : (
        <span className="text-chalk-400/60">-</span>
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
    <div className="border-t border-[color:var(--line)]">
      <div
        onClick={hasDetail ? onToggle : undefined}
        className={`flex items-center gap-2 py-2 pr-2.5 ${hasDetail ? "cursor-pointer" : ""}`}
        style={{ paddingLeft: 10 + depth * 18 }}
      >
        {/* tree guide + status pip - static ring on "running", no pulse animation */}
        <span
          aria-hidden
          className={`h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] ${DOT_TONE[kind]} ${
            kind === "running" ? "ring-[3px] ring-violet-soft/25" : ""
          }`}
        />
        <ChevronRight
          size={13}
          className={`shrink-0 text-chalk-400 transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          } ${hasDetail ? "opacity-100" : "opacity-0"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-chalk-100">{step.label}</span>
            {step.seat ? <span className="text-meta text-chalk-400">{step.seat}</span> : null}
            {step.decision ? (
              <Chip contained tone={KIND_TONE[kind]}>
                {step.decision}
              </Chip>
            ) : null}
            {step.fellBack ? <span className="text-meta text-amber-soft">fell back</span> : null}
          </div>
          <div className="mt-px text-meta text-chalk-400">
            {step.roleLabel ?? step.roleId ?? stepKindName(step.kind)}
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
          className="flex flex-col gap-2 pb-2.5 pr-3"
          style={{ paddingLeft: 10 + depth * 18 + 26 }}
        >
          {step.internalsOpaque ? (
            <div className="flex items-center gap-1.5 text-meta italic text-chalk-400">
              <ShieldQuestion size={13} /> provider streamed no internals - what the agent
              did inside this turn is opaque.
            </div>
          ) : null}
          {step.tools.length > 0 ? (
            <div>
              <Leaf icon={<Wrench size={12} />} label="Tools" />
              <div className="mt-[5px] flex flex-wrap gap-1.5">
                {step.tools.map((t) => (
                  <Chip key={t.name} contained tone="neutral">
                    {t.name}
                    <span className="ml-1 text-chalk-400">x{t.count}</span>
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {step.subAgents.length > 0 ? (
            <div>
              <Leaf icon={<Bot size={12} />} label="Sub-agents" />
              <div className="mt-[5px] flex flex-col gap-[3px]">
                {step.subAgents.map((a, i) => (
                  <div key={`${a.name}-${i}`} className="text-meta text-chalk-300">
                    <span className="font-semibold text-chalk-100">{a.name}</span>
                    {a.description ? <span className="text-chalk-400"> - {a.description}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {step.attempts.length > 1 ? (
            <div>
              <Leaf icon={<GitBranch size={12} />} label="Attempts" />
              <div className="mt-[5px] flex flex-wrap gap-1.5">
                {step.attempts.map((at) => (
                  <span key={at.index} className="text-meta text-chalk-400">
                    {at.index + 1}. {at.outcome}
                    {at.detail ? ` (${at.detail})` : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {engagement.length > 0 ? (
            <div className="flex flex-col gap-[3px]">
              {engagement.map((e) => (
                <div key={e.seq} className={`text-meta ${TONE_TEXT[e.tone]}`}>
                  <span className="font-semibold">{e.title}</span>
                  {e.detail ? <span className="text-chalk-400"> - {e.detail}</span> : null}
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
    <div className="flex items-center gap-[5px] text-meta text-chalk-400">
      <span className="text-chalk-300">{icon}</span>
      {label}
    </div>
  );
}

const VERDICT_TONE: Record<PerItemVerdict["verdict"], ChipTone> = {
  approved: "emerald",
  changes_requested: "amber",
  none: "neutral",
};

const VERDICT_LABEL: Record<PerItemVerdict["verdict"], string> = {
  approved: "approved",
  changes_requested: "changes requested",
  none: "no verdict",
};

function ChecklistVerdictsPanel({ verdicts }: { verdicts: PerItemVerdict[] }) {
  if (verdicts.length === 0) return null;
  return (
    <div className="mt-2.5 border-t border-[color:var(--line)] pt-2">
      <div className="mb-1.5 text-meta font-bold tracking-[0.3px] text-chalk-400">
        Per-item review verdicts
      </div>
      <div className="flex flex-col gap-1">
        {verdicts.map((v) => (
          <div key={v.itemIndex} className="flex items-center gap-2 text-meta">
            <ToneDot tone={VERDICT_TONE[v.verdict]} />
            <span className="min-w-[60px] text-chalk-300">Item {v.itemIndex + 1}</span>
            <Chip contained tone={VERDICT_TONE[v.verdict]}>
              {VERDICT_LABEL[v.verdict]}
            </Chip>
            {v.fixIterations > 0 ? (
              <span className="text-meta text-chalk-400">
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

  // A null audit is the trail still loading. The tree's own shape - supervisor
  // root, then phase groups of step rows - stands in for it.
  if (!audit) {
    return (
      <Skeleton label="Loading the run tree" className="flex flex-col gap-3">
        <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <SkeletonBlock w={16} h={16} radius={5} />
            <SkeletonBlock tone="text" h={13} w="34%" />
            <SkeletonBlock h={18} w={72} radius={8} className="ml-auto" />
          </div>
          <div className="mt-3">
            <SkeletonStats count={3} />
          </div>
        </div>
        {[0, 1].map((g) => (
          <div
            key={g}
            className="overflow-hidden rounded-[12px] border border-[color:var(--line)] bg-coal-600"
          >
            <div className="flex items-center justify-between bg-coal-500 px-3 py-2">
              <SkeletonBlock tone="text" h={11} w={72} />
              <SkeletonBlock tone="text" h={11} w={28} />
            </div>
            <SkeletonRows rows={3} lead="icon" trailing divided className="px-3" />
          </div>
        ))}
      </Skeleton>
    );
  }

  const grouped = STAGE_ORDER.map((stage) => ({
    stage: stage as string,
    steps: audit.steps.filter((s) => (s.stage ?? "") === stage),
  })).filter((g) => g.steps.length > 0);
  const other = audit.steps.filter((s) => !STAGE_ORDER.includes((s.stage ?? "") as never));
  if (other.length > 0) grouped.push({ stage: "other", steps: other });

  const rootKind = statusKind(audit.status);
  const statCost = fmtCost(audit.totals.costUsd);

  return (
    <div className="flex flex-col gap-3">
      {/* Supervisor (flow root) */}
      <div className="rounded-[12px] border border-[color:var(--line)] bg-coal-600 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <Cpu size={16} className="text-violet-soft" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-[13.5px] font-bold text-chalk-100">
              {audit.flow?.label ?? "Supervisor"}
              <Chip tone={KIND_TONE[rootKind]}>{audit.status}</Chip>
            </div>
          </div>
          {audit.assuranceVerdict ? (
            <Chip contained tone={KIND_TONE[statusKind(audit.assuranceVerdict)]}>
              {audit.assuranceVerdict}
            </Chip>
          ) : null}
        </div>
        <div className="mt-2.5 flex flex-wrap items-stretch gap-1">
          <StatTile value={audit.totals.turns} label={audit.totals.turns === 1 ? "turn" : "turns"} />
          {audit.totals.retries > 0 ? (
            <StatTile value={audit.totals.retries} label="retries" tone="amber" />
          ) : null}
          {audit.totals.fallbacks > 0 ? (
            <StatTile value={audit.totals.fallbacks} label="fallbacks" tone="amber" />
          ) : null}
          {statCost ? <StatTile value={statCost} label="cost" /> : null}
        </div>
        {supervisorLane.length > 0 ? (
          <div className="mt-2.5 flex flex-col gap-[3px]">
            {supervisorLane.slice(0, 6).map((e) => (
              <div key={e.seq} className={`text-meta ${TONE_TEXT[e.tone]}`}>
                <span className="font-semibold">{e.title}</span>
                {e.detail ? <span className="text-chalk-400"> - {e.detail}</span> : null}
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
            className="overflow-hidden rounded-[12px] border border-[color:var(--line)] bg-coal-600"
          >
            <div className="flex items-center justify-between bg-coal-500 px-3 py-2">
              <span className="text-meta font-bold tracking-[0.2px] text-chalk-300">
                {STAGE_LABEL[g.stage] ?? g.stage}
              </span>
              <span className="text-meta num-tabular text-chalk-400">
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
