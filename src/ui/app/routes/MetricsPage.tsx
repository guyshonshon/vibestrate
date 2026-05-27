import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, Save } from "lucide-react";
import {
  api,
  type LeaderboardEntry,
  type MetricsOverview,
  type OverviewRange,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { SectionEyebrow } from "../../components/design/SectionEyebrow.js";
import { Sparkline } from "../../components/design/Sparkline.js";
import { cn } from "../../components/design/cn.js";

const RANGES: OverviewRange[] = ["24h", "7d", "30d", "90d"];

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
    for (const s of overview.spendByAgent) {
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
    a.download = `amaco-metrics-${overview.range}-${overview.generatedAt.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative z-10 mx-auto max-w-[1480px] px-8 pt-6 pb-16 fade-up">
      {/* ── Hero ─ */}
      <section className="mt-2 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[720px]">
          <div className="eyebrow mb-1.5">
            Metrics · how the crew is performing
          </div>
          <h1 className="text-display text-[21px] sm:text-[23px] leading-[1.2]">
            What did your{" "}
            <em className="text-display italic text-violet-soft">agents</em>{" "}
            ship this week?
          </h1>
          <p className="text-fog-300 text-[13px] mt-1.5 max-w-[640px]">
            Runs, outcomes, spend, latency — rolled up across every model and
            flow.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.025] p-[3px]">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "h-7 px-3 rounded-md text-[12px] font-medium",
                  range === r
                    ? "bg-white/[0.08] text-fog-100"
                    : "text-fog-400 hover:text-fog-100",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportCsv}
            iconLeft={<Download className="h-3 w-3" strokeWidth={1.7} />}
          >
            Export
          </Button>
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-1.5 text-[12.5px] text-rose-300">
          {error}
        </div>
      ) : null}

      {/* ── KPI strip ─ */}
      <KpiStrip overview={overview} />

      {/* ── Runs + Outcomes ─ */}
      <section className="mt-7 grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-8 glass p-5">
          <RunsAreaChart overview={overview} />
        </div>
        <div className="col-span-12 xl:col-span-4 glass p-5">
          <OutcomesDonut overview={overview} />
        </div>
      </section>

      {/* ── Spend + Latency ─ */}
      <section className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7 glass p-5">
          <SpendByAgentPanel overview={overview} />
        </div>
        <div className="col-span-12 lg:col-span-5 glass p-5">
          <LatencyByPhasePanel overview={overview} />
        </div>
      </section>

      {/* ── Heatmap ─ */}
      <section className="mt-5">
        <div className="glass p-5">
          <ActivityHeatmapPanel overview={overview} />
        </div>
      </section>

      {/* ── Token ledger: per-model + tokens-by-role ─ */}
      <section className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7 glass p-5">
          <PerModelPanel overview={overview} />
        </div>
        <div className="col-span-12 lg:col-span-5 glass p-5">
          <TokensByRolePanel overview={overview} />
        </div>
      </section>

      {/* ── Leaderboard ─ */}
      <section className="mt-5">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="eyebrow mb-1.5">Agents · ranked by usage</div>
            <h2 className="text-[20px] font-semibold tracking-tight">
              Leaderboard
            </h2>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="text-[12px] text-fog-300 hover:text-fog-100 flex items-center gap-1.5"
          >
            <Save className="h-3 w-3" strokeWidth={1.7} /> Export CSV
          </button>
        </div>
        <LeaderboardTable overview={overview} />
      </section>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────

function KpiStrip({ overview }: { overview: MetricsOverview | null }) {
  const totals = overview?.totals;
  const sparks = overview?.kpiSparks;
  return (
    <section className="mt-7 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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
            : "—"
        }
        sub="merged ÷ completed"
        tone="emerald"
        spark={sparks?.success ?? []}
      />
      <BigKpi
        label="Duration"
        value={
          totals?.avgDurationSeconds ? `${totals.avgDurationSeconds}s` : "—"
        }
        sub={
          totals?.medianDurationSeconds
            ? `avg · median ${totals.medianDurationSeconds}s`
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
    </section>
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
  return (
    <div className="glass p-4 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="eyebrow">{label}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[28px] font-semibold tracking-tight num-tabular">
            {value}
          </div>
          <div className="text-[11.5px] text-fog-400 mt-0.5">{sub}</div>
        </div>
        <div className="opacity-90 mb-1">
          <Sparkline values={spark} tone={tone} width={110} height={36} />
        </div>
      </div>
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

  const colors = { merged: "#4ade80", changes: "#fbbf24", failed: "#fb7185" };
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
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">
            Runs · {data.length} days ·{" "}
            {totals > 0 ? Math.round((totalMerged / totals) * 100) : 0}% merged
          </div>
          <h3 className="text-[18px] font-semibold tracking-tight num-tabular">
            {totals.toLocaleString()} runs
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11.5px] shrink-0">
          <Legend swatch="#4ade80" label="Merged" />
          <Legend swatch="#fbbf24" label="Changes requested" />
          <Legend swatch="#fb7185" label="Failed" />
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState text="No runs yet — every completed run lands here." />
      ) : (
        <div className="w-full overflow-visible">
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto block">
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
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <text
                    x={pad.l - 8}
                    y={y + 3}
                    fontSize="10"
                    textAnchor="end"
                    fill="#6a7186"
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
                  fill="#6a7186"
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
              stroke="rgba(167,139,250,0.4)"
              strokeDasharray="3 3"
            />
            <text
              x={pad.l + (data.length - 1) * stepX}
              y={pad.t - 5}
              fontSize="10"
              textAnchor="end"
              fill="#a78bfa"
              fontFamily="Geist Mono"
              style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              TODAY
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fog-300">
      <span
        className="w-2.5 h-2.5 rounded-sm"
        style={{ background: swatch }}
      />{" "}
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] py-10 text-center text-[12.5px] text-fog-400">
      {text}
    </div>
  );
}

// ── Token ledger panels ───────────────────────────────────────────────────

function PerModelPanel({ overview }: { overview: MetricsOverview | null }) {
  const rows = overview?.perModel ?? [];
  return (
    <>
      <div className="eyebrow mb-3">Per model · calls · tokens · cost</div>
      {rows.length === 0 ? (
        <EmptyState text="No model usage in this window yet." />
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-fog-500">
              <th className="pb-2 font-normal">Model</th>
              <th className="pb-2 font-normal text-right">Calls</th>
              <th className="pb-2 font-normal text-right">Tokens</th>
              <th className="pb-2 font-normal text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className="border-t border-white/[0.06]">
                <td className="mono max-w-[220px] truncate py-1.5 text-fog-200">{r.model}</td>
                <td className="num-tabular py-1.5 text-right text-fog-300">{r.calls}</td>
                <td className="num-tabular py-1.5 text-right text-fog-300">{fmtTokensShort(r.tokens)}</td>
                <td className="num-tabular py-1.5 text-right text-fog-300">
                  {r.costUsd > 0 ? `$${r.costUsd.toFixed(2)}` : "—"}
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
      <div className="eyebrow mb-3">Tokens by role</div>
      {rows.length === 0 ? (
        <EmptyState text="No tokens recorded yet." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.role}>
              <div className="mb-0.5 flex items-center justify-between text-[11.5px]">
                <span className="text-fog-300">{r.role}</span>
                <span className="mono text-fog-400">{fmtTokensShort(r.tokens)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-white/[0.05]">
                <div
                  className="h-full rounded bg-violet-soft/60"
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
  const segs: { key: string; value: number; color: string; label: string }[] =
    [
      { key: "merged", value: totals.merged, color: "#4ade80", label: "Merged" },
      {
        key: "changes",
        value: totals.changes,
        color: "#fbbf24",
        label: "Changes requested",
      },
      { key: "failed", value: totals.failed, color: "#fb7185", label: "Failed" },
    ];

  const cx = 100;
  const cy = 100;
  const r = 70;
  const sw = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div>
      <SectionEyebrow className="mb-3">
        <span>Outcomes</span>
      </SectionEyebrow>
      {sum === 0 ? (
        <EmptyState text="No outcomes recorded for this range." />
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <svg viewBox="0 0 200 200" width="180" height="180" className="block">
              <circle
                cx={cx}
                cy={cy}
                r={r}
                stroke="rgba(255,255,255,0.06)"
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
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-display text-[36px] leading-none num-tabular">
                {Math.round((totals.merged / sum) * 100)}%
              </div>
              <div className="mono text-[9.5px] uppercase tracking-[0.16em] text-fog-500 mt-1">
                merged
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-2.5">
            {segs.map((s) => (
              <div key={s.key} className="text-[12.5px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2 text-fog-200">
                    <span
                      className="w-2 h-2 rounded-sm"
                      style={{ background: s.color }}
                    />{" "}
                    {s.label}
                  </span>
                  <span className="mono text-fog-100 num-tabular">{s.value}</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
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
      )}
      <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11.5px] text-fog-400 flex items-center justify-between">
        <span>Total runs</span>
        <span className="mono text-fog-100 num-tabular">
          {sum.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ── Spend by agent ────────────────────────────────────────────────────────

function SpendByAgentPanel({ overview }: { overview: MetricsOverview | null }) {
  const data = overview?.spendByAgent ?? [];
  const max = Math.max(...data.map((d) => d.dollars), 0.001);
  const total = data.reduce((a, d) => a + d.dollars, 0);
  const cap = overview?.totals.spendCapDailyUsd ?? null;
  const weeklyCap = cap !== null ? cap * 7 : null;
  return (
    <div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="eyebrow mb-1.5">Spend by agent</div>
          <h3 className="text-[18px] font-semibold tracking-tight num-tabular">
            ${total.toFixed(2)}
          </h3>
        </div>
        {weeklyCap !== null ? (
          <span className="text-[11.5px] text-fog-400">
            Cap ${weeklyCap.toFixed(0)} / wk ·{" "}
            <span className="text-emerald-300/90">
              {Math.round((1 - total / weeklyCap) * 100)}% under
            </span>
          </span>
        ) : null}
      </div>
      {data.length === 0 ? (
        <EmptyState text="No agent spend recorded yet — once metrics land, they show up here." />
      ) : (
        <div className="space-y-3.5">
          {data.map((d) => {
            const pct = (d.dollars / max) * 100;
            const color = "#a78bfa";
            return (
              <div
                key={d.providerId}
                className="grid grid-cols-[140px_1fr_72px] items-center gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-md bg-violet-soft/15 ring-1 ring-violet-soft/30 flex items-center justify-center text-violet-soft mono text-[12px]">
                    {d.label.charAt(0)}
                  </span>
                  <span className="text-[12.5px] text-fog-200 truncate">
                    {d.label}
                  </span>
                </div>
                <div className="relative h-7 rounded-md bg-white/[0.025] overflow-hidden border border-white/[0.06]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: `linear-gradient(90deg, ${color}66, ${color}22)`,
                      borderRight: `1.5px solid ${color}`,
                    }}
                  />
                  <div className="absolute inset-y-0 left-2 flex items-center text-[10.5px] mono text-fog-300">
                    {d.dollars > 0
                      ? `${Math.round((d.dollars / total) * 100)}% of spend`
                      : "idle"}
                  </div>
                </div>
                <div className="text-right mono text-[13px] text-fog-100 num-tabular">
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
      <SectionEyebrow className="mb-3">
        <span>Latency by phase</span>
        <span className="text-fog-400">seconds</span>
      </SectionEyebrow>
      {data.length === 0 ? (
        <EmptyState text="Phase latency lands here after a few runs complete." />
      ) : (
        <div className="mx-auto" style={{ maxWidth: 420 }}>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-auto block"
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
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <text
                    x={pad.l - 6}
                    y={y + 3}
                    fontSize="9"
                    textAnchor="end"
                    fill="#6a7186"
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
                    fill="rgba(167,139,250,0.18)"
                    stroke="rgba(167,139,250,0.35)"
                    rx="2"
                  />
                  <rect
                    x={cx - barW / 2 + 1}
                    y={pad.t + innerH - p50h}
                    width={barW - 2}
                    height={p50h}
                    fill="rgba(167,139,250,0.7)"
                    rx="2"
                  />
                  <text
                    x={cx}
                    y={h - 14}
                    fontSize="10"
                    textAnchor="middle"
                    fill="#9aa0b3"
                    fontFamily="Geist Mono"
                    style={{
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {d.phase}
                  </text>
                  <text
                    x={cx}
                    y={h - 2}
                    fontSize="9"
                    textAnchor="middle"
                    fill="#6a7186"
                    fontFamily="Geist Mono"
                  >
                    {d.p50}/{d.p95}s
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-fog-400">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: "rgba(167,139,250,0.7)" }}
          />{" "}
          p50
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{
              background: "rgba(167,139,250,0.25)",
              border: "1px solid rgba(167,139,250,0.4)",
            }}
          />{" "}
          p95
        </span>
      </div>
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
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="eyebrow mb-1.5">
            Activity · runs by hour-of-day × weekday
          </div>
          <h3 className="text-[18px] font-semibold tracking-tight">
            When the crew is busiest
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fog-400">
          <span>quiet</span>
          <span className="flex items-center gap-[2px]">
            {[0.06, 0.18, 0.34, 0.5, 0.7, 0.9].map((o, i) => (
              <span
                key={i}
                className="w-3.5 h-3.5 rounded-sm"
                style={{ background: `rgba(167,139,250,${o})` }}
              />
            ))}
          </span>
          <span>busy</span>
        </div>
      </div>
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
                className="mono text-[9px] uppercase tracking-[0.12em] text-fog-500 text-center"
              >
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
            {data.map((row) => (
              <Fragment key={row.day}>
                <span className="mono text-[10px] uppercase tracking-[0.12em] text-fog-500 self-center">
                  {row.day}
                </span>
                {row.cells.map((v, h) => {
                  const op = v === 0 ? 0.04 : 0.1 + (v / max) * 0.7;
                  return (
                    <span
                      key={h}
                      className="aspect-square rounded-sm border border-white/[0.04]"
                      style={{
                        background: `rgba(167,139,250,${op.toFixed(2)})`,
                      }}
                      title={`${row.day} ${String(h).padStart(2, "0")}:00 · ${v} runs`}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────

function LeaderboardTable({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  const rows: LeaderboardEntry[] = overview?.leaderboard ?? [];
  const maxRuns = Math.max(...rows.map((r) => r.runs), 1);
  if (rows.length === 0)
    return (
      <div className="glass">
        <EmptyState text="No agents have produced runs in this window yet." />
      </div>
    );
  return (
    <div className="glass overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-[0.14em] text-fog-500">
            <th className="font-normal px-4 py-2.5">#</th>
            <th className="font-normal px-3 py-2.5">Agent</th>
            <th className="font-normal px-3 py-2.5">Runs · {overview?.range}</th>
            <th className="font-normal px-3 py-2.5">Success</th>
            <th className="font-normal px-3 py-2.5 text-right">Avg dur</th>
            <th className="font-normal px-3 py-2.5 text-right">p95</th>
            <th className="font-normal px-3 py-2.5 text-right">Cost</th>
            <th className="font-normal px-3 py-2.5 text-right">Δ vs prev</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pctBar = (row.runs / maxRuns) * 100;
            const deltaTone =
              row.delta > 0
                ? "text-emerald-300/90"
                : row.delta < 0
                  ? "text-rose-300/90"
                  : "text-fog-500";
            return (
              <tr
                key={row.providerId}
                className={cn(
                  "hover:bg-white/[0.02] transition-colors",
                  i !== 0 && "border-t border-white/[0.05]",
                )}
              >
                <td className="px-4 py-3 mono text-[12px] text-fog-500 w-10">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-md bg-violet-soft/15 ring-1 ring-violet-soft/30 flex items-center justify-center text-violet-soft mono text-[13px]">
                      {row.label.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-fog-100 truncate">
                        {row.label}
                      </div>
                      <div className="text-[10.5px] text-fog-500 mono">
                        {row.vendor ?? "—"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 min-w-[200px]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-soft"
                        style={{ width: `${pctBar}%`, opacity: 0.85 }}
                      />
                    </div>
                    <span className="mono text-[12px] text-fog-100 num-tabular w-10 text-right">
                      {row.runs}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {row.successRate !== null ? (
                    <span
                      className={cn(
                        "mono text-[12px] num-tabular",
                        row.successRate >= 0.92
                          ? "text-emerald-300/90"
                          : row.successRate >= 0.85
                            ? "text-fog-100"
                            : "text-amber-300",
                      )}
                    >
                      {Math.round(row.successRate * 100)}%
                    </span>
                  ) : (
                    <span className="text-fog-500 text-[12px]">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right mono text-[12px] text-fog-200 num-tabular">
                  {row.avgDurSeconds !== null ? `${row.avgDurSeconds}s` : "—"}
                </td>
                <td className="px-3 py-3 text-right mono text-[12px] text-fog-200 num-tabular">
                  {row.p95Seconds !== null ? `${row.p95Seconds}s` : "—"}
                </td>
                <td className="px-3 py-3 text-right mono text-[12px] text-fog-100 num-tabular">
                  ${row.costUsd.toFixed(2)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right mono text-[12px] num-tabular",
                    deltaTone,
                  )}
                >
                  {row.delta === 0
                    ? "—"
                    : `${row.delta > 0 ? "↑" : "↓"} ${Math.abs(row.delta)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

