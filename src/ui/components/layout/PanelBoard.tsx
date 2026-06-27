// A movable / resizable run dashboard, ported from guify's proven board:
// react-grid-layout v2 with an edit-mode toggle. In view mode panels are plain
// interactive cards laid out at their saved positions; in edit mode you get a
// chrome bar (drag handle + title + swap/hide), corner resize, a dashed drop
// placeholder, and content is click-blocked so drags are never swallowed. RGL is
// purpose-built for this, so move/resize/placeholder/reflow come for free (no
// scale-ballooning like a sortable-grid hack).
//
// Persistence is per-browser via usePersistedState ({ layout, hidden }); "Reset
// layout" clears it. Panels missing from the saved layout fall back to their
// defaultLayout (resolveDashboardLayout), so adding one never strands the layout.
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ResponsiveGridLayout, type Layout, type LayoutItem } from "react-grid-layout";
import { GripVertical, EyeOff, Rows3, RotateCcw, Plus, SlidersHorizontal, Check } from "lucide-react";
import { usePersistedState } from "../../lib/usePersistedState.js";
import {
  resolveDashboardLayout,
  normalizeStoredLayout,
  type WidgetLayout,
} from "../../lib/dashboard-layout.js";
import "react-grid-layout/css/styles.css";
import "./grid.css";

// Panels are authored in 12-column / 56px "design units" (defaultLayout, minW/minH).
// Internally the board renders on a FINER grid - each design cell is subdivided
// GRID_UNIT times - so drag/resize snaps in smaller steps and feels free, while
// consumers keep authoring in the coarse, readable 12-col units. Layouts are
// scaled design->fine on the way in and stored already-fine.
const GRID_UNIT = 2;
const BASE_COLS = 12;
const COLS = BASE_COLS * GRID_UNIT; // 24 fine columns -> half-column width steps
const ROW_HEIGHT = 56 / GRID_UNIT; // 28px fine rows -> half-row height steps
const GAP = 12;

// Responsive breakpoints (container width, px). The base "lg" breakpoint is the
// unit grid the stored layout is authored against; narrower containers reflow to
// fewer columns (RGL generates those layouts from the base). Editing is gated to
// the base breakpoint - see the board below.
const BP = "lg" as const;
const BREAKPOINTS = { lg: 900, md: 600, sm: 0 } as const;
const COLS_BP = { lg: COLS, md: 12, sm: 6 } as const;
const RESIZE_HANDLES = ["s", "w", "e", "n", "sw", "nw", "se", "ne"] as const;

// Bump when the stored-layout unit grid changes, so pre-existing per-browser
// layouts (authored against the old coarse grid) are discarded rather than
// misread in the new finer units. No migration by design (single-user, Reset
// exists).
const LAYOUT_VERSION = "v2-fine";

type Scaled = { id: string; defaultLayout: WidgetLayout; minW: number; minH: number };
function scalePanels(panels: RegisteredPanel[]): Scaled[] {
  return panels.map((p) => ({
    id: p.id,
    defaultLayout: {
      id: p.id,
      x: p.defaultLayout.x * GRID_UNIT,
      y: p.defaultLayout.y * GRID_UNIT,
      w: p.defaultLayout.w * GRID_UNIT,
      h: p.defaultLayout.h * GRID_UNIT,
    },
    minW: (p.minW ?? 1) * GRID_UNIT,
    minH: (p.minH ?? 1) * GRID_UNIT,
  }));
}

export interface RegisteredPanel {
  id: string;
  title: string;
  defaultLayout: WidgetLayout;
  minW?: number;
  minH?: number;
  render: () => React.ReactNode;
}

type BoardState = { layout: WidgetLayout[]; hidden: string[] };
const EMPTY: BoardState = { layout: [], hidden: [] };

function toGridLayout(layout: WidgetLayout[], scaled: Scaled[]): LayoutItem[] {
  const byId = new Map(scaled.map((p) => [p.id, p]));
  return layout.map((l) => {
    const p = byId.get(l.id);
    return { i: l.id, x: l.x, y: l.y, w: l.w, h: l.h, minW: p?.minW, minH: p?.minH };
  });
}
function fromGridLayout(grid: Layout): WidgetLayout[] {
  return grid.map((g) => ({ id: g.i, x: g.x, y: g.y, w: g.w, h: g.h }));
}

export function PanelBoard({
  storageKey,
  panels,
  variant = "card",
  label = "Run dashboard",
}: {
  storageKey: string;
  panels: RegisteredPanel[];
  /** "card" gives each panel a framed surface; "bare" lets the panel's own card show. */
  variant?: "card" | "bare";
  /** Section label shown left of the edit-layout control; pass "" to omit. */
  label?: string;
}) {
  const [state, setState] = usePersistedState<BoardState>(`${storageKey}:${LAYOUT_VERSION}`, EMPTY);
  const [editMode, setEditMode] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // Active responsive breakpoint (RGL auto-detects from width). Editing is only
  // allowed at the base breakpoint, where the stored layout lives.
  const [bp, setBp] = useState<string>(BP);
  const atBase = bp === BP;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    };
    // Re-measure on window resize too. ResizeObserver is the primary signal, but
    // it can be missed in embedded/offscreen contexts, so the window listener
    // guarantees the board still re-flows when the viewport changes width.
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    // Seed an initial width synchronously so the board doesn't strand on its
    // loading skeleton waiting for the first observer callback.
    measure();
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);
  const mounted = width > 0;

  const layout = state?.layout ?? [];
  const hidden = state?.hidden ?? [];
  const scaled = scalePanels(panels);
  const resolved = resolveDashboardLayout(scaled, layout, hidden);
  const visible = panels.filter((p) => !hidden.includes(p.id));
  const gridLayout = toGridLayout(resolved, scaled);

  const onLayoutChange = (next: Layout) => {
    // Only the base breakpoint owns the stored layout; reflowed/generated
    // layouts at narrower widths are never written back.
    if (!editMode || !atBase) return;
    const norm = normalizeStoredLayout(fromGridLayout(next), panels);
    const same =
      norm.length === layout.length &&
      norm.every((n) => {
        const prev = layout.find((l) => l.id === n.id);
        return prev && prev.x === n.x && prev.y === n.y && prev.w === n.w && prev.h === n.h;
      });
    if (same) return;
    setState((s) => ({ ...(s ?? EMPTY), layout: norm }));
  };
  const hide = (id: string) =>
    setState((s) => ({ ...(s ?? EMPTY), hidden: Array.from(new Set([...(s?.hidden ?? []), id])) }));
  const show = (id: string) =>
    setState((s) => ({ ...(s ?? EMPTY), hidden: (s?.hidden ?? []).filter((h) => h !== id) }));
  const rotate = (id: string) => {
    const next = resolved.map((l) => {
      if (l.id !== id) return l;
      const p = scaled.find((x) => x.id === id);
      const minW = p?.minW ?? 1;
      const minH = p?.minH ?? 1;
      return { ...l, w: Math.max(minW, Math.min(COLS, l.h)), h: Math.max(minH, l.w) };
    });
    setState((s) => ({ ...(s ?? EMPTY), layout: normalizeStoredLayout(next, panels) }));
  };
  const reset = () => {
    setState(EMPTY);
    setEditMode(false);
  };

  const hiddenList = panels.filter((p) => hidden.includes(p.id));

  return (
    <section data-screen-label="Run dashboard">
      <div className="mb-2 flex items-center justify-between">
        {label ? <span className="eyebrow">{label}</span> : <span />}
        <div className="flex items-center gap-2">
          {editMode && !atBase ? (
            <span className="text-[11px] text-fog-400">Widen the window to rearrange</span>
          ) : null}
          <BoardEditChrome
            editMode={editMode}
            onToggle={setEditMode}
            onReset={reset}
            hiddenList={hiddenList}
            onShow={show}
          />
        </div>
      </div>
      <div ref={containerRef}>
        {!mounted ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden>
            {visible.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="h-32 animate-pulse rounded-xl border border-[color:var(--line)] bg-[color:var(--card)]"
              />
            ))}
          </div>
        ) : (
          <ResponsiveGridLayout
            className={`layout ${editMode ? "is-editing" : ""} ${variant === "bare" ? "is-bare" : ""}`}
            width={width}
            layouts={{ [BP]: gridLayout }}
            breakpoints={BREAKPOINTS}
            cols={COLS_BP}
            rowHeight={ROW_HEIGHT}
            margin={[GAP, GAP]}
            containerPadding={[0, 0]}
            onBreakpointChange={(next) => setBp(next)}
            dragConfig={{ enabled: editMode && atBase, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: editMode && atBase, handles: RESIZE_HANDLES }}
            onLayoutChange={onLayoutChange}
          >
            {visible.map((p) => (
              <div key={p.id} className="widget-frame">
                {editMode ? (
                  <div className="widget-chrome" role="toolbar" aria-label={`${p.title} controls`}>
                    <button
                      type="button"
                      className="widget-chrome-btn widget-drag-handle is-drag"
                      aria-label={`Drag ${p.title}`}
                      title="Drag"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <span className="widget-chrome-title">{p.title}</span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => rotate(p.id)}
                        className="widget-chrome-btn"
                        aria-label={`Swap ${p.title} width and height`}
                        title="Swap width / height"
                      >
                        <Rows3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => hide(p.id)}
                        className="widget-chrome-btn is-hide"
                        aria-label={`Hide ${p.title}`}
                        title="Hide"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                ) : null}
                <div className="widget-body">{p.render()}</div>
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </section>
  );
}

function BoardEditChrome({
  editMode,
  onToggle,
  onReset,
  hiddenList,
  onShow,
}: {
  editMode: boolean;
  onToggle: (next: boolean) => void;
  onReset: () => void;
  hiddenList: RegisteredPanel[];
  onShow: (id: string) => void;
}) {
  if (!editMode) {
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-fog-400 transition-colors hover:bg-[color:var(--accent)] hover:text-fog-100"
        aria-label="Edit layout"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Edit layout
      </button>
    );
  }
  return (
    <div
      role="toolbar"
      aria-label="Layout editor"
      className="inline-flex h-7 items-center gap-0.5 rounded-lg bg-violet-soft/[0.06] p-0.5 ring-1 ring-violet-soft/30"
    >
      <AddPanelPicker hiddenList={hiddenList} onAdd={onShow} />
      <button
        type="button"
        onClick={onReset}
        className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-fog-400 transition-colors hover:bg-[color:var(--accent)] hover:text-fog-100"
      >
        <RotateCcw className="h-3 w-3" /> Reset
      </button>
      <span className="mx-0.5 h-4 w-px bg-[color:var(--line-strong)]" aria-hidden />
      <button
        type="button"
        onClick={() => onToggle(false)}
        className="inline-flex h-6 items-center gap-1 rounded-md bg-violet-soft/15 px-2 text-[11px] font-medium text-violet-soft transition-colors hover:bg-violet-soft/25"
      >
        <Check className="h-3 w-3" /> Done
      </button>
    </div>
  );
}

function AddPanelPicker({
  hiddenList,
  onAdd,
}: {
  hiddenList: RegisteredPanel[];
  onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);
  const disabled = hiddenList.length === 0;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-fog-400 transition-colors hover:bg-[color:var(--accent)] hover:text-fog-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="h-3 w-3" /> {disabled ? "No hidden panels" : "Add panel"}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 min-w-[200px] rounded-xl border border-[color:var(--line)] bg-[color:var(--popover)] p-1 shadow-xl"
        >
          <div className="px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-fog-600">
            Hidden panels
          </div>
          {hiddenList.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(p.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11.5px] text-fog-200 hover:bg-[color:var(--accent)]"
            >
              <Plus className="h-3 w-3 text-fog-600" />
              {p.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
