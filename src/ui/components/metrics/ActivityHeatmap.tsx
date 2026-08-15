import { Fragment, useRef, useState } from "react";
import type { HeatmapCell, MetricsOverview } from "../../lib/api.js";
import { fmtCost, fmtTokensShort } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton, SkeletonBlock, SkeletonChart } from "../design/Skeleton.js";
import { CSS } from "./panelChrome.js";
import {
  ChartTooltip,
  TooltipTitle,
  TooltipFigures,
  TooltipDivider,
} from "../design/ChartTooltip.js";

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

export function ActivityHeatmapPanel({
  overview,
}: {
  overview: MetricsOverview | null;
}) {
  const data = (overview?.heatmap ?? []).map((r) => ({
    day: r.day,
    cells: (r.cells as (HeatmapCell | number)[]).map(normalizeCell),
  }));
  const peak = Math.max(0, ...data.flatMap((r) => r.cells.map((c) => c.count)));
  const max = Math.max(1, peak);
  // A weekday row is emitted per day whether or not anything ran, so an idle
  // project rendered a full 7x24 grid of invisible cells. Nothing ran means
  // empty, not "no rows".
  const empty = peak === 0;
  const [hover, setHover] = useState<HeatHover | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // An open fetch is not a quiet week. Declared after the hooks so the branch
  // cannot change the hook order between renders.
  if (!overview) {
    return (
      <Skeleton label="Loading activity">
        <div className="mb-3 flex flex-col gap-1.5">
          <SkeletonBlock h={13} w={168} />
          <SkeletonBlock tone="text" h={11} w={132} />
        </div>
        <SkeletonChart variant="grid" height={196} />
      </Skeleton>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="mb-1.5 text-[13.5px] font-semibold text-violet-soft">
            When the crew is busiest
          </h3>
          <div className="text-meta text-chalk-300">
            Runs by hour-of-day and weekday
          </div>
        </div>
        {/* The scale reads the grid's shading, so it goes with the grid. */}
        {empty ? null : (
          <div className="flex items-center gap-2 text-meta text-chalk-300">
            <span>quiet</span>
            <span className="flex items-center gap-[2px]">
              {[0.06, 0.18, 0.34, 0.5, 0.7, 0.9].map((o, i) => (
                <span
                  key={i}
                  className="h-3.5 w-3.5 rounded-[6px]"
                  style={{ background: `${CSS.violet}`, opacity: o }}
                />
              ))}
            </span>
            <span>busy</span>
          </div>
        )}
      </div>
      {empty ? (
        <EmptyState text="No runs in this window. The hours your crew works appear here as runs land." />
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
                    className="mono text-center text-meta text-chalk-400"
                  >
                    {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                  </span>
                ))}
                {data.map((row) => (
                  <Fragment key={row.day}>
                    <span className="mono self-center text-meta text-chalk-300">
                      {row.day}
                    </span>
                    {row.cells.map((cell, h) => {
                      const op =
                        cell.count === 0 ? 0.04 : 0.1 + (cell.count / max) * 0.7;
                      return (
                        <span
                          key={h}
                          className="aspect-square cursor-default rounded-[6px] border border-[color:var(--line-soft)] transition-transform hover:scale-110"
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
    <ChartTooltip
      style={{ left, top: hover.y - 8, transform: "translate(-50%, -100%)" }}
    >
      <TooltipTitle aside={`${cell.count} ${cell.count === 1 ? "run" : "runs"}`}>
        {day} {String(hour).padStart(2, "0")}:00
      </TooltipTitle>
      {providers.length === 0 ? (
        <div className="mt-1.5 text-meta text-chalk-400">
          {cell.count === 0 ? "No runs this hour." : "No metered provider data."}
        </div>
      ) : (
        <>
          <TooltipDivider />
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <div key={p.label}>
                <span className="block truncate text-[12px] font-semibold text-chalk-100">
                  {p.label}
                </span>
                <TooltipFigures
                  figures={[
                    { value: p.runs, label: "runs" },
                    { value: fmtCost(p.costUsd), label: "spend" },
                    { value: fmtTokensShort(p.tokens), label: "tokens" },
                  ]}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </ChartTooltip>
  );
}
