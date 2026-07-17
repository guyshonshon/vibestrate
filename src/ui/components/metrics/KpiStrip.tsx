import { type ReactNode } from "react";
import {
  Activity,
  CircleCheck,
  Clock,
  Coins,
  DollarSign,
} from "lucide-react";
import type { MetricsOverview } from "../../lib/api.js";
import { Sparkline } from "../design/Sparkline.js";
import { cn } from "../design/cn.js";
import { fmtCost, fmtTokensShort } from "../design/format.js";

export function KpiStrip({ overview }: { overview: MetricsOverview | null }) {
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
