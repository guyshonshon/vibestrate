import { useMemo, useCallback } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { AreaClosed, LinePath, Line, Bar } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { scaleLinear } from "@visx/scale";
import { GridRows } from "@visx/grid";
import {
  useTooltip,
  TooltipWithBounds,
  defaultStyles as tooltipDefaults,
} from "@visx/tooltip";
import { localPoint } from "@visx/event";
import type { DailyOutcomeBucket } from "../../lib/api.js";

// Colours read from theme tokens so they flip under :root.light. The area is
// single-hue violet (the total is the point); the outcome split lives in the
// tooltip, coloured categorically.
const C = {
  violet: "var(--color-violet-soft, #a78bfa)",
  emerald: "var(--color-emerald, #34d399)",
  amber: "var(--color-amber-soft, #fb923c)",
  rose: "var(--color-fail, #fb7185)",
  axis: "var(--color-chalk-400, #8e8e96)",
  grid: "var(--line-soft, rgba(255,255,255,0.06))",
};

type Datum = DailyOutcomeBucket & { total: number };

const MARGIN = { top: 14, right: 16, bottom: 26, left: 34 };

function Chart({
  data,
  width,
  height,
}: {
  data: Datum[];
  width: number;
  height: number;
}) {
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const maxY = Math.max(1, ...data.map((d) => d.total));
  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(1, data.length - 1)],
        range: [0, innerW],
      }),
    [data.length, innerW],
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxY],
        range: [innerH, 0],
        nice: true,
      }),
    [maxY, innerH],
  );

  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
  } = useTooltip<Datum>();

  const handleMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const point = localPoint(e);
      if (!point) return;
      const x = point.x - MARGIN.left;
      const idx = Math.max(
        0,
        Math.min(data.length - 1, Math.round(xScale.invert(x))),
      );
      const d = data[idx];
      if (!d) return;
      showTooltip({
        tooltipData: d,
        tooltipLeft: MARGIN.left + xScale(idx),
        tooltipTop: MARGIN.top + yScale(d.total),
      });
    },
    [data, xScale, yScale, showTooltip],
  );

  const ticks = yScale.ticks(3);

  return (
    <>
      <svg width={width} height={height}>
        <LinearGradient
          id="runs-area-fill"
          from={C.violet}
          to={C.violet}
          fromOpacity={0.32}
          toOpacity={0.02}
        />
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            height={innerH}
            stroke={C.grid}
            strokeWidth={1}
            tickValues={ticks}
          />
          <AreaClosed<Datum>
            data={data}
            x={(_d, i) => xScale(i) ?? 0}
            y={(d) => yScale(d.total) ?? 0}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#runs-area-fill)"
          />
          <LinePath<Datum>
            data={data}
            x={(_d, i) => xScale(i) ?? 0}
            y={(d) => yScale(d.total) ?? 0}
            curve={curveMonotoneX}
            stroke={C.violet}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* y tick labels */}
          {ticks.map((t) => (
            <text
              key={t}
              x={-8}
              y={(yScale(t) ?? 0) + 3}
              fontSize={10}
              textAnchor="end"
              fill={C.axis}
              fontFamily="Geist Mono, monospace"
            >
              {t}
            </text>
          ))}
          {/* x labels (every other, plus last) */}
          {data.map((d, i) =>
            i % 2 === 0 || i === data.length - 1 ? (
              <text
                key={d.date}
                x={xScale(i) ?? 0}
                y={innerH + 18}
                fontSize={10}
                textAnchor="middle"
                fill={C.axis}
                fontFamily="Geist Mono, monospace"
              >
                {d.label}
              </text>
            ) : null,
          )}
          {/* hover guide + marker */}
          {tooltipData ? (
            <>
              <Line
                from={{ x: tooltipLeft - MARGIN.left, y: 0 }}
                to={{ x: tooltipLeft - MARGIN.left, y: innerH }}
                stroke={C.violet}
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                pointerEvents="none"
              />
              <circle
                cx={tooltipLeft - MARGIN.left}
                cy={tooltipTop - MARGIN.top}
                r={4.5}
                fill={C.violet}
                stroke="var(--card, #17171c)"
                strokeWidth={2}
                pointerEvents="none"
              />
            </>
          ) : null}
          {/* transparent capture layer */}
          <Bar
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={hideTooltip}
            onTouchMove={handleMove}
            onTouchStart={handleMove}
          />
        </Group>
      </svg>
      {tooltipData ? (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{
            ...tooltipDefaults,
            background: "var(--card, #17171c)",
            border: "1px solid var(--line, rgba(255,255,255,0.1))",
            borderRadius: 12,
            padding: "8px 10px",
            color: "var(--color-chalk-100, #ececf0)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div className="mb-1.5 text-[11px] font-semibold text-chalk-300">
            {tooltipData.label}
          </div>
          <div className="num-tabular mb-2 text-[16px] font-bold leading-none text-chalk-100">
            {tooltipData.total} {tooltipData.total === 1 ? "run" : "runs"}
          </div>
          <div className="flex flex-col gap-1">
            <TipRow color={C.emerald} label="Merged" value={tooltipData.merged} />
            <TipRow color={C.amber} label="Changes" value={tooltipData.changes} />
            <TipRow color={C.rose} label="Failed" value={tooltipData.failed} />
          </div>
        </TooltipWithBounds>
      ) : null}
    </>
  );
}

function TipRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-chalk-300">{label}</span>
      <span className="num-tabular ml-auto font-semibold text-chalk-100">
        {value}
      </span>
    </div>
  );
}

/** Smooth single-hue area of total runs/day with a floating outcome tooltip. */
export function RunsAreaChart({
  data,
  height = 240,
}: {
  data: DailyOutcomeBucket[];
  height?: number;
}) {
  const withTotals: Datum[] = useMemo(
    () => data.map((d) => ({ ...d, total: d.merged + d.changes + d.failed })),
    [data],
  );
  return (
    <div className="relative w-full" style={{ height }}>
      <ParentSize>
        {({ width }) =>
          width > 0 ? (
            <Chart data={withTotals} width={width} height={height} />
          ) : null
        }
      </ParentSize>
    </div>
  );
}
