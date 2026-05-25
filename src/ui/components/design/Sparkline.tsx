import { cn } from "./cn.js";

const TONE_HEX: Record<string, string> = {
  violet: "#a78bfa",
  sky: "#7cc5ff",
  emerald: "#4ade80",
  amber: "#fbbf24",
  rose: "#fb7185",
};

export type SparkTone = keyof typeof TONE_HEX;

/** Filled mini-sparkline matching the Mission Control + Metrics design. */
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.001, max - min);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = TONE_HEX[tone] ?? TONE_HEX.violet!;
  const gradId = `spark-${tone}-${width}-${height}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("block", className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M0,${height} L${pts.join(" L")} L${width},${height} Z`}
        fill={`url(#${gradId})`}
      />
      <path
        d={`M${pts.join(" L")}`}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
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
