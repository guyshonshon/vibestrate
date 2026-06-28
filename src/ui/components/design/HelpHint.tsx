import { HelpCircle } from "lucide-react";
import { cn } from "./cn.js";

/** The public docs site (see README badges). A `HelpHint` deep-links to a doc
 *  by its `slug` frontmatter, e.g. `extending/add-flow`. */
export const DOCS_BASE = "https://vibestrate.com/docs";

/**
 * A small "?" affordance next to a config label that opens the relevant docs
 * page in a new tab. Used where a control isn't self-explanatory (e.g. a flow
 * step's `kind`, the seat it binds to) so the answer is one click away instead
 * of buried in the manual. `slug` must be a real doc slug (the frontmatter
 * `slug:` under `docs/content/`), so the link always resolves.
 */
export function HelpHint({
  slug,
  label,
  className,
}: {
  slug: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={`${DOCS_BASE}/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label} - open the docs`}
      aria-label={`${label} - open the docs`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 text-chalk-400 transition hover:text-violet-soft",
        className,
      )}
    >
      <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
    </a>
  );
}
