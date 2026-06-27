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

const COLS = 12;
const ROW_HEIGHT = 56;
const GAP = 12;
const BP = "lg" as const;

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

function toGridLayout(layout: WidgetLayout[], panels: RegisteredPanel[]): LayoutItem[] {
  const byId = new Map(panels.map((p) => [p.id, p]));
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
  const [state, setState] = usePersistedState<BoardState>(storageKey, EMPTY);
  const [editMode, setEditMode] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setWidth(el.getBoundingClientRect().width);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    // Seed an initial width synchronously: ResizeObserver's first callback can be
    // delayed or missed in embedded/offscreen contexts, which would otherwise
    // strand the board on its loading skeleton.
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setWidth(initial);
    return () => ro.disconnect();
  }, []);
  const mounted = width > 0;

  const layout = state?.layout ?? [];
  const hidden = state?.hidden ?? [];
  const resolved = resolveDashboardLayout(panels, layout, hidden);
  const visible = panels.filter((p) => !hidden.includes(p.id));
  const gridLayout = toGridLayout(resolved, panels);

  const onLayoutChange = (next: Layout) => {
    if (!editMode) return;
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
      const p = panels.find((x) => x.id === id);
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
        <BoardEditChrome
          editMode={editMode}
          onToggle={setEditMode}
          onReset={reset}
          hiddenList={hiddenList}
          onShow={show}
        />
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
            breakpoints={{ [BP]: 0 }}
            cols={{ [BP]: COLS }}
            rowHeight={ROW_HEIGHT}
            margin={[GAP, GAP]}
            containerPadding={[0, 0]}
            dragConfig={{ enabled: editMode, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: editMode }}
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
