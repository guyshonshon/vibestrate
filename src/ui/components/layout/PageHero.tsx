import type { ReactNode } from "react";
import { cn } from "../design/cn.js";

export type HeroTone = "emerald" | "amber" | "violet" | "rose" | "neutral";

export type HeroMetric = {
  value: ReactNode;
  label: string;
  tone?: "good" | "warn" | "bad" | "default";
};

const STATE_BG: Record<HeroTone, string> = {
  emerald: "bg-emerald-500/10",
  amber: "bg-amber-soft/10",
  violet: "bg-violet-soft/10",
  rose: "bg-rose-500/10",
  neutral: "bg-coal-500/50",
};

const STATE_FG: Record<HeroTone, string> = {
  emerald: "text-emerald",
  amber: "text-amber-soft",
  violet: "text-violet-vivid",
  rose: "text-rose-300",
  neutral: "text-chalk-100",
};

const METRIC_FG: Record<NonNullable<HeroMetric["tone"]>, string> = {
  good: "text-emerald",
  warn: "text-amber-soft",
  bad: "text-rose-300",
  default: "text-chalk-300",
};

/**
 * The page header. It takes HeroCard's anatomy - a washed tonal status column
 * anchoring state as a structural surface region, then stacked registers in the
 * main column - and applies it at page scale, so a page leads with a real
 * header instead of a title floating over a paragraph.
 *
 * Four registers, each carrying something the page would otherwise scatter or
 * throw away:
 *   state    - the one fact that says whether this page needs attention
 *   headline - title, purpose, and the page's primary actions on the same row
 *   metrics  - a divided strip that runs the full width rather than a handful
 *              of chips stranded against a wide card
 *   footer   - what the current state actually means, in a sentence
 *
 * The metric strip is HeroCard's own divided strip, not the stat-tile row the
 * contract's anti-pattern list rules out - that ban is about two tiles slabbed
 * across half a card, where a divided six-cell strip stays dense.
 */
export function PageHero({
  state,
  title,
  purpose,
  actions,
  metrics = [],
  footer,
  className,
}: {
  state?: { value: ReactNode; caption: string; note?: string; tone?: HeroTone };
  title: ReactNode;
  purpose?: string;
  actions?: ReactNode;
  metrics?: HeroMetric[];
  footer?: ReactNode;
  className?: string;
}) {
  const tone = state?.tone ?? "neutral";
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-coal-600",
        className,
      )}
    >
      {state ? (
        <div
          className={cn(
            "flex w-[216px] shrink-0 flex-col justify-center gap-1 border-r border-[color:var(--line)] px-6 py-6",
            STATE_BG[tone],
          )}
        >
          <span className={cn("t-num", STATE_FG[tone])}>{state.value}</span>
          <span className={cn("t-label text-[15px] font-bold", STATE_FG[tone])}>
            {state.caption}
          </span>
          {state.note ? (
            <span className="mt-1.5 t-meta text-[13px] text-chalk-300">{state.note}</span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-6 px-6 pb-5 pt-6">
          <div className="min-w-0">
            <h1 className="t-page text-[36px] text-chalk-100">{title}</h1>
            {purpose ? (
              <p className="mt-2.5 max-w-[64ch] t-body text-[15px] text-chalk-300">
                {purpose}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
        </div>

        {metrics.length > 0 ? (
          <div className="flex border-t border-[color:var(--line)]">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="min-w-0 flex-1 border-l border-[color:var(--line-soft)] px-5 py-4 first:border-l-0"
              >
                <span
                  className={cn(
                    "block t-num text-[32px]",
                    METRIC_FG[m.tone ?? "default"],
                  )}
                >
                  {m.value}
                </span>
                <span className="mt-1.5 block t-label text-violet-vivid">{m.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {footer ? (
          <div className="flex items-center justify-between gap-4 border-t border-[color:var(--line)] bg-coal-500/45 px-6 py-3.5 t-label font-normal text-chalk-300">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
