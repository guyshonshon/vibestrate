import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import type { PhaseLatencyEntry } from "../../lib/api.js";

const C = {
  violet: "var(--color-violet-soft, #a78bfa)",
  track: "var(--line-soft, rgba(255,255,255,0.08))",
  axis: "var(--color-chalk-400, #8e8e96)",
};

const ROW_H = 34;
const LABEL_W = 88;
const VAL_W = 66;

// A dumbbell per phase: the p50 dot to the p95 dot on one shared track. Reads
// the spread far cleaner than nested p50/p95 bars.
function Chart({ data, width }: { data: PhaseLatencyEntry[]; width: number }) {
  const plotX = LABEL_W;
  const plotW = Math.max(10, width - LABEL_W - VAL_W);
  const max = Math.max(1, ...data.map((d) => d.p95));
  const x = scaleLinear<number>({ domain: [0, max], range: [0, plotW] });
  const height = data.length * ROW_H;

  return (
    <svg width={width} height={height}>
      {data.map((d, i) => {
        const cy = i * ROW_H + ROW_H / 2;
        const x50 = plotX + x(d.p50);
        const x95 = plotX + x(d.p95);
        return (
          <g key={d.phase}>
            <text
              x={0}
              y={cy + 4}
              fontSize={12}
              fill="var(--color-chalk-100, #ececf0)"
              fontFamily="Geist Mono, monospace"
            >
              {d.phase}
            </text>
            <line
              x1={plotX}
              x2={plotX + plotW}
              y1={cy}
              y2={cy}
              stroke={C.track}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={x50}
              x2={x95}
              y1={cy}
              y2={cy}
              stroke={C.violet}
              strokeWidth={3}
              strokeLinecap="round"
              strokeOpacity={0.5}
            />
            <circle cx={x50} cy={cy} r={5} fill={C.violet} />
            <circle
              cx={x95}
              cy={cy}
              r={5}
              fill="var(--card, #17171c)"
              stroke={C.violet}
              strokeWidth={2}
            />
            <text
              x={width - VAL_W + 6}
              y={cy + 4}
              fontSize={11}
              fill={C.axis}
              fontFamily="Geist Mono, monospace"
            >
              {d.p50}/{d.p95}s
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Phase latency as p50→p95 dumbbells. */
export function LatencyDumbbell({ data }: { data: PhaseLatencyEntry[] }) {
  if (data.length === 0) return null;
  return (
    <div className="w-full" style={{ height: data.length * ROW_H }}>
      <ParentSize>
        {({ width }) =>
          width > 0 ? <Chart data={data} width={width} /> : null
        }
      </ParentSize>
    </div>
  );
}
