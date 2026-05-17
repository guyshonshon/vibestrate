import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";

/**
 * Wrapper that turns its children into a reorderable section.
 * Plays with HTML5 DnD; lifts state (drag/hover/drop) into the parent
 * via callbacks so a single `useState`-driven controller can sequence
 * any number of sibling sections.
 *
 * Visual contract:
 *  - small grip handle floats in the top-right corner; entire section
 *    body is the draggable surface
 *  - the section being dragged dims + scales-down 2%
 *  - the section currently being hovered as the drop target gets an
 *    accent ring so the user can see exactly where it will land
 */
export function SortableSection({
  sectionKey,
  label,
  isDragging,
  isHoverTarget,
  collapsed,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  sectionKey: string;
  label: string;
  isDragging: boolean;
  isHoverTarget: boolean;
  /** Whether the section is collapsed (chrome stays; body hidden). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-section={sectionKey}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", sectionKey);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative transition-all ${
        isDragging ? "opacity-40 scale-[0.99]" : ""
      } ${
        isHoverTarget
          ? "ring-2 ring-amaco-accent/60 ring-offset-2 ring-offset-amaco-canvas"
          : ""
      }`}
    >
      <div
        className="absolute right-2 top-2 z-10 hidden items-center gap-1 group-hover:inline-flex"
      >
        {onToggleCollapse ? (
          <button
            type="button"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
            aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
            aria-expanded={!collapsed}
            className="rounded border border-amaco-border bg-amaco-panel/90 p-0.5 text-amaco-fg-muted hover:text-amaco-fg"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            )}
          </button>
        ) : null}
        <span
          title={`Drag to reorder · ${label}`}
          aria-label={`Drag handle: ${label}`}
          className="cursor-grab rounded border border-amaco-border bg-amaco-panel/90 p-0.5 text-amaco-fg-muted hover:text-amaco-fg"
          onMouseDown={(e) => {
            // Visual affordance — drag is handled by the parent
            // wrapper's `draggable` attr. Stop click bubbling so it
            // doesn't reach buttons inside the section.
            e.stopPropagation();
          }}
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        </span>
      </div>
      {collapsed ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
          className="block w-full border border-dashed border-amaco-border bg-amaco-panel-2/40 px-6 py-2 text-left text-[11px] text-amaco-fg-muted hover:bg-amaco-panel-2"
        >
          <span className="amaco-mono uppercase tracking-[0.14em]">
            {label}
          </span>{" "}
          · collapsed — click to expand
        </button>
      ) : (
        children
      )}
    </div>
  );
}
