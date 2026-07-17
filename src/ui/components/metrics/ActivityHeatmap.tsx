import { Fragment, useRef, useState } from "react";
import type { HeatmapCell, MetricsOverview } from "../../lib/api.js";
import { fmtCost, fmtTokensShort } from "../design/format.js";
import { EmptyState } from "./EmptyState.js";
import { CSS } from "./panelChrome.js";

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
