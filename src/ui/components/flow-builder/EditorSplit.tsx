// The flow editor's two-pane frame: the flow on the left, the step inspector on
// the right, with a divider the user can drag and each pane scrolling itself.
//
// Why it is not a `Deck` row of `Cell`s, which is what these screens used
// before: a Cell's share is a fixed twelve-column span, so a one-step flow got
// two thirds of the page (at wide widths, five sixths) while the inspector -
// the pane where the editing actually happens - scrolled off the bottom and
// took the whole page down with it. Proportion here is per-flow, so it has to
// be the user's call, and the default has to favour the inspector.
//
// PanelBoard is the app's other resizable surface, and it is deliberately not
// reused here: it is a react-grid-layout board with an explicit edit mode, free
// panel positions, and per-panel chrome. A two-pane editor needs one always-live
// constraint, not a board, so this stays a small pointer handler.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePersistedState } from "../../lib/usePersistedState.js";
import { cn } from "../design/cn.js";

/**
 * The flow list may be dragged between a quarter and two thirds of the width.
 * The upper bound is past half on purpose: a twelve-step flow with long ids
 * needs to reclaim space, and only the user knows when.
 */
const MIN_LEFT = 0.25;
const MAX_LEFT = 0.65;

/** Below this the panes stack and the whole area scrolls as one column. */
const STACK_BELOW = 900;

/** Arrow-key step, in width fraction. */
const KEY_STEP = 0.02;

export function EditorSplit({
  storageKey,
  left,
  right,
  /** Left-pane share. The default leaves the inspector the larger half. */
  defaultLeft = 0.42,
  className,
}: {
  storageKey: string;
  left: ReactNode;
  right: ReactNode;
  defaultLeft?: number;
  className?: string;
}) {
  const [stored, setStored] = usePersistedState<number>(storageKey, defaultLeft);
  // Non-null only while the divider is held. Keeping the live value out of
  // localStorage means a drag is one write on release, not one per pixel.
  const [dragging, setDragging] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    };
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    measure();
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  // A stored ratio is normalized on read, not trusted: a hand-edited or stale
  // localStorage entry must not be able to collapse a pane to nothing.
  const ratio = clampRatio(dragging ?? stored, defaultLeft);
  const stacked = width > 0 && width < STACK_BELOW;

  function ratioAt(clientX: number): number {
    const el = ref.current;
    if (!el) return ratio;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return ratio;
    return clampRatio((clientX - rect.left) / rect.width, defaultLeft);
  }

  function commit(next: number): void {
    setStored(clampRatio(next, defaultLeft));
    setDragging(null);
  }

  if (stacked) {
    return (
      <div ref={ref} className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", className)}>
        {left}
        {right}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("flex min-h-0 flex-1", className)}>
      <div
        className="min-h-0 min-w-0 shrink-0 grow-0 overflow-y-auto pr-1"
        style={{ flexBasis: `${(ratio * 100).toFixed(2)}%` }}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the flow and inspector panes"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(MIN_LEFT * 100)}
        aria-valuemax={Math.round(MAX_LEFT * 100)}
        tabIndex={0}
        className="group relative flex w-4 shrink-0 cursor-col-resize items-center justify-center outline-none"
        onPointerDown={(e) => {
          // preventDefault keeps the drag from selecting text across both
          // panes, which also swallows the focus a click would have given the
          // separator - so focus is moved by hand, keeping the arrow keys live
          // after a drag.
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(ratioAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging === null) return;
          setDragging(ratioAt(e.clientX));
        }}
        onPointerUp={(e) => {
          if (dragging === null) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          commit(ratioAt(e.clientX));
        }}
        onPointerCancel={() => {
          if (dragging !== null) commit(dragging);
        }}
        onDoubleClick={() => commit(defaultLeft)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            commit(ratio - KEY_STEP);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            commit(ratio + KEY_STEP);
          } else if (e.key === "Home") {
            e.preventDefault();
            commit(defaultLeft);
          }
        }}
        title="Drag to resize. Double-click to reset."
      >
        {/* The hairline is the seam; the short bar on top of it is the grip that
            says the seam moves. Without it the divider is a 1px line nobody
            tries to drag. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 w-px transition-colors",
            dragging !== null
              ? "bg-violet-soft"
              : "bg-[color:var(--line-strong)] group-hover:bg-violet-soft/50",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "relative h-8 w-[3px] rounded-full transition-colors",
            dragging !== null
              ? "bg-violet-soft"
              : "bg-[color:var(--line-strong)] group-hover:bg-violet-soft group-focus-visible:bg-violet-soft",
          )}
        />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pl-1">{right}</div>
    </div>
  );
}

function clampRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_LEFT, Math.max(MIN_LEFT, value));
}
