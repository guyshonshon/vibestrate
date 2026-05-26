import { Bolt, Check, Folder, ListTree } from "lucide-react";
import { cn } from "../../design/cn.js";

export type InspectorV3Tab = "steps" | "events" | "artifacts" | "validation";

export function InspectorTabsV3({
  current,
  setCurrent,
}: {
  current: InspectorV3Tab;
  setCurrent: (t: InspectorV3Tab) => void;
}) {
  const tabs: { id: InspectorV3Tab; label: string; icon: React.ReactNode }[] = [
    { id: "steps", label: "Steps", icon: <ListTree className="h-3 w-3" strokeWidth={1.7} /> },
    { id: "events", label: "Events", icon: <Bolt className="h-3 w-3" strokeWidth={1.7} /> },
    { id: "artifacts", label: "Artifacts", icon: <Folder className="h-3 w-3" strokeWidth={1.7} /> },
    { id: "validation", label: "Validation", icon: <Check className="h-3 w-3" strokeWidth={1.7} /> },
  ];
  return (
    <div className="flex items-center gap-1 px-1 py-1 rounded-xl border border-white/[0.07] bg-white/[0.02]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setCurrent(t.id)}
          className={cn(
            "h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] whitespace-nowrap",
            current === t.id
              ? "bg-white/[0.06] text-fog-100"
              : "text-fog-300 hover:text-fog-100",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
