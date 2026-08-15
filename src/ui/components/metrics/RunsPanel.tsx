import type { MetricsOverview } from "../../lib/api.js";
import { navigate } from "../../app/App.js";
import { RunsAreaChart } from "./RunsAreaChart.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton, SkeletonBlock, SkeletonChart } from "../design/Skeleton.js";
import { CSS } from "./panelChrome.js";

// Runs area chart (smooth single-hue area + floating tooltip, visx).
export function RunsPanel({ overview }: { overview: MetricsOverview | null }) {
  // Loading and "nothing ran in this window" are different states; only the
  // second earns the empty copy and its New-run CTA.
  if (!overview) {
    return (
      <Skeleton label="Loading runs over time" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <SkeletonBlock h={13} w={110} />
          <SkeletonBlock h={26} w={92} />
          <SkeletonBlock tone="text" h={12} w={76} />
        </div>
        <SkeletonChart variant="area" height={240} />
      </Skeleton>
    );
  }
  const data = overview.daily;
  const merged = data.reduce((a, d) => a + d.merged, 0);
  const changes = data.reduce((a, d) => a + d.changes, 0);
  const failed = data.reduce((a, d) => a + d.failed, 0);
  const totals = merged + changes + failed;
  // The window is empty when nothing ran in it, not when the array is missing:
  // the server emits one bucket per day either way, so `daily.length === 0`
  // never fired and an empty project got 240px of flat-zero area chart.
  const empty = totals === 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {/* Carries its own heading: on the layout board the panel title only
              shows while editing, so a panel that leans on a page section
              header for its name loses it. */}
          <h3 className="mb-1.5 text-[13.5px] font-semibold text-violet-soft">
            Runs over time
          </h3>
          <div className="text-[26px] font-bold leading-none tracking-tight num-tabular text-chalk-100">
            {totals.toLocaleString()}
            <span className="ml-1.5 text-[13px] font-semibold text-violet-soft">
              runs
            </span>
          </div>
          <div className="mt-1.5 text-meta text-chalk-300">
            Last {data.length} days
          </div>
        </div>
        {/* The legend names the chart's colours, so it goes with the chart - and
            it carries the counts, which used to sit in a separate caption that
            joined the window length to a merge rate. That rate was the only
            place the panel could print "0% merged" over a window with nothing
            to divide. */}
        {empty ? null : (
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 text-meta">
            <Legend swatch={CSS.emerald} label="Merged" value={merged} />
            <Legend swatch={CSS.amber} label="Changes requested" value={changes} />
            <Legend swatch={CSS.rose} label="Failed" value={failed} />
          </div>
        )}
      </div>
      {empty ? (
        <EmptyState
          text="No runs in this window. The daily merged, changes-requested and failed split lands here."
          actionLabel="New run"
          onAction={() => navigate({ kind: "compose" })}
        />
      ) : (
        <RunsAreaChart data={data} height={240} />
      )}
    </div>
  );
}

function Legend({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-chalk-300">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-[6px]"
        style={{ background: swatch }}
      />
      {label}
      <span className="num-tabular font-semibold text-chalk-100">{value}</span>
    </span>
  );
}
