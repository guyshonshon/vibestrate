import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";

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
      <button
        type="button"
        draggable={false}
        title={`Drag to reorder · ${label}`}
        aria-label={`Drag handle: ${label}`}
        className="absolute right-2 top-2 z-10 hidden cursor-grab rounded border border-amaco-border bg-amaco-panel/90 p-0.5 text-amaco-fg-muted hover:text-amaco-fg group-hover:inline-flex"
        onMouseDown={(e) => {
          // The whole section is draggable — this is just a visual
          // affordance. Don't actually start a drag from the icon
          // (the parent will). Stop the click from bubbling so it
          // doesn't reach buttons inside the section.
          e.stopPropagation();
        }}
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      </button>
      {children}
    </div>
  );
}
