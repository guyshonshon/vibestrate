import type { ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  CheckSquare,
  FileCode,
  FileText,
  GitCommit,
  Lightbulb,
  PlaySquare,
  ScrollText,
  ShieldCheck,
  StickyNote,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InspectorTabId } from "./inspector-tabs.js";

export type { InspectorTabId };

const TABS: { id: InspectorTabId; label: string; icon: LucideIcon }[] = [
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

export function InspectorPanel({
  activeTab,
  onChangeTab,
  children,
}: {
  activeTab: InspectorTabId;
  onChangeTab: (tab: InspectorTabId) => void;
  children: ReactNode;
}) {
  return (
    <aside className="flex h-full w-[440px] border-l border-amaco-border bg-amaco-panel">
      {/* Vertical tab rail — all 13 tabs fit without scrolling at typical
       * heights and stay scrollable below that. Icon + label on every
       * row so the labels are unambiguous. */}
      <nav
        role="tablist"
        aria-orientation="vertical"
        className="flex w-[132px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-amaco-border bg-amaco-panel-2/60 p-1.5"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChangeTab(t.id)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                isActive
                  ? "bg-amaco-accent/15 text-amaco-accent"
                  : "text-amaco-fg-dim hover:bg-amaco-panel-2 hover:text-amaco-fg"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto p-3">{children}</div>
    </aside>
  );
}
