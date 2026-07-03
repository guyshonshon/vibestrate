import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../design/cn.js";

export type Crumb = {
  label: ReactNode;
  onClick?: () => void;
  /** Rendered muted + mono (e.g. an id or the current leaf). */
  muted?: boolean;
};

/**
 * A breadcrumb chain (Board › Task › Step) - the tailored trail that makes a
 * nested surface easy to place and reference. Clickable crumbs navigate up; the
 * last crumb is the current location (non-clickable). Compact, sits above a
 * PageHeader or inside a drawer header.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1 text-[11.5px] font-medium",
        className,
      )}
    >
      {items.map((c, i) => {
        const last = i === items.length - 1;
        const body = (
          <span
            className={cn(
              "truncate",
              c.muted && "font-mono text-chalk-400",
              last ? "text-chalk-200" : "text-chalk-400",
            )}
          >
            {c.label}
          </span>
        );
        return (
          <Fragment key={i}>
            {c.onClick && !last ? (
              <button
                type="button"
                onClick={c.onClick}
                className="min-w-0 max-w-[220px] truncate text-chalk-400 transition hover:text-violet-soft"
              >
                {c.label}
              </button>
            ) : (
              <span className="min-w-0 max-w-[260px]">{body}</span>
            )}
            {last ? null : (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-chalk-500"
                strokeWidth={2}
                aria-hidden
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
