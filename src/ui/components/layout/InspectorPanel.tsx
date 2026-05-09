import type { ReactNode } from "react";

export type InspectorTabId =
  | "diff"
  | "artifact"
  | "validation"
  | "logs"
  | "notes"
  | "skills"
  | "approvals"
  | "metrics";

const TABS: { id: InspectorTabId; label: string }[] = [
  { id: "diff", label: "Diff" },
  { id: "artifact", label: "Artifact" },
  { id: "validation", label: "Validation" },
  { id: "logs", label: "Logs" },
  { id: "notes", label: "Notes" },
  { id: "skills", label: "Skills" },
  { id: "approvals", label: "Approvals" },
  { id: "metrics", label: "Metrics" },
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
    <aside className="flex h-full w-[440px] flex-col border-l border-amaco-border bg-amaco-panel">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-amaco-border px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChangeTab(t.id)}
            className={`rounded px-2 py-1 text-[11.5px] ${
              activeTab === t.id
                ? "bg-amaco-panel-2 text-amaco-fg"
                : "text-amaco-fg-dim hover:text-amaco-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </aside>
  );
}
