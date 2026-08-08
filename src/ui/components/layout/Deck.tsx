import type { ReactNode } from "react";
import { cn } from "../design/cn.js";

/**
 * The page grid. Every page region is a bounded cell in twelve columns, so a
 * card can never inherit the monitor's width: at 1920 the content area is
 * 1610px, and before this existed a card holding four stat tiles was 1610px
 * wide to hold ~280px of content.
 *
 * There is no `cols` prop. Twelve is the law, not a call-site decision, and the
 * responsive ladder lives inside `Cell` so no page ever writes a breakpoint
 * prefix and gets it subtly different from its neighbour.
 *
 * `container-type: inline-size` is what makes that work: cells resolve against
 * the CONTENT width, not the viewport, so the same Deck nested inside a panel
 * still picks a sane rung. The thresholds below are the content widths at which
 * the next rung's card first reaches MIN_CARD (440px), derived rather than
 * chosen - see docs/design/repo-structure.md's sibling layout note.
 */
export function Deck({
  gap = "normal",
  className,
  children,
}: {
  gap?: "normal" | "tight";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "deck grid grid-cols-12 items-start",
        gap === "tight" ? "gap-3" : "gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Why a `full` cell is allowed to span the page. The union is closed on
 * purpose: full-width is a licence a region has to justify, not a default it
 * falls into. Adding a member is a design decision, which is the point.
 */
export type CellReason =
  | "masthead"
  | "wide-table"
  | "diff"
  | "terminal"
  | "timeline"
  | "nested-deck";

type CellProps = {
  className?: string;
  children: ReactNode;
} & (
  | { size?: "card" | "wide"; reason?: never }
  | { size: "full"; reason: CellReason }
);

/**
 * A Deck child declares its SIZE, not its span - the rung ladder is the
 * primitive's business. `card` is the default unit; `wide` is for content with
 * an irreducible minimum width (a unified diff, a wide table); `full` requires
 * a typed `reason`, so the type system asks the question a review comment used
 * to.
 */
export function Cell({ size = "card", reason, className, children }: CellProps) {
  return (
    <section
      data-cell={size}
      data-cell-reason={reason}
      className={cn("min-w-0", className)}
    >
      {children}
    </section>
  );
}
