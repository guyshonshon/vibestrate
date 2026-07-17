import type { MetricsOverview } from "../../lib/api.js";
import { StatTile } from "../design/StatTile.js";
import { fmtCost } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";
import { CSS } from "./panelChrome.js";

export function SpendByRolePanel({ overview }: { overview: MetricsOverview | null }) {
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
