import { Bolt, Check, Folder, ListTree, Network } from "lucide-react";
import { cn } from "../../design/cn.js";

export type InspectorV3Tab = "tree" | "steps" | "events" | "artifacts" | "validation";

export function InspectorTabsV3({
  current,
  setCurrent,
}: {
  current: InspectorV3Tab;
  setCurrent: (t: InspectorV3Tab) => void;
}) {
  const tabs: { id: InspectorV3Tab; label: string; icon: React.ReactNode }[] = [
    { id: "tree", label: "Tree", icon: <Network className="h-3.5 w-3.5" strokeWidth={1.9} /> },
    { id: "steps", label: "Steps", icon: <ListTree className="h-3.5 w-3.5" strokeWidth={1.9} /> },
    { id: "events", label: "Events", icon: <Bolt className="h-3.5 w-3.5" strokeWidth={1.9} /> },
    { id: "artifacts", label: "Artifacts", icon: <Folder className="h-3.5 w-3.5" strokeWidth={1.9} /> },
    { id: "validation", label: "Validation", icon: <Check className="h-3.5 w-3.5" strokeWidth={1.9} /> },
  ];
  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-[color:var(--line)] bg-coal-800 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setCurrent(t.id)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-medium whitespace-nowrap transition",
            current === t.id
              ? "bg-coal-500 text-chalk-100"
              : "text-chalk-400 hover:bg-coal-600 hover:text-chalk-100",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
