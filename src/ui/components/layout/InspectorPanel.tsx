import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileCode,
  FileText,
  GitCommit,
  Lightbulb,
  ListOrdered,
  Maximize2,
  PlaySquare,
  ScrollText,
  ShieldCheck,
  StickyNote,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InspectorTabId } from "./inspector-tabs.js";
import { usePersistedState } from "../../lib/usePersistedState.js";

export type { InspectorTabId };

const TABS: { id: InspectorTabId; label: string; icon: LucideIcon }[] = [
  { id: "events", label: "Events", icon: ListOrdered },
  { id: "diff", label: "Diff", icon: FileCode },
  { id: "artifact", label: "Artifact", icon: FileText },
  { id: "suggestions", label: "Suggestions", icon: Lightbulb },
  { id: "agent-work", label: "Agent work", icon: Activity },
  { id: "git", label: "Git", icon: GitCommit },
  { id: "validation", label: "Validation", icon: ShieldCheck },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "replay", label: "Replay", icon: PlaySquare },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "skills", label: "Skills", icon: BookOpen },
  { id: "approvals", label: "Approvals", icon: CheckSquare },
  { id: "metrics", label: "Metrics", icon: Boxes },
];

const DEFAULT_HEIGHT = 360; // px
const MIN_HEIGHT = 140;
const MAX_HEIGHT_VH = 0.85; // 85% viewport
const COLLAPSED_HEIGHT = 36; // px — just the tab strip

/**
 * Bottom drawer inspector. Sits across the full width of the run
 * page; the tab strip is always visible; the content area collapses
 * to nothing when minimized. Resize by dragging the top edge.
 * Persists height + collapsed state per-browser.
 */
export function InspectorPanel({
  activeTab,
  onChangeTab,
  children,
}: {
  activeTab: InspectorTabId;
  onChangeTab: (tab: InspectorTabId) => void;
  children: ReactNode;
}) {
  const [height, setHeight] = usePersistedState<number>(
    "vibestrate.inspector.height",
    DEFAULT_HEIGHT,
  );
  const [collapsed, setCollapsed] = usePersistedState<boolean>(
    "vibestrate.inspector.collapsed",
    false,
  );

  const startDrag = (startY: number) => {
    const startHeight = height;
    const maxPx = Math.floor(window.innerHeight * MAX_HEIGHT_VH);
    const onMove = (e: MouseEvent) => {
      // Drag up to grow, down to shrink — visual axis is inverted
      // from the math (smaller Y = larger drawer).
      const next = startHeight - (e.clientY - startY);
      setHeight(Math.max(MIN_HEIGHT, Math.min(maxPx, next)));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const effectiveHeight = collapsed ? COLLAPSED_HEIGHT : height;

  return (
    <aside
      aria-label="Run inspector"
      style={{ height: effectiveHeight }}
      className="relative flex shrink-0 flex-col border-t border-vibestrate-border bg-vibestrate-panel"
    >
      {/* Drag-to-resize handle on the top edge. Hidden when collapsed —
       * the collapse button itself is the only affordance in that
       * state to avoid visual confusion. */}
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize inspector"
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            startDrag(e.clientY);
          }}
          onDoubleClick={() => setHeight(DEFAULT_HEIGHT)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp")
              setHeight(Math.min(height + 16, window.innerHeight * MAX_HEIGHT_VH));
            else if (e.key === "ArrowDown")
              setHeight(Math.max(MIN_HEIGHT, height - 16));
          }}
          title="Drag to resize · double-click to reset"
          className="absolute left-0 right-0 top-0 z-10 h-1.5 cursor-row-resize bg-transparent hover:bg-vibestrate-accent/40 focus:bg-vibestrate-accent/60 focus:outline-none"
        />
      ) : null}

      <header
        role="tablist"
        aria-orientation="horizontal"
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-vibestrate-border-soft bg-vibestrate-panel-2/60 px-2 py-1"
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={
            collapsed
              ? "Expand inspector (or click any tab)"
              : "Collapse inspector"
          }
          aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
          aria-expanded={!collapsed}
          className="shrink-0 rounded p-1 text-vibestrate-fg-muted hover:bg-vibestrate-panel hover:text-vibestrate-fg focus:outline-none focus:ring-1 focus:ring-vibestrate-accent"
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          )}
        </button>
        <span className="vibestrate-mono mr-2 shrink-0 text-[10.5px] uppercase tracking-[0.12em] text-vibestrate-fg-muted">
          inspect
        </span>
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                onChangeTab(t.id);
                // Clicking a tab while collapsed should pop the drawer
                // open — it's the universal "show me this" gesture.
                if (collapsed) setCollapsed(false);
              }}
              className={`shrink-0 inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] transition-colors ${
                isActive
                  ? "bg-vibestrate-accent/15 text-vibestrate-accent"
                  : "text-vibestrate-fg-dim hover:bg-vibestrate-panel hover:text-vibestrate-fg"
              }`}
              title={t.label}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            if (collapsed) setCollapsed(false);
            const maxPx = Math.floor(window.innerHeight * MAX_HEIGHT_VH);
            setHeight(maxPx);
          }}
          title="Expand to full height"
          aria-label="Expand to full height"
          className="ml-auto shrink-0 rounded p-1 text-vibestrate-fg-muted hover:bg-vibestrate-panel hover:text-vibestrate-fg focus:outline-none focus:ring-1 focus:ring-vibestrate-accent"
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </header>
      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
      ) : null}
    </aside>
  );
}
