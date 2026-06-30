import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type MetricTone = "violet" | "emerald" | "amber" | "rose" | "sky";

/**
 * A compact, information-rich KPI tile (primitives-contract "Page canvas").
 * Hierarchy derived from a real dashboard reference: a soft icon chip + label,
 * then an oversized `font-display` value with a quiet status hint, and a small
 * segment meter to its right. The meter encodes a REAL ratio (`share` = this
 * bucket / total) - filled segments are the proportion, not a fabricated trend.
 */
export function MetricCard({
  icon,
  label,
  value,
  hint,
  tone,
  share = 0,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  tone: MetricTone;
  /** 0..1 - this metric's share of the whole, drives the segment meter. */
  share?: number;
}) {
  const text: Record<MetricTone, string> = {
    violet: "text-violet-soft",
    emerald: "text-emerald-400",
    amber: "text-amber-soft",
    rose: "text-rose-300",
    sky: "text-sky-glow",
  };
  const fill: Record<MetricTone, string> = {
    violet: "bg-violet-soft",
    emerald: "bg-emerald-400",
    amber: "bg-amber-soft",
    rose: "bg-rose-400",
    sky: "bg-sky-glow",
  };
  const iconBg: Record<MetricTone, string> = {
    violet: "bg-violet-soft/12",
    emerald: "bg-emerald-400/12",
    amber: "bg-amber-soft/12",
    rose: "bg-rose-400/12",
    sky: "bg-sky-glow/12",
  };
  const seg = Math.max(0, Math.min(5, Math.round((share || 0) * 5)));
  const heights = [40, 55, 70, 85, 100];

  return (
    <div className="rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-[7px]", iconBg[tone], text[tone])}>
          {icon}
        </span>
        <span className="text-[11.5px] font-semibold text-chalk-200">{label}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-display text-[26px] font-bold leading-none tabular-nums", text[tone])}>
            {value}
          </span>
          <span className="text-[11px] text-chalk-400">{hint}</span>
        </div>
        <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
          {heights.map((h, i) => (
            <span
              key={h}
              className={cn("w-[3.5px] rounded-full", i < seg ? fill[tone] : "bg-coal-400")}
              style={{ height: `${h}%` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
