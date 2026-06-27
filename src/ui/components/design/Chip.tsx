import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type ChipTone =
  | "neutral"
  | "violet"
  | "sky"
  | "emerald"
  | "amber"
  | "rose";

// No pill chrome - no rounded box, border, or fill. A flat tinted mono label,
// matching the marketing site's own label treatment (e.g. the hub's "verified").
const TONE: Record<ChipTone, string> = {
  neutral: "text-chalk-400",
  violet: "text-violet-soft",
  sky: "text-sky-glow",
  emerald: "text-emerald-400",
  amber: "text-amber-soft",
  rose: "text-rose-300",
};

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[11px] font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ToneDot({ tone = "violet" }: { tone?: ChipTone }) {
  const dots: Record<ChipTone, string> = {
    neutral: "bg-chalk-400",
    violet: "bg-violet-soft",
    sky: "bg-sky-glow",
    emerald: "bg-emerald-400",
    amber: "bg-amber-soft",
    rose: "bg-rose-400",
  };
  return (
    <span className={cn("inline-block w-1.5 h-1.5 rounded-full", dots[tone])} />
  );
}

export function KBD({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-coal-500 px-1.5 py-[1px] text-[10.5px] text-chalk-300 leading-none h-[18px] min-w-[18px]">
      {children}
    </kbd>
  );
}
