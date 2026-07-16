import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  CircleCheck,
  Clock,
  Coins,
  DollarSign,
  Download,
  Pencil,
  Save,
} from "lucide-react";
import {
  api,
  type BudgetSettings,
  type HeatmapCell,
  type LeaderboardEntry,
  type MetricsOverview,
  type OverviewRange,
} from "../../lib/api.js";
import { Button } from "../../components/design/Button.js";
import { Select } from "../../components/design/Select.js";
import { Sparkline } from "../../components/design/Sparkline.js";
import { RunsAreaChart } from "../../components/metrics/RunsAreaChart.js";
import { DonutChart } from "../../components/metrics/DonutChart.js";
import { LatencyDumbbell } from "../../components/metrics/LatencyDumbbell.js";
import { StatTile, type StatTileTone } from "../../components/design/StatTile.js";
import {
  PageShell,
  PageHeader,
  Section,
} from "../../components/layout/PageShell.js";
import { ErrorView } from "../../lib/error-view.js";
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

// Card shell recipe (primitives-contract §5): coal-600 surface, hairline border,
// plus a restrained top-lit inset highlight for LOUD/Raycast surface layering
// (a single 1px highlight, never a decorative gradient background).
const CARD =
  "rounded-[20px] border border-[color:var(--line)] bg-coal-600 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export function MetricsPage() {
  const [range, setRange] = useState<OverviewRange>("7d");
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.getMetricsOverview(range);
      setOverview(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [range]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [load]);

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
        <ErrorView className="mb-4" compact err={error} onRetry={() => void load()} />
      ) : null}

      <KpiStrip overview={overview} />

      <BudgetControl />

      <Section title="Runs and outcomes">
        <div className="grid grid-cols-12 gap-4">
          <div className={cn(CARD, "col-span-12 xl:col-span-8")}>
            <RunsPanel overview={overview} />
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
        icon={<Activity className="h-3.5 w-3.5" strokeWidth={2} />}
        value={(totals?.runs ?? 0).toLocaleString()}
        sub="vs previous window"
        tone="violet"
        spark={sparks?.runs ?? []}
      />
      <BigKpi
        label="Success rate"
        icon={<CircleCheck className="h-3.5 w-3.5" strokeWidth={2} />}
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
        icon={<Clock className="h-3.5 w-3.5" strokeWidth={2} />}
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
        icon={<Coins className="h-3.5 w-3.5" strokeWidth={2} />}
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
        icon={<DollarSign className="h-3.5 w-3.5" strokeWidth={2} />}
        value={fmtCost(totals?.costUsd ?? 0)}
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

const KPI_TONE: Record<
  "violet" | "sky" | "amber" | "emerald",
  { value: string; chip: string; icon: string }
> = {
  violet: {
    value: "text-chalk-100",
    chip: "bg-violet-soft/12",
    icon: "text-violet-soft",
  },
  emerald: {
    value: "text-emerald-400",
    chip: "bg-emerald-400/12",
    icon: "text-emerald-400",
  },
  amber: {
    value: "text-amber-soft",
    chip: "bg-amber-soft/12",
    icon: "text-amber-soft",
  },
  sky: {
    value: "text-sky-glow",
    chip: "bg-sky-glow/12",
    icon: "text-sky-glow",
  },
};

// Cost readouts always show the dollar amount, including a zero ("$0.00") -
// unmetered local-CLI runs read consistently with metered ones rather than as a
// special "FREE" word.
function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTokensShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function BigKpi({
  label,
  icon,
  value,
  sub,
  spark,
  tone,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  sub: string;
  spark: number[];
  tone: "violet" | "sky" | "amber" | "emerald";
}) {
  const t = KPI_TONE[tone];
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-[8px]",
            t.chip,
            t.icon,
          )}
        >
          {icon}
        </span>
        <span className="text-[11.5px] font-semibold text-chalk-200">
          {label}
        </span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "font-display num-tabular text-[30px] font-bold leading-none tracking-tight",
              t.value,
            )}
          >
            {value}
          </div>
          <div className="mt-1.5 text-[11px] text-chalk-300">{sub}</div>
        </div>
        {spark.length > 0 ? (
          <Sparkline values={spark} tone={tone} width={104} height={38} />
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

// ── Runs area chart (smooth single-hue area + floating tooltip, visx) ──────

function RunsPanel({ overview }: { overview: MetricsOverview | null }) {
  const data = overview?.daily ?? [];
  const totals = data.reduce((a, d) => a + d.merged + d.changes + d.failed, 0);
  const totalMerged = data.reduce((a, d) => a + d.merged, 0);

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
        <RunsAreaChart data={data} height={240} />
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

const CAP_ACTION_LABEL: Record<BudgetSettings["capAction"], string> = {
  stop: "Stop the run",
  "downgrade-model": "Downgrade model",
  "reduce-effort": "Reduce effort",
};

function BudgetControl() {
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [today, setToday] = useState(0);
  const [editing, setEditing] = useState(false);
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

  const hydrate = (b: BudgetSettings) => {
    setCapInput(b.spendCapDailyUsd != null ? String(b.spendCapDailyUsd) : "");
    setAction(b.capAction);
    setFallback(b.fallbackProfile ?? "");
    const s = (n: number | null | undefined) => (n != null ? String(n) : "");
    setTurnsRun(s(b.maxTurnsPerRun));
    setTimeRun(s(b.maxWallClockMinPerRun));
    setTurnsDay(s(b.maxTurnsPerDay));
    setTimeDay(s(b.maxWallClockMinPerDay));
    setOnLimit(b.onLimit ?? "stop");
  };

  useEffect(() => {
    void api
      .getBudget()
      .then((r) => {
        setBudget(r.budget);
        setToday(r.todaySpendUsd);
        hydrate(r.budget);
      })
      .catch(() => {});
  }, []);

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  async function saveAll() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.updateBudget({
        spendCapDailyUsd: capInput.trim() === "" ? null : Number(capInput),
        capAction: action,
        fallbackProfile: fallback.trim() === "" ? null : fallback.trim(),
        maxTurnsPerRun: numOrNull(turnsRun),
        maxWallClockMinPerRun: numOrNull(timeRun),
        maxTurnsPerDay: numOrNull(turnsDay),
        maxWallClockMinPerDay: numOrNull(timeDay),
        onLimit,
      });
      setBudget(r.budget);
      hydrate(r.budget);
      setEditing(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const startEdit = () => {
    if (budget) hydrate(budget);
    setMsg(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    if (budget) hydrate(budget);
    setMsg(null);
    setEditing(false);
  };

  const cap = budget?.spendCapDailyUsd ?? null;
  const pct =
    cap && cap > 0 ? Math.min(100, Math.round((today / cap) * 100)) : 0;
  const meterTone = pct >= 90 ? CSS.amber : CSS.violet;

  return (
    <Section
      title="Spend cap and ceilings"
      action={
        !editing && budget ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={startEdit}
            iconLeft={<Pencil className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            Edit
          </Button>
        ) : undefined
      }
    >
      <div className={CARD}>
        {editing ? (
          <BudgetForm
            capInput={capInput}
            setCapInput={setCapInput}
            action={action}
            setAction={setAction}
            fallback={fallback}
            setFallback={setFallback}
            turnsRun={turnsRun}
            setTurnsRun={setTurnsRun}
            timeRun={timeRun}
            setTimeRun={setTimeRun}
            turnsDay={turnsDay}
            setTurnsDay={setTurnsDay}
            timeDay={timeDay}
            setTimeDay={setTimeDay}
            onLimit={onLimit}
            setOnLimit={setOnLimit}
            saving={saving}
            msg={msg}
            onSave={() => void saveAll()}
            onCancel={cancelEdit}
          />
        ) : budget ? (
          <BudgetSummary
            budget={budget}
            cap={cap}
            today={today}
            pct={pct}
            meterTone={meterTone}
            onSetCap={startEdit}
          />
        ) : (
          <div className="h-24 animate-none rounded-[12px] bg-coal-500/30" />
        )}
      </div>
    </Section>
  );
}

// Read-only default: a prominent cap meter plus the rest of the policy as quiet
// facts. Editing lives behind the Edit reveal (BudgetForm).
function BudgetSummary({
  budget,
  cap,
  today,
  pct,
  meterTone,
  onSetCap,
}: {
  budget: BudgetSettings;
  cap: number | null;
  today: number;
  pct: number;
  meterTone: string;
  onSetCap: () => void;
}) {
  const facts: { label: string; value: string; muted: boolean }[] = [
    {
      label: "at cap",
      value: cap ? CAP_ACTION_LABEL[budget.capAction] : "-",
      muted: !cap,
    },
    {
      label: "turns/run",
      value: budget.maxTurnsPerRun != null ? String(budget.maxTurnsPerRun) : "off",
      muted: budget.maxTurnsPerRun == null,
    },
    {
      label: "min/run",
      value:
        budget.maxWallClockMinPerRun != null
          ? String(budget.maxWallClockMinPerRun)
          : "off",
      muted: budget.maxWallClockMinPerRun == null,
    },
    {
      label: "turns/day",
      value: budget.maxTurnsPerDay != null ? String(budget.maxTurnsPerDay) : "off",
      muted: budget.maxTurnsPerDay == null,
    },
    {
      label: "min/day",
      value:
        budget.maxWallClockMinPerDay != null
          ? String(budget.maxWallClockMinPerDay)
          : "off",
      muted: budget.maxWallClockMinPerDay == null,
    },
    {
      label: "on hit",
      value: budget.onLimit ?? "stop",
      muted: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {cap ? (
        <div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold text-chalk-200">
                Today&apos;s spend
              </div>
              <div className="mt-1 font-display num-tabular text-[30px] font-bold leading-none tracking-tight text-chalk-100">
                ${today.toFixed(2)}
                <span className="ml-1.5 text-[13px] font-semibold text-chalk-400">
                  / ${cap.toFixed(0)} daily cap
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className="num-tabular font-display text-[22px] font-bold leading-none"
                style={{ color: meterTone }}
              >
                {pct}%
              </div>
              <div className="mt-1 text-[10.5px] font-medium text-violet-soft">
                of cap used
              </div>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-coal-500">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(pct, 1.5)}%`, background: meterTone }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2.5 rounded-[14px] border border-[color:var(--line-soft)] bg-coal-500/40 px-4 py-4">
          <span className="text-[12.5px] text-chalk-300">
            No daily spend cap set. Add one to auto-throttle or halt runs before
            they overspend.
          </span>
          <Button variant="secondary" size="sm" onClick={onSetCap}>
            Set a daily cap
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-[color:var(--line-soft)] pt-4">
        {facts.map((f) => (
          <div
            key={f.label}
            className="flex min-w-[68px] flex-col gap-0.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5"
          >
            <span
              className={cn(
                "num-tabular text-[13px] font-bold leading-none",
                f.muted ? "text-chalk-400" : "text-chalk-100",
              )}
            >
              {f.value}
            </span>
            <span className="text-[10.5px] font-medium text-violet-soft">
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FIELD_CLS =
  "w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 px-2.5 py-1.5 text-[13px] text-chalk-100 outline-none placeholder:text-chalk-400 focus:border-violet-soft/50";

function BudgetForm(props: {
  capInput: string;
  setCapInput: (v: string) => void;
  action: BudgetSettings["capAction"];
  setAction: (v: BudgetSettings["capAction"]) => void;
  fallback: string;
  setFallback: (v: string) => void;
  turnsRun: string;
  setTurnsRun: (v: string) => void;
  timeRun: string;
  setTimeRun: (v: string) => void;
  turnsDay: string;
  setTurnsDay: (v: string) => void;
  timeDay: string;
  setTimeDay: (v: string) => void;
  onLimit: "stop" | "pause";
  setOnLimit: (v: "stop" | "pause") => void;
  saving: boolean;
  msg: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ceilings = [
    ["turns/run", props.turnsRun, props.setTurnsRun],
    ["min/run", props.timeRun, props.setTimeRun],
    ["turns/day", props.turnsDay, props.setTurnsDay],
    ["min/day", props.timeDay, props.setTimeDay],
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2.5 text-[12.5px] font-semibold text-violet-soft">
          Daily cap
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FieldLabel label="Cap ($/day)">
            <div className="flex items-center gap-1.5">
              <span className="text-chalk-400">$</span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={props.capInput}
                onChange={(e) => props.setCapInput(e.target.value)}
                placeholder="off"
                aria-label="Daily spend cap in dollars"
                className={cn(FIELD_CLS, "w-24")}
              />
            </div>
          </FieldLabel>
          <FieldLabel label="At cap">
            <Select
              value={props.action}
              ariaLabel="At cap action"
              className="min-w-[190px]"
              onChange={(v) =>
                props.setAction(v as BudgetSettings["capAction"])
              }
              options={CAP_ACTIONS.map((a) => ({
                value: a,
                label: CAP_ACTION_LABEL[a],
              }))}
            />
          </FieldLabel>
          {props.action === "downgrade-model" ? (
            <FieldLabel label="Fallback profile">
              <input
                value={props.fallback}
                onChange={(e) => props.setFallback(e.target.value)}
                placeholder="profile id"
                aria-label="Fallback profile id"
                className={cn(FIELD_CLS, "w-32")}
              />
            </FieldLabel>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[color:var(--line-soft)] pt-4">
        <div className="mb-2.5 text-[12.5px] font-semibold text-violet-soft">
          Hard ceilings
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {ceilings.map(([label, val, set]) => (
            <FieldLabel key={label} label={label}>
              <input
                type="number"
                min={0}
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="off"
                aria-label={label}
                className={cn(FIELD_CLS, "w-20")}
              />
            </FieldLabel>
          ))}
          <FieldLabel label="On hit">
            <Select
              value={props.onLimit}
              ariaLabel="On limit hit"
              className="min-w-[120px]"
              onChange={(v) => props.setOnLimit(v as "stop" | "pause")}
              options={[
                { value: "stop", label: "stop" },
                { value: "pause", label: "pause" },
              ]}
            />
          </FieldLabel>
        </div>
      </div>

      <p className="text-[11.5px] leading-relaxed text-chalk-300">
        Checked before each agent turn. <b>Stop the run</b> blocks it;{" "}
        <b>Downgrade model</b> switches to the cheaper fallback Profile;{" "}
        <b>Reduce effort</b> drops to the provider&apos;s minimum effort.
        Ceilings bind even when token cost is unmeasured (local CLI providers) -
        the reliable backstop for unattended runs. Leave a field blank for no
        limit.
      </p>

      <div className="flex items-center gap-2 border-t border-[color:var(--line-soft)] pt-4">
        <Button
          variant="primary"
          size="sm"
          disabled={props.saving}
          onClick={props.onSave}
        >
          {props.saving ? "Saving..." : "Save changes"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          Cancel
        </Button>
        {props.msg ? (
          <span className="text-[11.5px] text-rose-300">{props.msg}</span>
        ) : null}
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-medium text-chalk-400">{label}</span>
      {children}
    </label>
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
                  {fmtCost(r.costUsd)}
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
            <DonutChart
              size={168}
              thickness={20}
              slices={segs.map((s) => ({
                key: s.key,
                value: s.value,
                color: s.color,
              }))}
            >
              <div className="num-tabular font-display text-[34px] font-bold leading-none tracking-tight text-chalk-100">
                {Math.round((totals.merged / sum) * 100)}%
              </div>
              <div className="mt-1 text-[11px] font-medium text-violet-soft">
                merged
              </div>
            </DonutChart>
            <div className="flex-1 space-y-2.5">
              {segs.map((s) => (
                <div key={s.key} className="text-[12.5px]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-chalk-100">
                      <span
                        className="h-2 w-2 rounded-full"
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
            {fmtCost(total)}
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
                  {fmtCost(d.dollars)}
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
          <LatencyDumbbell data={data} />
          <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-chalk-300">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: CSS.violet }}
              />{" "}
              p50
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: "var(--card)",
                  border: `1.5px solid ${CSS.violet}`,
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

type HeatHover = {
  day: string;
  hour: number;
  cell: HeatmapCell;
  x: number;
  y: number;
};

// Crash-safety at the render boundary: a hover must never take down the page.
// A dashboard server that predates the per-provider heatmap serves bare numeric
// cells - keep the count (so the colours stay right) and show an empty
// breakdown until `vibe ui` is restarted on the new build.
function normalizeCell(c: HeatmapCell | number): HeatmapCell {
  return c !== null && typeof c === "object"
    ? { count: c.count ?? 0, providers: c.providers ?? [] }
    : { count: typeof c === "number" ? c : 0, providers: [] };
}

function ActivityHeatmapPanel({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  const data = (overview?.heatmap ?? []).map((r) => ({
    day: r.day,
    cells: (r.cells as (HeatmapCell | number)[]).map(normalizeCell),
  }));
  const max = Math.max(1, ...data.flatMap((r) => r.cells.map((c) => c.count)));
  const [hover, setHover] = useState<HeatHover | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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
        <div className="relative" ref={ref}>
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
                    {row.cells.map((cell, h) => {
                      const op =
                        cell.count === 0 ? 0.04 : 0.1 + (cell.count / max) * 0.7;
                      return (
                        <span
                          key={h}
                          className="aspect-square cursor-default rounded-sm border border-[color:var(--line-soft)] transition-transform hover:scale-110"
                          style={{ background: CSS.violet, opacity: op }}
                          onMouseEnter={(e) => {
                            const cr = ref.current?.getBoundingClientRect();
                            const b = e.currentTarget.getBoundingClientRect();
                            if (!cr) return;
                            setHover({
                              day: row.day,
                              hour: h,
                              cell,
                              x: b.left - cr.left + b.width / 2,
                              y: b.top - cr.top,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          {hover ? (
            <HeatTooltip hover={hover} width={ref.current?.clientWidth ?? 0} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function HeatTooltip({ hover, width }: { hover: HeatHover; width: number }) {
  const { day, hour, cell } = hover;
  const left = Math.max(104, Math.min(hover.x, width - 104));
  const providers = cell.providers;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-[12px] border border-[color:var(--line)] bg-[color:var(--card)] p-2.5 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
      style={{
        left,
        top: hover.y - 8,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-4">
        <span className="text-[11px] font-semibold text-chalk-300">
          {day} {String(hour).padStart(2, "0")}:00
        </span>
        <span className="num-tabular text-[11px] font-bold text-chalk-100">
          {cell.count} {cell.count === 1 ? "run" : "runs"}
        </span>
      </div>
      {providers.length === 0 ? (
        <div className="text-[11px] text-chalk-400">
          {cell.count === 0 ? "No runs this hour." : "No metered provider data."}
        </div>
      ) : (
        <div className="flex flex-col gap-1 border-t border-[color:var(--line-soft)] pt-1.5">
          {providers.map((p) => (
            <div
              key={p.label}
              className="flex items-center justify-between gap-3 text-[11px]"
            >
              <span className="truncate text-chalk-100">{p.label}</span>
              <span className="num-tabular mono shrink-0 text-chalk-300">
                {p.runs} · {fmtCost(p.costUsd)} · {fmtTokensShort(p.tokens)}
              </span>
            </div>
          ))}
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
                  {fmtCost(row.costUsd)}
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
