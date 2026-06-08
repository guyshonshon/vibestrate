// A movable / resizable panel board built on dnd-kit, so dragging is reactive:
// a DragOverlay ghost follows the cursor, the other panels animate out of the
// way live (rectSortingStrategy), drop targets highlight, and the viewport
// auto-scrolls near the edges. Drag starts only from the grip handle, so clicks,
// collapse, and the edge resize handles are unaffected.
//
// Persistence (order / width-span / height / collapsed) is per-browser via
// usePersistedState; "Reset layout" clears it to each panel's defaults. New
// panels absent from the saved order fall in at their declared position
// (applyOrder), so adding one never strands the saved layout.
import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { applyOrder } from "../../lib/reorder.js";

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
  const [activeId, setActiveId] = useState<string | null>(null);

  const ordered = applyOrder(panels, layout.order ?? []);
  const orderedIds = ordered.map((p) => p.id);
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

  // A 4px activation distance keeps clicks on the grip from registering as drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    patch((l) => ({ ...l, order: arrayMove(orderedIds, from, to) }));
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

  const activePanel = activeId ? panels.find((p) => p.id === activeId) ?? null : null;

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
          <div ref={boardRef} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {ordered.map((p) => (
              <SortablePanel
                key={p.id}
                panel={p}
                span={spanOf(p)}
                height={heightOf(p)}
                collapsed={isCollapsed(p.id)}
                dragging={activeId != null}
                onToggle={() => toggle(p.id)}
                onWidthResize={(e) => startWidthResize(e, p)}
                onHeightResize={(e) => startHeightResize(e, p)}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activePanel ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-violet-soft/50 bg-[#11151d]/95 px-3 py-2 shadow-2xl">
              <GripVertical className="h-3.5 w-3.5 text-fog-400" />
              <span className="eyebrow">{activePanel.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function SortablePanel({
  panel,
  span,
  height,
  collapsed,
  dragging,
  onToggle,
  onWidthResize,
  onHeightResize,
}: {
  panel: PanelDef;
  span: number;
  height: number | null;
  collapsed: boolean;
  dragging: boolean;
  onToggle: () => void;
  onWidthResize: (e: React.PointerEvent) => void;
  onHeightResize: (e: React.PointerEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
  });
  const style: React.CSSProperties = {
    gridColumn: `span ${span} / span ${span}`,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      data-panel
      style={style}
      className={`group/panel relative flex min-w-0 flex-col rounded-xl border transition-colors ${
        isDragging
          ? "border-dashed border-violet-soft/50 opacity-40"
          : dragging
            ? "border-white/10"
            : "border-white/[0.06]"
      } ${panel.bare ? "" : "glass"}`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-fog-700 transition-colors hover:text-fog-300 active:cursor-grabbing"
          aria-label={`Move ${panel.title}`}
          title="Drag onto another panel to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {collapsed ? <span className="eyebrow">{panel.title}</span> : null}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-fog-700 transition-colors hover:text-fog-300"
          aria-label={collapsed ? `Expand ${panel.title}` : `Collapse ${panel.title}`}
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
            className={`min-h-0 flex-1 ${panel.bare ? "" : "px-3 pb-3"}`}
            style={height != null ? { height, overflow: "auto" } : undefined}
          >
            {panel.render()}
          </div>
          {/* Right edge resizes width; bottom edge resizes height. */}
          <span
            onPointerDown={onWidthResize}
            className="absolute right-0 top-6 bottom-2 w-1.5 cursor-col-resize rounded-full opacity-0 transition-opacity hover:bg-violet-soft/40 group-hover/panel:opacity-100"
            aria-hidden
          />
          <span
            onPointerDown={onHeightResize}
            className="absolute bottom-0 left-6 right-2 h-1.5 cursor-row-resize rounded-full opacity-0 transition-opacity hover:bg-violet-soft/40 group-hover/panel:opacity-100"
            aria-hidden
          />
        </>
      ) : null}
    </div>
  );
}
