import type { LeaderboardEntry, MetricsOverview } from "../../lib/api.js";
import { cn } from "../design/cn.js";
import { fmtCost } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";
import { CARD } from "./panelChrome.js";

export function LeaderboardTable({ overview }: { overview: MetricsOverview | null }) {
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
