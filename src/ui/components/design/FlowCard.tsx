import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "./cn.js";
import { EntityIcon, type EntityKind } from "./EntityIcon.js";
import { StatTile } from "./StatTile.js";

export type FlowCardStat = { value: ReactNode; label: string; icon?: ReactNode };

/**
 * The one flow/crew card (primitives-contract §5a) - the catalog listing (Flows
 * page, the hub) and the composer's selection tiles (Mission Control, New run)
 * render through this single component so the two families can't drift the way
 * they did (facts as a grey `8 steps · 6 seats` line on one surface, `StatTile`s
 * on another).
 *
 * Two activation modes share one anatomy:
 * - **Picker** (no `footer`): the whole card is the control - click anywhere to
 *   select it. `selected` renders the violet "picked" ring.
 * - **Catalog** (`footer` given): the footer owns the actions, so only the
 *   title opens the entity; `selected` instead renders the emerald "this is
 *   the current default" ring. The two rings never apply to the same card, so
 *   one boolean carries both meanings without ambiguity.
 *
 * The meter/content area (`children`) is caller-supplied - a flow's `FlowBars`,
 * a crew's role chips, or a placeholder icon - since the entities underneath
 * genuinely differ; everything below it (description, stat tiles, footer) is
 * fixed chrome.
 */
export function FlowCard({
  entity = "flow",
  title,
  onClick,
  selected = false,
  badge,
  children,
  description,
  stats = [],
  statusBadge,
  caption,
  footer,
}: {
  entity?: EntityKind;
  title: string;
  /** Activates the card - the whole card when there's no `footer`, else just
   *  the title (the footer's buttons are the click targets otherwise). */
  onClick?: () => void;
  /** Picker: the violet "picked" ring. Catalog (with `footer`): the emerald
   *  "this is the current default" ring. */
  selected?: boolean;
  /** Trailing header cluster: status marks, `@author`, install counts, a
   *  muted "default" label - whatever metadata belongs beside the title. */
  badge?: ReactNode;
  /** The meter/content area directly under the header - a flow's `FlowBars`,
   *  a crew's role chips, or a picker placeholder icon. */
  children?: ReactNode;
  description?: string | null;
  /** Facts as `StatTile`s (§5a/§11) - never a grey meta string, never
   *  `flex-1`-stretched. */
  stats?: FlowCardStat[];
  /** One more equal-height chip in the stat-tile row (e.g. the hub's verdict). */
  statusBadge?: ReactNode;
  /** A plain, non-fact caption line (e.g. a crew's profile names) - never a
   *  count; counts belong in `stats`. */
  caption?: string;
  /** Bordered footer row of real actions (+ optional overflow menu). Presence
   *  switches the card from a single click target to title-click + footer. */
  footer?: ReactNode;
}) {
  const asButton = !!onClick && !footer;

  const header = (
    <div className="flex items-center gap-2">
      <EntityIcon
        entity={entity}
        size={16}
        className={cn("shrink-0", asButton ? (selected ? "text-violet-soft" : "text-chalk-400") : "text-violet-soft")}
      />
      {!asButton && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate bg-transparent p-0 text-left text-[13.5px] font-bold text-chalk-100 transition hover:text-violet-soft"
        >
          {title}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-chalk-100">{title}</span>
      )}
      {badge}
    </div>
  );

  const body = (
    <>
      {header}
      {children}
      {description ? (
        <p className="line-clamp-2 text-[12px] leading-snug text-chalk-300">{description}</p>
      ) : null}
      {stats.length > 0 || statusBadge ? (
        <div className={cn("flex flex-wrap items-stretch gap-1", description ? "mt-3" : "mt-1.5")}>
          {stats.map((s, i) => (
            <StatTile key={i} value={s.value} label={s.label} icon={s.icon} />
          ))}
          {statusBadge}
        </div>
      ) : null}
      {caption ? <div className="mt-1 text-[11px] text-chalk-400">{caption}</div> : null}
      {footer ? (
        <div className="mt-3.5 flex items-center gap-1.5 border-t border-[color:var(--line-soft)] pt-3">
          {footer}
        </div>
      ) : null}
    </>
  );

  if (asButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full flex-col rounded-[14px] border p-3 text-left transition",
          selected
            ? "border-violet-soft/70 bg-coal-400"
            : "border-[color:var(--line)] bg-coal-500 hover:border-[color:var(--line-strong)] hover:bg-coal-400",
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-[14px] border bg-coal-600 p-3.5",
        selected ? "border-emerald-500/40" : "border-[color:var(--line)]",
      )}
    >
      {body}
    </div>
  );
}

type FlowCardMenuItem = { label: string; onClick: () => void; danger?: boolean };

/** Overflow menu for a catalog card's secondary actions - a single contained
 *  icon button that opens a coal popover. Keeps the resting card to one
 *  primary button instead of a wrapping row of bare text links. */
export function FlowCardMenu({ items, busy }: { items: Array<FlowCardMenuItem | null>; busy?: boolean }) {
  const real = items.filter((x): x is FlowCardMenuItem => x !== null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  if (real.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-[color:var(--line-strong)] bg-coal-600 text-chalk-300 transition hover:bg-coal-500 hover:text-chalk-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[148px] overflow-hidden rounded-[12px] border border-[color:var(--line)] bg-coal-800 py-1 shadow-2xl"
        >
          {real.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-[12.5px] font-medium transition hover:bg-coal-500",
                it.danger ? "text-rose-300 hover:text-rose-300" : "text-chalk-300 hover:text-chalk-100",
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
