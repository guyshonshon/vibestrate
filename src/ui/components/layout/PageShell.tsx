import type { ReactNode } from "react";
import { cn } from "../design/cn.js";

/**
 * The canonical page canvas, extracted verbatim from Mission Control (the design
 * source of truth). Every page body composes these three primitives instead of
 * hand-rolling `px-10 py-7` / `<header class="mb-6">` so the page-level rhythm
 * can never drift. The live reference is the /canvas route. See
 * docs/design/primitives-contract.md ("Page canvas").
 *
 * Two archetypes share one canvas:
 * - `scroll` (default): a vertical-scroll dashboard (Mission Control, config
 *   pages). `<main>` owns the scroll; the body just pads `px-10 py-7`.
 * - `fill`: a height-filling app view that owns the viewport and scrolls its own
 *   inner regions (the Board kanban). Tighter top padding (`pt-5`) so a
 *   `flex-1 min-h-0` child is not crowded by `py-7` plus the header.
 */
export function PageShell({
  variant = "scroll",
  className,
  children,
}: {
  variant?: "scroll" | "fill";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "font-jakarta",
        variant === "fill"
          ? "flex h-full min-h-0 flex-col px-10 pb-0 pt-5"
          : "px-10 py-7",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The page header block: a 24px extrabold title, an optional right-aligned
 * `actions` slot (filled `<Button>`s by their title - never a stranded ghost at
 * the far edge), and optional `children` for a contained sub-header row. No
 * eyebrow kicker, no loose grey subtitle floating on the canvas.
 */
export function PageHeader({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{title}</h1>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/**
 * A page section: `mb-4` rhythm and, when `title` is set, the 18px violet-vivid
 * heading with an optional inline `action` (a link / secondary Button by the
 * title, never stranded at the far edge).
 */
export function Section({
  title,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("mb-4", className)}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-bold text-violet-vivid">{title}</h2>
          {action ?? null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
