import { type ReactNode } from "react";
import {
  Activity,
  CircleCheck,
  Clock,
  Coins,
  DollarSign,
} from "lucide-react";
import type { MetricsOverview } from "../../lib/api.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";
import { Sparkline } from "../design/Sparkline.js";
import { cn } from "../design/cn.js";
import { fmtCost, fmtTokensShort } from "../design/format.js";

/** The spend cap editor further down this page, which the uncapped Spend tile
 *  offers as its action instead of only reporting the absence. */
export const SPEND_CAP_ANCHOR = "spend-cap";

// A tile's sub-line carries a SECOND fact, never a restatement of the value
// above it. "vs previous window" under a bare count and "merged / completed"
// under a percentage described what the reader could already see, so they are
// gone rather than reworded.
export function KpiStrip({ overview }: { overview: MetricsOverview | null }) {
  // A null overview is an in-flight fetch, not a quiet window: without this the
  // strip painted five real tiles reading 0 and $0.00 before any data existed.
  if (!overview) return <KpiStripSkeleton />;
  const totals = overview.totals;
  const sparks = overview.kpiSparks;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <BigKpi
        label="Runs"
        icon={<Activity className="h-3.5 w-3.5" strokeWidth={2} />}
        value={(totals?.runs ?? 0).toLocaleString()}
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
        tone="emerald"
        spark={sparks?.success ?? []}
      />
      <BigKpi
        label="Duration"
        icon={<Clock className="h-3.5 w-3.5" strokeWidth={2} />}
        value={
          totals?.avgDurationSeconds ? `${totals.avgDurationSeconds}s` : "-"
        }
        // The median earns its line because it disagrees with the average
        // whenever a few long runs skew it.
        sub={
          totals?.medianDurationSeconds
            ? `median ${totals.medianDurationSeconds}s`
            : undefined
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
        // A zero delta is not news; this printed "+0 vs prev" on every quiet
        // window.
        sub={
          totals && totals.tokensDelta !== 0
            ? `${totals.tokensDelta > 0 ? "+" : ""}${fmtTokensShort(totals.tokensDelta)} vs prev`
            : undefined
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
            : undefined
        }
        // Reporting "no spend cap configured" left the reader holding a problem
        // with nowhere to put it. The editor is on this page, so point at it.
        action={
          totals && !totals.spendCapDailyUsd
            ? { label: "Set a cap", onClick: scrollToSpendCap }
            : undefined
        }
        tone="amber"
        spark={sparks?.spend ?? []}
      />
    </div>
  );
}

/** Five tiles at BigKpi's geometry: icon chip + label, then value and spark. */
function KpiStripSkeleton() {
  return (
    <Skeleton
      label="Loading metrics"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="flex items-center gap-2">
            <SkeletonBlock w={24} h={24} radius={8} />
            <SkeletonBlock tone="text" h={11} w={64} />
          </div>
          <div className="mt-2.5 flex min-h-[54px] items-end justify-between gap-3">
            <SkeletonBlock h={28} w={72} />
            <SkeletonBlock w={104} h={38} />
          </div>
        </div>
      ))}
    </Skeleton>
  );
}

function scrollToSpendCap() {
  const el = document.getElementById(SPEND_CAP_ANCHOR);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
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
  action,
  spark,
  tone,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  /** A second fact. Omit rather than describing the value above it. */
  sub?: string;
  /** Offered in place of a sub-line when the tile reports a gap the reader can
   *  close from this page. */
  action?: { label: string; onClick: () => void };
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
        <span className="text-meta font-semibold text-chalk-200">
          {label}
        </span>
      </div>
      {/* The sub-line is optional now, so the column keeps its height and the
       * five tiles stay aligned instead of stepping wherever one has no second
       * fact to report. */}
      <div className="mt-2.5 flex min-h-[54px] items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "font-display num-tabular text-[30px] font-bold leading-none tracking-tight",
              t.value,
            )}
          >
            {value}
          </div>
          {sub ? (
            <div className="mt-1.5 text-meta text-chalk-300">{sub}</div>
          ) : null}
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                "mt-1.5 rounded-[7px] text-meta font-semibold underline decoration-dotted underline-offset-4 transition hover:opacity-80",
                t.icon,
              )}
            >
              {action.label}
            </button>
          ) : null}
        </div>
        {spark.length > 0 ? (
          <Sparkline values={spark} tone={tone} width={104} height={38} />
        ) : null}
      </div>
    </div>
  );
}
