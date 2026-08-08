import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * The one hover surface a chart may use.
 *
 * There were two hand-rolled copies of this - the runs area chart and the
 * activity heatmap - and they had drifted apart in every way that matters:
 * different type sizes, different inner structure, and one of them presenting
 * its figures as a grey `·`-separated run-on line, which the primitives
 * contract rules out (§11) because a dot line makes the reader parse where one
 * fact ends and the next begins.
 *
 * Both also rendered at 11px, under the 12px floor the type ladder sets. A
 * tooltip is the smallest surface in the product, which is exactly why it must
 * not be the one that goes below the floor - it is read at a glance, once,
 * while the cursor is moving.
 *
 * Positioning stays the caller's business: only the chart knows its own
 * geometry. This owns the chrome and the registers inside it.
 */

/** Chrome as a style object, for visx's `TooltipWithBounds`, which positions
 *  via inline styles and cannot take a className for the container. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  position: "absolute",
  pointerEvents: "none",
  background: "var(--card, #17171c)",
  border: "1px solid var(--line, rgba(255,255,255,0.1))",
  borderRadius: 12,
  padding: "10px 12px",
  color: "var(--color-chalk-100, #ececf0)",
  boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
};

/** The same chrome as classes, for a caller that positions its own element. */
export const CHART_TOOLTIP_CLS =
  "pointer-events-none absolute z-10 w-max max-w-[260px] rounded-[12px] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-2.5 shadow-[0_6px_24px_rgba(0,0,0,0.35)]";

export function ChartTooltip({
  style,
  className,
  children,
}: {
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(CHART_TOOLTIP_CLS, className)} style={style}>
      {children}
    </div>
  );
}

/** What is being pointed at: the bucket, the day, the hour. */
export function TooltipTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[12px] font-semibold text-chalk-300">{children}</span>
      {aside ? (
        <span className="num-tabular shrink-0 text-[12px] font-bold text-chalk-100">
          {aside}
        </span>
      ) : null}
    </div>
  );
}

/** The one number the hover is about. */
export function TooltipHeadline({ children }: { children: ReactNode }) {
  return (
    <div className="num-tabular mt-1.5 text-[17px] font-bold leading-none text-chalk-100">
      {children}
    </div>
  );
}

/** A labelled figure. `swatch` ties the row to its series colour. */
export function TooltipRow({
  label,
  value,
  swatch,
}: {
  label: ReactNode;
  value: ReactNode;
  swatch?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      {swatch ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: swatch }}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 truncate text-chalk-300">{label}</span>
      <span className="num-tabular ml-auto shrink-0 font-semibold text-chalk-100">
        {value}
      </span>
    </div>
  );
}

/** A divided strip of labelled figures - the page hero's metric strip at
 *  tooltip scale. This is what replaces a `·`-separated meta line: same
 *  density, but every number keeps the word that says what it is. */
export function TooltipFigures({
  figures,
}: {
  figures: { value: ReactNode; label: string }[];
}) {
  return (
    <div className="mt-1.5 flex gap-3">
      {figures.map((f) => (
        <div key={f.label} className="min-w-0">
          <span className="num-tabular block text-[13px] font-semibold text-chalk-100">
            {f.value}
          </span>
          <span className="block text-[12px] text-chalk-400">{f.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A rule between registers inside the tooltip. */
export function TooltipDivider() {
  return <div className="mt-2 border-t border-[color:var(--line-soft)] pt-2" />;
}
