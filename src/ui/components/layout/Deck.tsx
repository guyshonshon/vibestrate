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
  align = "start",
  className,
  children,
}: {
  gap?: "normal" | "tight";
  /**
   * `start` (default) lets each cell be its own height - right when the row
   * holds unrelated regions. `stretch` levels every card in a row to the
   * tallest, which is what a COLLECTION of peer cards wants: a ragged row of
   * near-identical cards reads as a rendering bug, not as information.
   */
  align?: "start" | "stretch";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "deck grid grid-cols-12",
        align === "stretch" ? "items-stretch" : "items-start",
        gap === "tight" ? "gap-3" : "gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A vertical run of panels inside one Cell.
 *
 * This exists because of a real limit in the Deck, worth stating so the next
 * page does not rediscover it: a grid ROW is as tall as its tallest cell, and
 * the following row cannot backfill the leftover space under a shorter one. On
 * Policies that meant a 346px list beside an 801px toggle panel left a 455px
 * void, and pushed the next region 471px down the page to below both.
 *
 * So the rule is: a Deck row must not mix cells of very unequal height. When it
 * would, the page becomes COLUMNS OF STACKS instead - one row, each Cell
 * holding a Stack that packs its own panels. Column heights then differ only at
 * the very bottom, which is the one place a difference costs nothing.
 */
export function Stack({
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
        "flex flex-col",
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
  | { size?: "card" | "wide" | "half"; reason?: never }
  | { size: "full"; reason: CellReason }
);

/**
 * A Deck child declares its SIZE, not its span - the rung ladder is the
 * primitive's business.
 *
 *   card  the default unit; packs 2 -> 3 -> 4 -> 6 per row as the deck widens
 *   wide  content with an irreducible minimum width (a diff, a wide table).
 *         Always 12 minus a card, so a wide+card row fills exactly
 *   half  an even split that STAYS even. For a page that is genuinely two
 *         columns (columns of stacks), where reflowing to 3-up would tear the
 *         two halves apart
 *   full  requires a typed `reason`, so the type system asks the question a
 *         review comment used to
 */
export function Cell({ size = "card", reason, className, children }: CellProps) {
  return (
    <section
      data-cell={size}
      data-cell-reason={reason}
      // A Cell whose child self-hides (a panel that returns null when it has
      // nothing to show) must leave the grid, not sit there as a zero-height row
      // still paying two `gap-4`s. `display:none` removes it from the grid;
      // `:empty` is exactly "the child rendered nothing".
      className={cn("min-w-0 empty:hidden", className)}
    >
      {children}
    </section>
  );
}
