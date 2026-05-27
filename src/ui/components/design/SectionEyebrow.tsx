import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * A section header: an eyebrow-styled label on the left and optional trailing
 * content (a count, unit, action, or status) on the right, separated by
 * `justify-between`.
 *
 * Pass the label as `children` (it gets the eyebrow style) and the trailing
 * content as `right` — `right` is rendered as-is so callers keep their own
 * styling. Don't pass the label *and* trailing both as children: they'd land in
 * one span and run together (e.g. "…last commit5 files"). The `gap` guards
 * spacing even when both sides are wide.
 */
export function SectionEyebrow({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span className="eyebrow">{children}</span>
      {right != null ? right : null}
    </div>
  );
}
