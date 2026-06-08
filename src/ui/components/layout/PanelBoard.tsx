// A movable / resizable panel board, bespoke (no DnD library), matching the
// repo's existing patterns: usePersistedState for per-browser persistence and
// reorder.ts for the pure reorder math (the same approach as the provider-row
// drag and the resizable Inspector drawer).
//
// Each panel can be: reordered (drag the grip onto another panel), collapsed,
// resized in width (drag the right edge, snapped to a 12-col grid) and height
// (drag the bottom edge). Layout persists per `storageKey`; "Reset layout"
// clears it back to each panel's defaults. New panels not in the saved order
// fall in at their declared position (applyOrder), so adding one never strands
// the saved layout.
import { useRef, useState } from "react";
import { GripVertical, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { reorderByDrop, applyOrder } from "../../lib/reorder.js";

export type PanelDef = {
  id: string;
  title: string;
  /** Default width in 12-col units. */
  defaultSpan: number;
  /** Fixed body height in px (scrolls past it). Omit for content-sized. */
  defaultHeight?: number;
  minHeight?: number;
  /** Content brings its own card chrome - skip the glass body wrapper. */
  bare?: boolean;
  render: () => React.ReactNode;
};

type Layout = {
  order: string[];
  span: Record<string, number>;
  height: Record<string, number>;
  collapsed: Record<string, boolean>;
};

const EMPTY: Layout = { order: [], span: {}, height: {}, collapsed: {} };

export function PanelBoard({
  storageKey,
  panels,
}: {
  storageKey: string;
  panels: PanelDef[];
}) {
  const [layout, setLayout] = usePersistedState<Layout>(storageKey, EMPTY);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const ordered = applyOrder(panels, layout.order ?? []);
  const spanOf = (p: PanelDef) => layout.span?.[p.id] ?? p.defaultSpan;
  const heightOf = (p: PanelDef) => layout.height?.[p.id] ?? p.defaultHeight ?? null;
  const isCollapsed = (id: string) => layout.collapsed?.[id] ?? false;
  const customized =
    (layout.order?.length ?? 0) > 0 ||
    Object.keys(layout.span ?? {}).length > 0 ||
    Object.keys(layout.height ?? {}).length > 0 ||
    Object.keys(layout.collapsed ?? {}).length > 0;

  const patch = (fn: (l: Layout) => Layout) => setLayout((l) => fn(l ?? EMPTY));
  const reset = () => setLayout(EMPTY);
  const toggle = (id: string) =>
    patch((l) => ({ ...l, collapsed: { ...l.collapsed, [id]: !isCollapsed(id) } }));
  const onDrop = (targetId: string) => {
    const id = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (!id) return;
    patch((l) => ({ ...l, order: reorderByDrop(ordered.map((p) => p.id), id, targetId) }));
  };

  const startWidthResize = (e: React.PointerEvent, p: PanelDef) => {
    e.preventDefault();
    e.stopPropagation();
    const colW = (boardRef.current?.clientWidth ?? 1200) / 12;
    const startX = e.clientX;
    const startSpan = spanOf(p);
    const move = (ev: PointerEvent) => {
      const span = Math.max(1, Math.min(12, startSpan + Math.round((ev.clientX - startX) / colW)));
      patch((l) => ({ ...l, span: { ...l.span, [p.id]: span } }));
    };
    endOnUp(move, "col-resize");
  };

  const startHeightResize = (e: React.PointerEvent, p: PanelDef) => {
    e.preventDefault();
    e.stopPropagation();
    const bodyEl = (e.currentTarget as HTMLElement)
      .closest("[data-panel]")
      ?.querySelector("[data-panel-body]") as HTMLElement | null;
    const startY = e.clientY;
    const startH = heightOf(p) ?? bodyEl?.getBoundingClientRect().height ?? 200;
    const min = p.minHeight ?? 120;
    const move = (ev: PointerEvent) => {
      const h = Math.max(min, Math.round(startH + (ev.clientY - startY)));
      patch((l) => ({ ...l, height: { ...l.height, [p.id]: h } }));
    };
    endOnUp(move, "row-resize");
  };

  const endOnUp = (move: (ev: PointerEvent) => void, cursor: string) => {
    document.body.style.cursor = cursor;
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section data-screen-label="Run dashboard">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Run dashboard</span>
        {customized ? (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 text-[10.5px] text-fog-500 transition-colors hover:text-fog-300"
          >
            <RotateCcw className="h-3 w-3" /> Reset layout
          </button>
        ) : null}
      </div>
      <div ref={boardRef} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {ordered.map((p) => {
          const span = spanOf(p);
          const h = heightOf(p);
          const collapsed = isCollapsed(p.id);
          return (
            <div
              key={p.id}
              data-panel
              style={{ gridColumn: `span ${span} / span ${span}` }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overId !== p.id) setOverId(p.id);
              }}
              onDragLeave={() => setOverId((c) => (c === p.id ? null : c))}
              onDrop={() => onDrop(p.id)}
              className={`group/panel relative flex min-w-0 flex-col rounded-xl border transition-colors ${
                overId === p.id ? "border-violet-soft/50" : "border-white/[0.06]"
              } ${p.bare ? "" : "glass"}`}
            >
              {/* Title-less when open (content keeps its own header); the title
                  shows only when collapsed, since the body is then hidden. */}
              <div className="flex items-center gap-1.5 px-2 py-1">
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    dragId.current = p.id;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", p.id);
                  }}
                  onDragEnd={() => {
                    dragId.current = null;
                    setOverId(null);
                  }}
                  className="cursor-grab text-fog-700 transition-colors hover:text-fog-300 active:cursor-grabbing"
                  aria-label={`Move ${p.title}`}
                  title="Drag onto another panel to reorder"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                {collapsed ? <span className="eyebrow">{p.title}</span> : null}
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="ml-auto text-fog-700 transition-colors hover:text-fog-300"
                  aria-label={collapsed ? `Expand ${p.title}` : `Collapse ${p.title}`}
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {!collapsed ? (
                <>
                  <div
                    data-panel-body
                    className={`min-h-0 flex-1 ${p.bare ? "" : "px-3 pb-3"}`}
                    style={h != null ? { height: h, overflow: "auto" } : undefined}
                  >
                    {p.render()}
                  </div>
                  {/* Right edge: width. Bottom edge: height. */}
                  <span
                    onPointerDown={(e) => startWidthResize(e, p)}
                    className="absolute right-0 top-6 bottom-2 w-1.5 cursor-col-resize rounded-full opacity-0 transition-opacity hover:bg-violet-soft/40 group-hover/panel:opacity-100"
                    aria-hidden
                  />
                  <span
                    onPointerDown={(e) => startHeightResize(e, p)}
                    className="absolute bottom-0 left-6 right-2 h-1.5 cursor-row-resize rounded-full opacity-0 transition-opacity hover:bg-violet-soft/40 group-hover/panel:opacity-100"
                    aria-hidden
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
