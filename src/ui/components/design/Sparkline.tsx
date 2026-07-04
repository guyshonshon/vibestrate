import { AreaClosed, LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { scaleLinear } from "@visx/scale";
import { cn } from "./cn.js";

const TONE_HEX: Record<string, string> = {
  violet: "#a78bfa",
  sky: "#7cc5ff",
  emerald: "#4ade80",
  amber: "#fbbf24",
  rose: "#fb7185",
};

export type SparkTone = keyof typeof TONE_HEX;

/**
 * Filled mini-sparkline in the house chart style: a smooth (curveMonotoneX)
 * single-hue line over a soft vertical gradient - the same idiom as the Metrics
 * area chart, shrunk to a KPI tile. Fixed-size, so no responsive wrapper needed.
 */
export function Sparkline({
  values,
  tone = "violet",
  width = 110,
  height = 36,
  className,
}: {
  values: number[];
  tone?: SparkTone;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length === 0) return null;
  const color = TONE_HEX[tone] ?? TONE_HEX.violet!;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = scaleLinear<number>({
    domain: [0, Math.max(1, values.length - 1)],
    range: [0, width],
  });
  const y = scaleLinear<number>({
    domain: [min, max === min ? min + 1 : max],
    range: [height - pad, pad],
  });
  const gradId = `spark-${tone}-${width}-${height}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("block", className)}
    >
      <LinearGradient
        id={gradId}
        from={color}
        to={color}
        fromOpacity={0.35}
        toOpacity={0}
      />
      <AreaClosed<number>
        data={values}
        x={(_d, i) => x(i) ?? 0}
        y={(d) => y(d) ?? 0}
        yScale={y}
        curve={curveMonotoneX}
        fill={`url(#${gradId})`}
      />
      <LinePath<number>
        data={values}
        x={(_d, i) => x(i) ?? 0}
        y={(d) => y(d) ?? 0}
        curve={curveMonotoneX}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Bar variant used by the Agents page KPI strip. */
export function MiniBars({
  values,
  tone = "violet",
  height = 26,
}: {
  values: number[];
  tone?: SparkTone;
  height?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 0.001);
  const cls: Record<SparkTone, string> = {
    violet: "bg-violet-soft",
    sky: "bg-sky-glow",
    emerald: "bg-emerald-400",
    amber: "bg-amber-300",
    rose: "bg-rose-400",
  };
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("w-[6px] rounded-sm", cls[tone])}
          style={{
            height: `${(v / max) * (height - 4) + 4}px`,
            opacity: 0.55 + (i / values.length) * 0.45,
          }}
        />
      ))}
    </div>
  );
}
