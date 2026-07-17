import type { MetricsOverview } from "../../lib/api.js";
import { RunsAreaChart } from "./RunsAreaChart.js";
import { EmptyState } from "./EmptyState.js";
import { CSS } from "./panelChrome.js";

// Runs area chart (smooth single-hue area + floating tooltip, visx).
export function RunsPanel({ overview }: { overview: MetricsOverview | null }) {
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
