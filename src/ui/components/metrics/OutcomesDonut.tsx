import type { MetricsOverview } from "../../lib/api.js";
import { DonutChart } from "./DonutChart.js";
import { StatTile, type StatTileTone } from "../design/StatTile.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton, SkeletonBlock, SkeletonChart } from "../design/Skeleton.js";
import { CSS } from "./panelChrome.js";

export function OutcomesDonut({ overview }: { overview: MetricsOverview | null }) {
  // Loading is not "no verdicts": the empty sentence used to fire on first paint.
  if (!overview) {
    return (
      <Skeleton label="Loading outcomes">
        <SkeletonBlock className="mb-3" h={13} w={88} />
        <div className="flex items-center gap-5">
          <SkeletonChart variant="donut" height={168} className="shrink-0" />
          <div className="flex flex-1 flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1">
                <SkeletonBlock tone="text" h={12} w={`${[62, 78, 48][i]}%`} />
                <SkeletonBlock h={4} w="100%" radius={999} />
              </div>
            ))}
          </div>
        </div>
      </Skeleton>
    );
  }
  const totals = overview.totals;
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
        <EmptyState text="No verdicts in this window. Merged, changes requested and failed split here once runs finish." />
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
              <div className="mt-1 text-meta font-medium text-violet-soft">
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
