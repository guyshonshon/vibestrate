import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, Save } from "lucide-react";
import {
  api,
  type BudgetSettings,
  type LeaderboardEntry,
  type MetricsOverview,
  type OverviewRange,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { Sparkline } from "../../components/design/Sparkline.js";
import { StatTile, type StatTileTone } from "../../components/design/StatTile.js";
import {
  PageShell,
  PageHeader,
  Section,
} from "../../components/layout/PageShell.js";
import { cn } from "../../components/design/cn.js";

const RANGES: OverviewRange[] = ["24h", "7d", "30d", "90d"];

// Status-categorical outcome colours (merged / changes / failed) are read from
// the theme tokens so they flip under :root.light instead of being hardcoded.
// Non-categorical viz (latency, tokens, spend, heatmap, leaderboard) stays the
// single-hue violet house style.
const CSS = {
  emerald: "var(--color-emerald, #34d399)",
  amber: "var(--color-amber-soft, #fb923c)",
  rose: "var(--color-fail, #fb7185)",
  violet: "var(--color-violet-soft, #a78bfa)",
  axis: "var(--color-chalk-400, #8e8e96)",
  line: "var(--line-soft, rgba(255,255,255,0.06))",
} as const;

// Card shell recipe (primitives-contract §5): coal-600 surface, hairline border.
const CARD =
  "rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-5";

export function MetricsPage() {
  const [range, setRange] = useState<OverviewRange>("7d");
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getMetricsOverview(range);
        if (!cancelled) {
          setOverview(r);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [range]);

  const exportCsv = () => {
    if (!overview) return;
    const lines: string[] = [];
    lines.push("section,key,value");
    for (const d of overview.daily) {
      lines.push(
        `daily,${d.date},merged=${d.merged} changes=${d.changes} failed=${d.failed}`,
      );
    }
    for (const s of overview.spendByRole) {
      lines.push(`spend,${s.providerId},${s.dollars}`);
    }
    for (const p of overview.phaseLatency) {
      lines.push(`latency,${p.phase},p50=${p.p50} p95=${p.p95}`);
    }
    for (const l of overview.leaderboard) {
      lines.push(
        `leaderboard,${l.providerId},runs=${l.runs} cost=${l.costUsd}`,
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibestrate-metrics-${overview.range}-${overview.generatedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <PageHeader
        title="Metrics"
        actions={
          <>
            <div className="inline-flex items-center gap-1 rounded-[12px] border border-[color:var(--line-strong)] bg-coal-500 p-[3px]">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-[9px] px-3 py-1.5 text-[12px] font-semibold transition",
                    range === r
                      ? "bg-violet-soft text-coal-900"
                      : "text-chalk-300 hover:text-chalk-100",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={exportCsv}
              disabled={!overview}
              iconLeft={<Download className="h-4 w-4" strokeWidth={1.9} />}
            >
              Export CSV
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mb-4 rounded-[12px] border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-300">
          {error} - retry loads automatically, or switch the range above.
        </div>
      ) : null}

      <KpiStrip overview={overview} />

      <BudgetControl />

      <Section title="Runs and outcomes">
        <div className="grid grid-cols-12 gap-4">
          <div className={cn(CARD, "col-span-12 xl:col-span-8")}>
            <RunsAreaChart overview={overview} />
          </div>
          <div className={cn(CARD, "col-span-12 xl:col-span-4")}>
            <OutcomesDonut overview={overview} />
          </div>
        </div>
      </Section>

      <Section title="Spend and latency">
        <div className="grid grid-cols-12 gap-4">
          <div className={cn(CARD, "col-span-12 lg:col-span-7")}>
            <SpendByRolePanel overview={overview} />
          </div>
          <div className={cn(CARD, "col-span-12 lg:col-span-5")}>
            <LatencyByPhasePanel overview={overview} />
          </div>
        </div>
      </Section>

      <Section title="Activity">
        <div className={CARD}>
          <ActivityHeatmapPanel overview={overview} />
        </div>
      </Section>

      <Section title="Token ledger">
        <div className="grid grid-cols-12 gap-4">
          <div className={cn(CARD, "col-span-12 lg:col-span-7")}>
            <PerModelPanel overview={overview} />
          </div>
          <div className={cn(CARD, "col-span-12 lg:col-span-5")}>
            <TokensByRolePanel overview={overview} />
          </div>
        </div>
      </Section>

      <Section
        title="Leaderboard"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={!overview}
            iconLeft={<Save className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            Export CSV
          </Button>
        }
      >
        <LeaderboardTable overview={overview} />
      </Section>
    </PageShell>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────

function KpiStrip({ overview }: { overview: MetricsOverview | null }) {
  const totals = overview?.totals;
  const sparks = overview?.kpiSparks;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <BigKpi
        label="Runs"
        value={(totals?.runs ?? 0).toLocaleString()}
        sub="vs previous window"
        tone="violet"
        spark={sparks?.runs ?? []}
      />
      <BigKpi
        label="Success rate"
        value={
          totals?.successRate !== null && totals?.successRate !== undefined
            ? `${Math.round(totals.successRate * 100)}%`
            : "-"
        }
        sub="merged / completed"
        tone="emerald"
        spark={sparks?.success ?? []}
      />
      <BigKpi
        label="Duration"
        value={
          totals?.avgDurationSeconds ? `${totals.avgDurationSeconds}s` : "-"
        }
        sub={
          totals?.medianDurationSeconds
            ? `avg, median ${totals.medianDurationSeconds}s`
            : "avg per run"
        }
        tone="sky"
        spark={(sparks?.duration ?? []).map((v) =>
          v === 0 ? 0 : Math.max(0, 500 - v),
        )}
      />
      <BigKpi
        label="Tokens"
        value={fmtTokensShort(totals?.tokens ?? 0)}
        sub={
          totals
            ? `${totals.tokensDelta >= 0 ? "+" : ""}${fmtTokensShort(totals.tokensDelta)} vs prev`
            : "input + output"
        }
        tone="violet"
        spark={[]}
      />
      <BigKpi
        label="Spend"
        value={`$${(totals?.costUsd ?? 0).toFixed(2)}`}
        sub={
          totals?.spendCapDailyUsd
            ? `capped at $${totals.spendCapDailyUsd.toFixed(0)}/day`
            : "no spend cap configured"
        }
        tone="amber"
        spark={sparks?.spend ?? []}
      />
    </div>
  );
}

function fmtTokensShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function BigKpi({
  label,
  value,
  sub,
  spark,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  spark: number[];
  tone: "violet" | "sky" | "amber" | "emerald";
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-soft"
        : tone === "sky"
          ? "text-sky-glow"
          : "text-chalk-100";
  return (
    <div className="rounded-[16px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="text-[11.5px] font-semibold text-violet-soft">
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "num-tabular text-[28px] font-bold leading-none tracking-tight",
              valueTone,
            )}
          >
            {value}
          </div>
          <div className="mt-1 text-[11.5px] text-chalk-300">{sub}</div>
        </div>
        {spark.length > 0 ? (
          <Sparkline values={spark} tone={tone} width={110} height={36} />
        ) : null}
      </div>
    </div>
  );
}

// ── Empty state (CTA, never a dead end - primitives-contract §10a) ─────────

function EmptyState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-[color:var(--line-soft)] bg-coal-500/40 py-10 text-center">
      <span className="max-w-[360px] text-[12.5px] text-chalk-300">{text}</span>
      {actionLabel && onAction ? (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

// ── Runs area chart (stacked) ─────────────────────────────────────────────

function RunsAreaChart({ overview }: { overview: MetricsOverview | null }) {
  const data = overview?.daily ?? [];
  const w = 720;
  const h = 240;
  const pad = { l: 36, r: 12, t: 18, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const maxTotal = Math.max(
    1,
    ...data.map((d) => d.merged + d.changes + d.failed),
  );
  const stepX = innerW / Math.max(1, data.length - 1);
  const yScale = (v: number) => innerH - (v / maxTotal) * innerH;

  const colors = { merged: CSS.emerald, changes: CSS.amber, failed: CSS.rose };
  const cum = data.map(() => ({ merged: 0, changes: 0, failed: 0 }));
  data.forEach((d, i) => {
    cum[i]!.merged = d.merged;
    cum[i]!.changes = d.merged + d.changes;
    cum[i]!.failed = d.merged + d.changes + d.failed;
  });

  const pathFor = (
    key: "merged" | "changes" | "failed",
    prevKey?: "merged" | "changes",
  ) => {
    const top = data
      .map((_, i) => `${pad.l + i * stepX},${pad.t + yScale(cum[i]![key])}`)
      .join(" L");
    const bot = data
      .map((_, i) => {
        const prev = prevKey ? cum[i]![prevKey] : 0;
        return `${pad.l + (data.length - 1 - i) * stepX},${pad.t + yScale(prev)}`;
      })
      .join(" L");
    return `M${top} L${bot} Z`;
  };

  const totals = data.reduce((a, d) => a + d.merged + d.changes + d.failed, 0);
  const totalMerged = data.reduce((a, d) => a + d.merged, 0);
  const tickVals = [0, 0.5, 1].map((t) => Math.round(t * maxTotal));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[26px] font-bold leading-none tracking-tight num-tabular text-chalk-100">
            {totals.toLocaleString()}
            <span className="ml-1.5 text-[13px] font-semibold text-violet-soft">
              runs
            </span>
          </div>
          <div className="mt-1.5 text-[12px] text-chalk-300">
            {data.length} days,{" "}
            {totals > 0 ? Math.round((totalMerged / totals) * 100) : 0}% merged
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11.5px]">
          <Legend swatch={CSS.emerald} label="Merged" />
          <Legend swatch={CSS.amber} label="Changes requested" />
          <Legend swatch={CSS.rose} label="Failed" />
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState text="No runs yet. Every completed run lands here - queue one from Mission control to get started." />
      ) : (
        <div className="w-full overflow-visible">
          <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full">
            <defs>
              {Object.entries(colors).map(([k, c]) => (
                <linearGradient
                  key={k}
                  id={`ra-${k}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={c} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.05" />
                </linearGradient>
              ))}
            </defs>
            {tickVals.map((v, i) => {
              const y = pad.t + yScale(v);
              return (
                <g key={i}>
                  <line
                    x1={pad.l}
                    x2={w - pad.r}
                    y1={y}
                    y2={y}
                    stroke={CSS.line}
                  />
                  <text
                    x={pad.l - 8}
                    y={y + 3}
                    fontSize="10"
                    textAnchor="end"
                    fill={CSS.axis}
                    fontFamily="Geist Mono"
                  >
                    {v}
                  </text>
                </g>
              );
            })}
            <path
              d={pathFor("failed", "changes")}
              fill="url(#ra-failed)"
              stroke={colors.failed}
              strokeOpacity="0.7"
              strokeWidth="1"
            />
            <path
              d={pathFor("changes", "merged")}
              fill="url(#ra-changes)"
              stroke={colors.changes}
              strokeOpacity="0.7"
              strokeWidth="1"
            />
            <path
              d={pathFor("merged")}
              fill="url(#ra-merged)"
              stroke={colors.merged}
              strokeOpacity="0.9"
              strokeWidth="1.4"
            />
            {data.map((d, i) => {
              if (i % 2 !== 0 && i !== data.length - 1) return null;
              return (
                <text
                  key={i}
                  x={pad.l + i * stepX}
                  y={h - 6}
                  fontSize="10"
                  textAnchor="middle"
                  fill={CSS.axis}
                  fontFamily="Geist Mono"
                >
                  {d.label}
                </text>
              );
            })}
            <line
              x1={pad.l + (data.length - 1) * stepX}
              x2={pad.l + (data.length - 1) * stepX}
              y1={pad.t}
              y2={pad.t + innerH}
              stroke={CSS.violet}
              strokeOpacity="0.4"
              strokeDasharray="3 3"
            />
            <text
              x={pad.l + (data.length - 1) * stepX}
              y={pad.t - 5}
              fontSize="10"
              textAnchor="end"
              fill={CSS.violet}
              fontFamily="Geist Mono"
              style={{ letterSpacing: "0.12em" }}
            >
              today
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-chalk-300">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ background: swatch }}
      />{" "}
      {label}
    </span>
  );
}

// ── Daily spend cap control ───────────────────────────────────────────────

const CAP_ACTIONS: BudgetSettings["capAction"][] = [
  "stop",
  "downgrade-model",
  "reduce-effort",
];

function BudgetControl() {
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [today, setToday] = useState(0);
  const [capInput, setCapInput] = useState("");
  const [action, setAction] = useState<BudgetSettings["capAction"]>("stop");
  const [fallback, setFallback] = useState("");
  const [turnsRun, setTurnsRun] = useState("");
  const [timeRun, setTimeRun] = useState("");
  const [turnsDay, setTurnsDay] = useState("");
  const [timeDay, setTimeDay] = useState("");
  const [onLimit, setOnLimit] = useState<"stop" | "pause">("stop");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getBudget()
      .then((r) => {
        setBudget(r.budget);
        setToday(r.todaySpendUsd);
        setCapInput(
          r.budget.spendCapDailyUsd != null
            ? String(r.budget.spendCapDailyUsd)
            : "",
        );
        setAction(r.budget.capAction);
        setFallback(r.budget.fallbackProfile ?? "");
        const s = (n: number | null | undefined) => (n != null ? String(n) : "");
        setTurnsRun(s(r.budget.maxTurnsPerRun));
        setTimeRun(s(r.budget.maxWallClockMinPerRun));
        setTurnsDay(s(r.budget.maxTurnsPerDay));
        setTimeDay(s(r.budget.maxWallClockMinPerDay));
        setOnLimit(r.budget.onLimit ?? "stop");
      })
      .catch(() => {});
  }, []);

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  async function save(patch: Partial<BudgetSettings>) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.updateBudget(patch);
      setBudget(r.budget);
      setMsg("Saved");
      setTimeout(() => setMsg(null), 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const cap = budget?.spendCapDailyUsd ?? null;
  const pct =
    cap && cap > 0 ? Math.min(100, Math.round((today / cap) * 100)) : 0;

  const fieldCls =
    "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50";

  return (
    <Section title="Spend cap and ceilings">
      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <label className="flex items-center gap-2 text-[12.5px] text-chalk-300">
            <span className="font-semibold text-violet-soft">Daily cap</span>
            <span className="text-chalk-400">$</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              placeholder="off"
              aria-label="Daily spend cap in dollars"
              className={cn(fieldCls, "w-20")}
            />
            <span className="text-chalk-400">/day</span>
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-chalk-300">
            <span className="font-semibold text-violet-soft">At cap</span>
            <Select
              value={action}
              ariaLabel="At cap action"
              className="min-w-[170px]"
              onChange={(v) => setAction(v as BudgetSettings["capAction"])}
              options={CAP_ACTIONS.map((a) => ({ value: a, label: a }))}
            />
          </label>
          {action === "downgrade-model" ? (
            <label className="flex items-center gap-2 text-[12.5px] text-chalk-300">
              <span className="font-semibold text-violet-soft">Fallback</span>
              <input
                value={fallback}
                onChange={(e) => setFallback(e.target.value)}
                placeholder="profile id"
                aria-label="Fallback profile id"
                className={cn(fieldCls, "w-28")}
              />
            </label>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() =>
              void save({
                spendCapDailyUsd:
                  capInput.trim() === "" ? null : Number(capInput),
                capAction: action,
                fallbackProfile:
                  fallback.trim() === "" ? null : fallback.trim(),
              })
            }
          >
            {saving ? "Saving..." : "Save cap"}
          </Button>
          {msg ? (
            <span className="text-[11.5px] text-chalk-300">{msg}</span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <StatTile
              value={`$${today.toFixed(2)}`}
              label="today"
              tone="violet"
            />
            {cap ? (
              <StatTile
                value={`${pct}%`}
                label="of cap"
                tone={pct >= 90 ? "amber" : "default"}
              />
            ) : null}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[color:var(--line-soft)] pt-4">
          <span className="text-[12.5px] font-semibold text-violet-soft">
            Hard ceilings
          </span>
          {(
            [
              ["turns/run", turnsRun, setTurnsRun],
              ["min/run", timeRun, setTimeRun],
              ["turns/day", turnsDay, setTurnsDay],
              ["min/day", timeDay, setTimeDay],
            ] as const
          ).map(([label, val, set]) => (
            <label
              key={label}
              className="flex items-center gap-2 text-[12.5px] text-chalk-300"
            >
              <input
                type="number"
                min={0}
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="off"
                aria-label={label}
                className={cn(fieldCls, "w-16")}
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-[12.5px] text-chalk-300">
            <span className="font-semibold text-violet-soft">On hit</span>
            <Select
              value={onLimit}
              ariaLabel="On limit hit"
              className="min-w-[110px]"
              onChange={(v) => setOnLimit(v as "stop" | "pause")}
              options={[
                { value: "stop", label: "stop" },
                { value: "pause", label: "pause" },
              ]}
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() =>
              void save({
                maxTurnsPerRun: numOrNull(turnsRun),
                maxWallClockMinPerRun: numOrNull(timeRun),
                maxTurnsPerDay: numOrNull(turnsDay),
                maxWallClockMinPerDay: numOrNull(timeDay),
                onLimit,
              })
            }
          >
            {saving ? "Saving..." : "Save ceilings"}
          </Button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-chalk-300">
          Checked before each agent turn. <b>stop</b> blocks the run;{" "}
          <b>downgrade-model</b> switches to the cheaper fallback Profile;{" "}
          <b>reduce-effort</b> drops to the provider's minimum effort. Ceilings
          bind even when token cost is unmeasured (local CLI providers) - the
          reliable backstop for unattended runs. Leave a field blank for no
          limit.
        </p>
      </div>
    </Section>
  );
}

// ── Token ledger panels ───────────────────────────────────────────────────

function PerModelPanel({ overview }: { overview: MetricsOverview | null }) {
  const rows = overview?.perModel ?? [];
  return (
    <>
      <h3 className="mb-3 text-[13.5px] font-semibold text-violet-soft">
        Per model
      </h3>
      {rows.length === 0 ? (
        <EmptyState text="No model usage in this window yet. Once a run completes, its model calls tally here." />
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] font-semibold text-chalk-300">
              <th className="pb-2">Model</th>
              <th className="pb-2 text-right">Calls</th>
              <th className="pb-2 text-right">Tokens</th>
              <th className="pb-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.model}
                className="border-t border-[color:var(--line-soft)]"
              >
                <td className="mono max-w-[220px] truncate py-1.5 text-chalk-100">
                  {r.model}
                </td>
                <td className="num-tabular py-1.5 text-right text-chalk-300">
                  {r.calls}
                </td>
                <td className="num-tabular py-1.5 text-right text-chalk-300">
                  {fmtTokensShort(r.tokens)}
                </td>
                <td className="num-tabular py-1.5 text-right text-chalk-100">
                  {r.costUsd > 0 ? `$${r.costUsd.toFixed(2)}` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function TokensByRolePanel({ overview }: { overview: MetricsOverview | null }) {
  const rows = overview?.tokensByRole ?? [];
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  return (
    <>
      <h3 className="mb-3 text-[13.5px] font-semibold text-violet-soft">
        Tokens by role
      </h3>
      {rows.length === 0 ? (
        <EmptyState text="No tokens recorded yet. They accrue as agents run." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.role}>
              <div className="mb-1 flex items-center justify-between text-[11.5px]">
                <span className="text-chalk-100">{r.role}</span>
                <span className="mono text-chalk-300">
                  {fmtTokensShort(r.tokens)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-coal-500">
                <div
                  className="h-full rounded-full bg-violet-soft/70"
                  style={{ width: `${(r.tokens / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Outcomes donut ────────────────────────────────────────────────────────

function OutcomesDonut({ overview }: { overview: MetricsOverview | null }) {
  const totals = overview?.totals ?? {
    merged: 0,
    changes: 0,
    failed: 0,
    runs: 0,
  };
  const sum = totals.merged + totals.changes + totals.failed;
  const segs: {
    key: string;
    value: number;
    color: string;
    label: string;
    tone: StatTileTone;
  }[] = [
    {
      key: "merged",
      value: totals.merged,
      color: CSS.emerald,
      label: "Merged",
      tone: "emerald",
    },
    {
      key: "changes",
      value: totals.changes,
      color: CSS.amber,
      label: "Changes requested",
      tone: "amber",
    },
    {
      key: "failed",
      value: totals.failed,
      color: CSS.rose,
      label: "Failed",
      tone: "rose",
    },
  ];

  const cx = 100;
  const cy = 100;
  const r = 70;
  const sw = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div>
      <h3 className="mb-3 text-[13.5px] font-semibold text-violet-soft">
        Outcomes
      </h3>
      {sum === 0 ? (
        <EmptyState text="No outcomes recorded for this range. Completed runs split into merged, changes requested, and failed here." />
      ) : (
        <>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg
                viewBox="0 0 200 200"
                width="180"
                height="180"
                className="block"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  stroke={CSS.line}
                  strokeWidth={sw}
                  fill="none"
                />
                {segs.map((s) => {
                  const len = (s.value / sum) * circ;
                  const dash = `${len} ${circ - len}`;
                  const dashOffset = -offset;
                  offset += len;
                  return (
                    <circle
                      key={s.key}
                      cx={cx}
                      cy={cy}
                      r={r}
                      stroke={s.color}
                      strokeWidth={sw}
                      fill="none"
                      strokeDasharray={dash}
                      strokeDashoffset={dashOffset}
                      transform="rotate(-90 100 100)"
                      strokeLinecap="butt"
                    />
                  );
                })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="num-tabular text-[36px] font-bold leading-none tracking-tight text-chalk-100">
                  {Math.round((totals.merged / sum) * 100)}%
                </div>
                <div className="mt-1 text-[11px] font-medium text-violet-soft">
                  merged
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-2.5">
              {segs.map((s) => (
                <div key={s.key} className="text-[12.5px]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-chalk-100">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: s.color }}
                      />{" "}
                      {s.label}
                    </span>
                    <span className="mono num-tabular text-chalk-100">
                      {s.value}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-coal-500">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.value / sum) * 100}%`,
                        background: s.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 border-t border-[color:var(--line-soft)] pt-3">
            <StatTile
              value={sum.toLocaleString()}
              label="total runs"
              tone="violet"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Spend by agent ────────────────────────────────────────────────────────

function SpendByRolePanel({ overview }: { overview: MetricsOverview | null }) {
  const data = overview?.spendByRole ?? [];
  const max = Math.max(...data.map((d) => d.dollars), 0.001);
  const total = data.reduce((a, d) => a + d.dollars, 0);
  const cap = overview?.totals.spendCapDailyUsd ?? null;
  const weeklyCap = cap !== null ? cap * 7 : null;
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="mb-1.5 text-[13.5px] font-semibold text-violet-soft">
            Spend by agent
          </h3>
          <div className="num-tabular text-[26px] font-bold leading-none tracking-tight text-chalk-100">
            ${total.toFixed(2)}
          </div>
        </div>
        {weeklyCap !== null ? (
          <StatTile
            value={`${Math.round((1 - total / weeklyCap) * 100)}%`}
            label={`under $${weeklyCap.toFixed(0)}/wk cap`}
            tone="emerald"
          />
        ) : null}
      </div>
      {data.length === 0 ? (
        <EmptyState text="No agent spend recorded yet. Once metered runs complete, spend per agent shows up here." />
      ) : (
        <div className="space-y-3">
          {data.map((d) => {
            const pct = (d.dollars / max) * 100;
            return (
              <div
                key={d.providerId}
                className="grid grid-cols-[140px_1fr_72px] items-center gap-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-violet-soft/15 text-[12px] font-semibold text-violet-soft ring-1 ring-violet-soft/30">
                    {d.label.charAt(0)}
                  </span>
                  <span className="truncate text-[12.5px] text-chalk-100">
                    {d.label}
                  </span>
                </div>
                <div className="relative h-7 overflow-hidden rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500">
                  <div
                    className="absolute inset-y-0 left-0 rounded-[10px]"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: `${CSS.violet}33`,
                      borderRight: `1.5px solid ${CSS.violet}`,
                    }}
                  />
                  <div className="mono absolute inset-y-0 left-2.5 flex items-center text-[10.5px] text-chalk-300">
                    {d.dollars > 0
                      ? `${Math.round((d.dollars / total) * 100)}% of spend`
                      : "idle"}
                  </div>
                </div>
                <div className="mono num-tabular text-right text-[13px] text-chalk-100">
                  ${d.dollars.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Latency by phase ──────────────────────────────────────────────────────

function LatencyByPhasePanel({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  const data = overview?.phaseLatency ?? [];
  const w = 320;
  const h = 210;
  const pad = { l: 38, r: 8, t: 8, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d.p95), 1);
  const bw = innerW / Math.max(1, data.length);
  const barW = bw * 0.36;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold text-violet-soft">
          Latency by phase
        </h3>
        <span className="text-[11px] text-chalk-300">seconds</span>
      </div>
      {data.length === 0 ? (
        <EmptyState text="Phase latency lands here after a few runs complete." />
      ) : (
        <>
          <div className="mx-auto" style={{ maxWidth: 420 }}>
            <svg
              viewBox={`0 0 ${w} ${h}`}
              className="block h-auto w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {[0, 0.5, 1].map((t, i) => {
                const v = Math.round(max * t);
                const y = pad.t + innerH - t * innerH;
                return (
                  <g key={i}>
                    <line
                      x1={pad.l}
                      x2={w - pad.r}
                      y1={y}
                      y2={y}
                      stroke={CSS.line}
                    />
                    <text
                      x={pad.l - 6}
                      y={y + 3}
                      fontSize="9"
                      textAnchor="end"
                      fill={CSS.axis}
                      fontFamily="Geist Mono"
                    >
                      {v}s
                    </text>
                  </g>
                );
              })}
              {data.map((d, i) => {
                const cx = pad.l + bw * i + bw / 2;
                const p95h = (d.p95 / max) * innerH;
                const p50h = (d.p50 / max) * innerH;
                return (
                  <g key={d.phase}>
                    <rect
                      x={cx - barW / 2}
                      y={pad.t + innerH - p95h}
                      width={barW}
                      height={p95h}
                      fill={CSS.violet}
                      fillOpacity="0.18"
                      stroke={CSS.violet}
                      strokeOpacity="0.35"
                      rx="2"
                    />
                    <rect
                      x={cx - barW / 2 + 1}
                      y={pad.t + innerH - p50h}
                      width={barW - 2}
                      height={p50h}
                      fill={CSS.violet}
                      fillOpacity="0.7"
                      rx="2"
                    />
                    <text
                      x={cx}
                      y={h - 14}
                      fontSize="10"
                      textAnchor="middle"
                      fill={CSS.axis}
                      fontFamily="Geist Mono"
                      style={{ letterSpacing: "0.1em" }}
                    >
                      {d.phase}
                    </text>
                    <text
                      x={cx}
                      y={h - 2}
                      fontSize="9"
                      textAnchor="middle"
                      fill={CSS.axis}
                      fontFamily="Geist Mono"
                    >
                      {d.p50}/{d.p95}s
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-chalk-300">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: CSS.violet, opacity: 0.7 }}
              />{" "}
              p50
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{
                  background: `${CSS.violet}40`,
                  border: `1px solid ${CSS.violet}66`,
                }}
              />{" "}
              p95
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────

function ActivityHeatmapPanel({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  const data = overview?.heatmap ?? [];
  const max = Math.max(...data.flatMap((r) => r.cells), 1);
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="mb-1.5 text-[13.5px] font-semibold text-violet-soft">
            When the crew is busiest
          </h3>
          <div className="text-[12px] text-chalk-300">
            Runs by hour-of-day and weekday
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-chalk-300">
          <span>quiet</span>
          <span className="flex items-center gap-[2px]">
            {[0.06, 0.18, 0.34, 0.5, 0.7, 0.9].map((o, i) => (
              <span
                key={i}
                className="h-3.5 w-3.5 rounded-sm"
                style={{ background: `${CSS.violet}`, opacity: o }}
              />
            ))}
          </span>
          <span>busy</span>
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState text="No activity recorded yet. Runs plot by hour and weekday once they start landing." />
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div
              className="grid"
              style={{
                gridTemplateColumns: "36px repeat(24, 1fr)",
                gap: "3px",
              }}
            >
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span
                  key={h}
                  className="mono text-center text-[9px] text-chalk-400"
                >
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
              {data.map((row) => (
                <Fragment key={row.day}>
                  <span className="mono self-center text-[10px] text-chalk-300">
                    {row.day}
                  </span>
                  {row.cells.map((v, h) => {
                    const op = v === 0 ? 0.04 : 0.1 + (v / max) * 0.7;
                    return (
                      <span
                        key={h}
                        className="aspect-square rounded-sm border border-[color:var(--line-soft)]"
                        style={{
                          background: CSS.violet,
                          opacity: op,
                        }}
                        title={`${row.day} ${String(h).padStart(2, "0")}:00, ${v} runs`}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────

function LeaderboardTable({ overview }: { overview: MetricsOverview | null }) {
  const rows: LeaderboardEntry[] = overview?.leaderboard ?? [];
  const maxRuns = Math.max(...rows.map((r) => r.runs), 1);
  if (rows.length === 0)
    return (
      <div className={CARD}>
        <EmptyState text="No agents have produced runs in this window yet. Queue a run to populate the ranking." />
      </div>
    );
  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-coal-600">
      <table className="w-full">
        <thead>
          <tr className="text-left text-[11px] font-semibold text-chalk-300">
            <th className="px-4 py-3">#</th>
            <th className="px-3 py-3">Agent</th>
            <th className="px-3 py-3">Runs, {overview?.range}</th>
            <th className="px-3 py-3">Success</th>
            <th className="px-3 py-3 text-right">Avg dur</th>
            <th className="px-3 py-3 text-right">p95</th>
            <th className="px-3 py-3 text-right">Cost</th>
            <th className="px-3 py-3 text-right">vs prev</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pctBar = (row.runs / maxRuns) * 100;
            const deltaTone =
              row.delta > 0
                ? "text-emerald-400"
                : row.delta < 0
                  ? "text-rose-300"
                  : "text-chalk-400";
            return (
              <tr
                key={row.providerId}
                className={cn(
                  "transition-colors hover:bg-coal-500/40",
                  i !== 0 && "border-t border-[color:var(--line-soft)]",
                )}
              >
                <td className="mono w-10 px-4 py-3 text-[12px] text-chalk-400">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-violet-soft/15 text-[13px] font-semibold text-violet-soft ring-1 ring-violet-soft/30">
                      {row.label.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] text-chalk-100">
                        {row.label}
                      </div>
                      <div className="mono text-[10.5px] text-chalk-400">
                        {row.vendor ?? "-"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="min-w-[200px] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-coal-500">
                      <div
                        className="h-full rounded-full bg-violet-soft"
                        style={{ width: `${pctBar}%`, opacity: 0.85 }}
                      />
                    </div>
                    <span className="mono num-tabular w-10 text-right text-[12px] text-chalk-100">
                      {row.runs}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {row.successRate !== null ? (
                    <span
                      className={cn(
                        "mono num-tabular text-[12px]",
                        row.successRate >= 0.92
                          ? "text-emerald-400"
                          : row.successRate >= 0.85
                            ? "text-chalk-100"
                            : "text-amber-soft",
                      )}
                    >
                      {Math.round(row.successRate * 100)}%
                    </span>
                  ) : (
                    <span className="text-[12px] text-chalk-400">-</span>
                  )}
                </td>
                <td className="mono num-tabular px-3 py-3 text-right text-[12px] text-chalk-300">
                  {row.avgDurSeconds !== null ? `${row.avgDurSeconds}s` : "-"}
                </td>
                <td className="mono num-tabular px-3 py-3 text-right text-[12px] text-chalk-300">
                  {row.p95Seconds !== null ? `${row.p95Seconds}s` : "-"}
                </td>
                <td className="mono num-tabular px-3 py-3 text-right text-[12px] text-chalk-100">
                  ${row.costUsd.toFixed(2)}
                </td>
                <td
                  className={cn(
                    "mono num-tabular px-3 py-3 text-right text-[12px]",
                    deltaTone,
                  )}
                >
                  {row.delta === 0
                    ? "-"
                    : `${row.delta > 0 ? "+" : "-"}${Math.abs(row.delta)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
