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
import {
  CHART_TOOLTIP_STYLE,
  TooltipTitle,
  TooltipHeadline,
  TooltipRow,
} from "../design/ChartTooltip.js";

// Colours read from theme tokens so they flip under :root.light. The area is
// single-hue violet (the total is the point); the outcome split lives in the
// tooltip, coloured categorically.
const C = {
  violet: "var(--color-violet-soft, #a78bfa)",
  emerald: "var(--color-emerald, #34d399)",
  amber: "var(--color-amber-soft, #fb923c)",
  rose: "var(--color-fail, #fb7185)",
  axis: "var(--color-chalk-400)",
  grid: "var(--line-soft, rgba(255,255,255,0.06))",
};

// SVG `font-size` is an attribute, so axis labels cannot inherit the app's
// secondary-text tier the way a class can - they get it through CSS instead, or
// they sit at whatever px was typed here and stay there when the tier is raised.
const AXIS_LABEL = { fontSize: "var(--text-meta)" } as const;

type Datum = DailyOutcomeBucket & { total: number };

/** A date at the secondary-text size is ~44px wide, so this is the tightest
 *  pitch that still leaves air between two of them. */
const X_LABEL_PX = 56;

/**
 * How many days to skip between x labels so they never overlap.
 *
 * A fixed every-other stride read fine over 7 days and smeared into an
 * unreadable band over 30 and 90. Callers pair this with a phase of
 * `(count - 1) % stride` so the newest day always lands on a label.
 */
export function xLabelStride(count: number, innerWidth: number): number {
  const slots = Math.max(1, Math.floor(innerWidth / X_LABEL_PX));
  return Math.max(1, Math.ceil(count / slots));
}

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

  // Runs are whole things, so a domain that peaks at 1 must not offer d3's 0.5.
  // Dropping the fractional ticks is preferable to widening the domain, which
  // would flatten a low-volume chart against the floor.
  const ticks = yScale.ticks(3).filter(Number.isInteger);

  const stride = xLabelStride(data.length, innerW);
  // Anchor the stride to the LAST index so today always carries a label.
  // Anchoring to the first instead drops it whenever the stride does not divide
  // the range - at 90 days the axis stopped three days short of the newest one,
  // which is the day people are looking for.
  const stridePhase = (data.length - 1) % stride;

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
              y={(yScale(t) ?? 0) + 4}
              style={AXIS_LABEL}
              textAnchor="end"
              fill={C.axis}
              fontFamily="Geist Mono, monospace"
            >
              {t}
            </text>
          ))}
          {/* x labels */}
          {data.map((d, i) =>
            i % stride === stridePhase ? (
              <text
                key={d.date}
                x={xScale(i) ?? 0}
                y={innerH + 19}
                style={AXIS_LABEL}
                // The end labels sit exactly on the plot edges, where centring
                // pushes half the date past the SVG and the browser clips it -
                // the last day rendered as "Aug 1" instead of "Aug 15". Anchor
                // the edge labels inward; the margins only cover half a label.
                textAnchor={
                  (xScale(i) ?? 0) <= 1
                    ? "start"
                    : (xScale(i) ?? 0) >= innerW - 1
                      ? "end"
                      : "middle"
                }
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
          style={{ ...tooltipDefaults, ...CHART_TOOLTIP_STYLE }}
        >
          <TooltipTitle>{tooltipData.label}</TooltipTitle>
          <TooltipHeadline>
            {tooltipData.total} {tooltipData.total === 1 ? "run" : "runs"}
          </TooltipHeadline>
          <div className="mt-2 flex flex-col gap-1">
            <TooltipRow swatch={C.emerald} label="Merged" value={tooltipData.merged} />
            <TooltipRow swatch={C.amber} label="Changes" value={tooltipData.changes} />
            <TooltipRow swatch={C.rose} label="Failed" value={tooltipData.failed} />
          </div>
        </TooltipWithBounds>
      ) : null}
    </>
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
