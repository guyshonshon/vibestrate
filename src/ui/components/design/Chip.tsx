import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type ChipTone =
  | "neutral"
  | "violet"
  | "sky"
  | "emerald"
  | "amber"
  | "rose";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-white/[0.04] border-white/10 text-fog-200",
  violet: "bg-violet-soft/10 border-violet-soft/30 text-violet-soft",
  sky: "bg-sky-glow/10 border-sky-glow/30 text-sky-glow",
  emerald: "bg-emerald-500/10 border-emerald-400/30 text-emerald-300",
  amber: "bg-amber-500/10 border-amber-400/30 text-amber-300",
  rose: "bg-rose-500/10 border-rose-400/30 text-rose-300",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[11px] font-medium whitespace-nowrap",
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
    neutral: "bg-fog-400",
    violet: "bg-violet-soft",
    sky: "bg-sky-glow",
    emerald: "bg-emerald-400",
    amber: "bg-amber-300",
    rose: "bg-rose-400",
  };
  return (
    <span className={cn("inline-block w-1.5 h-1.5 rounded-full", dots[tone])} />
  );
}

export function KBD({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-[1px] text-[10.5px] text-fog-300 leading-none h-[18px] min-w-[18px]">
      {children}
    </kbd>
  );
}
