import type { ReactNode } from "react";
import { annularPath } from "./ring.js";

export type RingSegment = {
  key: string;
  value: number;
  /** Any CSS colour (token var or hex). */
  color: string;
};

/**
 * A proportion ring: each segment is a gapped annular wedge sized by its share
 * of the total, over a hollow track. The gaps between wedges are what give it
 * the house relation-ring look (same shape language as the Crew seat ring) - a
 * calm, single-family alternative to a solid pie. The centre is a free slot for
 * the headline readout. Non-interactive by design; callers own the legend.
 */
export function SegmentRing({
  segments,
  size = 180,
  thickness = 16,
  gap = 0.06,
  trackColor = "var(--line-soft, rgba(255,255,255,0.06))",
  children,
}: {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  /** Radians of empty space between adjacent segments. */
  gap?: number;
  trackColor?: string;
  children?: ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const ro = size / 2 - 3;
  const ri = ro - thickness;

  const positive = segments.filter((s) => s.value > 0);
  const total = positive.reduce((a, s) => a + s.value, 0);

  const arcs: { key: string; color: string; d: string; full?: boolean }[] = [];
  if (total > 0) {
    if (positive.length === 1) {
      // A single segment is a full ring - no gap, no seam.
      arcs.push({ key: positive[0]!.key, color: positive[0]!.color, d: "", full: true });
    } else {
      const gaps = gap * positive.length;
      const usable = Math.PI * 2 - gaps;
      let a = -Math.PI / 2;
      for (const s of positive) {
        const span = (s.value / total) * usable;
        arcs.push({
          key: s.key,
          color: s.color,
          d: annularPath(cx, cy, ri, ro, a, a + span),
        });
        a += span + gap;
      }
    }
  }

  const rMid = (ri + ro) / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
        <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={trackColor} strokeWidth={thickness} />
        {arcs.map((arc) =>
          arc.full ? (
            <circle
              key={arc.key}
              cx={cx}
              cy={cy}
              r={rMid}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
            />
          ) : (
            <path key={arc.key} d={arc.d} fill={arc.color} />
          ),
        )}
      </svg>
      {children ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
