import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type StatTileTone = "default" | "violet" | "emerald" | "amber";
export type StatTileSize = "sm" | "lg";

/**
 * A single framed stat - a small inset card with a bold value over its unit, the
 * unit carrying violet so a card's facts read as data, not faint grey text
 * (primitives-contract §5a). Content-width (never stretched). `sm` (default) is the
 * compact card-row tile; `lg` is the prominent header-metric variant. Promoted to
 * components/design after the same recipe was inlined across 4 pages.
 */
export function StatTile({
  value,
  label,
  icon,
  tone = "default",
  size = "sm",
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  tone?: StatTileTone;
  size?: StatTileSize;
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-soft"
        : tone === "violet"
          ? "text-violet-soft"
          : "text-chalk-100";

  if (size === "lg") {
    return (
      <div className="flex min-w-[92px] flex-col gap-1 rounded-[14px] border border-[color:var(--line)] bg-coal-500/60 px-4 py-3">
        <span className={cn("num-tabular max-w-[160px] truncate text-[22px] font-bold leading-none", valueTone)}>
          {value}
        </span>
        <span className="text-[11.5px] font-medium text-violet-soft">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-[48px] flex-col gap-0.5 rounded-[10px] border border-[color:var(--line-soft)] bg-coal-500/50 px-2.5 py-1.5">
      <span
        className={cn(
          "num-tabular text-[14px] font-bold leading-none",
          icon ? "flex items-center gap-1" : "max-w-[140px] truncate",
          valueTone,
        )}
      >
        {icon ? <span className="text-violet-soft">{icon}</span> : null}
        {value}
      </span>
      <span className="text-[10.5px] font-medium text-violet-soft">{label}</span>
    </div>
  );
}
