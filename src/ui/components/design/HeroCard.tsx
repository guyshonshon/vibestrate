import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * The hero card - the task hero's anatomy (TaskOverviewPanel) extracted as the
 * canonical overview surface: an overflow-hidden card whose LEFT COLUMN is a
 * washed tonal status anchor (state as a structural surface region, never an
 * edge stripe), and whose main column stacks a headline row, optional custom
 * sections, a divided metric strip, and a bordered footer.
 *
 * Two scales share the anatomy:
 * - `lg` - a page-level overview panel (the task hero, the Diffs inspector).
 * - `md` - the delightful board item: a grid card (crew hub, future catalogs).
 *
 * Live reference: the /canvas route ("Hero card" section). See
 * docs/design/primitives-contract.md.
 */

export type HeroTone = "default" | "violet" | "sky" | "emerald" | "amber" | "rose";

// Per-tone surfaces, lifted from the task hero: the column wash, and the toned
// status text. All read theme tokens so they flip under :root.light.
const TONE: Record<HeroTone, { text: string; colBg: string }> = {
  default: { text: "text-chalk-200", colBg: "bg-coal-500/40" },
  violet: { text: "text-violet-soft", colBg: "bg-violet-soft/[0.08]" },
  sky: { text: "text-sky-glow", colBg: "bg-sky-glow/[0.08]" },
  emerald: { text: "text-emerald-400", colBg: "bg-emerald-500/[0.09]" },
  amber: { text: "text-amber-soft", colBg: "bg-amber-500/[0.09]" },
  rose: { text: "text-rose-300", colBg: "bg-rose-500/[0.09]" },
};

export type HeroMetric = {
  value: ReactNode;
  label: string;
  /** Optional value class override (e.g. "text-amber-soft"). */
  valueClass?: string;
};

// Tailwind needs literal class names - static column map for the metric strip.
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function HeroCard({
  size = "lg",
  tone = "default",
  overline,
  status,
  statusSub,
  title,
  sub,
  actions,
  children,
  metrics,
  footer,
  className,
}: {
  size?: "lg" | "md";
  tone?: HeroTone;
  /** Small muted kicker above the status word (e.g. "Supervised", "Crew"). */
  overline?: ReactNode;
  /** The status column's bold toned word (e.g. "running", "default"). */
  status: ReactNode;
  /** Muted line under the status word (e.g. "live now"). */
  statusSub?: ReactNode;
  /** Headline of the main column - a state headline, or an entity name. */
  title: ReactNode;
  sub?: ReactNode;
  /** Right-aligned controls in the headline row. */
  actions?: ReactNode;
  /** Extra sections between the headline and the metric strip (callers own their borders). */
  children?: ReactNode;
  /** Divided fact strip at the bottom of the main column. */
  metrics?: HeroMetric[];
  /** Bordered footer row (real Buttons). */
  footer?: ReactNode;
  className?: string;
}) {
  const lg = size === "lg";
  const t = TONE[tone];
  const hasBody = Boolean(children) || Boolean(metrics?.length) || Boolean(footer);
  return (
    <section
      className={cn(
        "overflow-hidden border border-[color:var(--line)] bg-coal-600",
        lg ? "rounded-[22px]" : "rounded-[18px]",
        className,
      )}
    >
      <div className="flex h-full">
        {/* Status column - the state as a tonal anchor. */}
        <div
          className={cn(
            "flex shrink-0 flex-col justify-center gap-1 border-r border-[color:var(--line)]",
            lg ? "w-[136px] px-4 py-4" : "w-[104px] px-3.5 py-3",
            t.colBg,
          )}
        >
          {overline ? (
            <span className="text-[10px] font-medium text-chalk-400">{overline}</span>
          ) : null}
          <span
            className={cn(
              "break-words font-bold leading-[1.05]",
              lg ? "text-[19px]" : "text-[14px]",
              t.text,
            )}
          >
            {status}
          </span>
          {statusSub ? (
            <span className={cn("text-chalk-400", lg ? "text-[11px]" : "text-[10.5px]")}>
              {statusSub}
            </span>
          ) : null}
        </div>

        {/* Main - headline + custom sections + metric strip + footer. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "flex items-start justify-between gap-3",
              lg ? "px-5 py-3.5" : "px-4 py-3",
              hasBody && "border-b border-[color:var(--line-soft)]",
            )}
          >
            <div className="min-w-0">
              <h3
                className={cn(
                  "line-clamp-2 break-words font-bold tracking-[-0.01em] text-chalk-100",
                  lg ? "text-[16px]" : "text-[13.5px]",
                )}
              >
                {title}
              </h3>
              {sub ? (
                <p className={cn("mt-0.5 text-chalk-300", lg ? "text-[12px]" : "text-[11.5px]")}>
                  {sub}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            ) : null}
          </div>

          {children}

          {metrics && metrics.length > 0 ? (
            <div className={cn("grid", GRID_COLS[Math.min(metrics.length, 5)])}>
              {metrics.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "border-r border-[color:var(--line-soft)] last:border-r-0",
                    lg ? "px-4 py-3" : "px-3 py-2",
                  )}
                >
                  <div
                    className={cn(
                      "num-tabular font-bold leading-none",
                      lg ? "text-[16px]" : "text-[13.5px]",
                      m.valueClass ?? "text-chalk-100",
                    )}
                  >
                    {m.value}
                  </div>
                  <div className={cn("mt-1 font-medium text-violet-soft", lg ? "text-[11px]" : "text-[10.5px]")}>
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {footer ? (
            <div
              className={cn(
                "mt-auto flex items-center gap-1.5 border-t border-[color:var(--line-soft)]",
                lg ? "px-5 py-3" : "px-4 py-2.5",
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
