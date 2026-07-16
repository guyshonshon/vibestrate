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

// Contained variant: a tinted, lightly-rounded container (NOT a full pill -
// rounded-[7px], never rounded-full). Used where a flat dot+text reads
// uncontained; keeps the de-pilled spirit while giving the label an edge.
const CONTAINED: Record<ChipTone, string> = {
  neutral: "bg-coal-500 text-chalk-300",
  violet: "bg-violet-soft/14 text-violet-soft",
  sky: "bg-sky-glow/14 text-sky-glow",
  emerald: "bg-emerald-400/14 text-emerald-400",
  amber: "bg-amber-soft/14 text-amber-soft",
  rose: "bg-rose-400/14 text-rose-300",
};

export function Chip({
  children,
  tone = "neutral",
  contained = false,
  className,
}: {
  children: ReactNode;
  tone?: ChipTone;
  contained?: boolean;
  className?: string;
}) {
  if (contained) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-[7px] px-1.5 py-0.5 text-[10px] font-semibold leading-none",
          CONTAINED[tone],
          className,
        )}
      >
        {children}
      </span>
    );
  }
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

// Accent tones only - "neutral" is excluded so a hashed id always lands on a
// real hue.
const ID_TONES: ChipTone[] = ["violet", "sky", "emerald", "amber", "rose"];

/**
 * Deterministic accent for an arbitrary id (role, roadmap item, ...) so the
 * same id keeps the same tone across renders and surfaces. Adjacent ids can
 * still collide on a hue - when items must be pairwise distinct (e.g. wedges
 * on a ring), assign tones by position instead.
 */
export function toneForId(id: string): ChipTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ID_TONES[h % ID_TONES.length]!;
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
