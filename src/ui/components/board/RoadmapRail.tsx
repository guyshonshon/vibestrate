// Horizontal roadmap filter rail: an "All initiatives" chip plus one chip per
// roadmap item, each showing its linked-task count and status. Selection is
// owned by the page.

import { LayoutGrid } from "lucide-react";
import type { Priority, RoadmapItem, Task } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { toneForId } from "../design/Chip.js";
import type { ChipTone } from "../design/Chip.js";
import { TONE_SWATCH } from "./TaskCard.js";

export function RoadmapRail({
  items,
  tasks,
  active,
  onSelect,
}: {
  items: RoadmapItem[];
  tasks: Task[];
  active: string | null;
  onSelect: (id: string | null) => void;
}) {
  const totalLinked = tasks.filter((t) => t.roadmapItemId).length;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="mr-0.5 shrink-0 text-[12px] font-bold text-violet-vivid">Roadmap</span>
      <RoadmapChip
        label="All initiatives"
        meta={`${totalLinked} linked`}
        tone="violet"
        active={active === null}
        onClick={() => onSelect(null)}
        all
      />
      {items.map((rm) => {
        const linked = tasks.filter((t) => t.roadmapItemId === rm.id).length;
        return (
          <RoadmapChip
            key={rm.id}
            label={rm.title}
            meta={`${linked} - ${rm.status}`}
            tone={toneForId(rm.id)}
            priority={rm.priority}
            active={active === rm.id}
            onClick={() => onSelect(rm.id === active ? null : rm.id)}
          />
        );
      })}
    </div>
  );
}

function RoadmapChip({
  label,
  meta,
  tone,
  priority,
  active,
  onClick,
  all,
}: {
  label: string;
  meta: string;
  tone: ChipTone;
  priority?: Priority;
  active: boolean;
  onClick: () => void;
  all?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-[10px] border px-3 py-1.5 text-left transition",
        active
          ? "border-violet-soft/45 bg-violet-soft/10"
          : "border-[color:var(--line)] bg-coal-600 hover:bg-coal-500",
      )}
    >
      {all ? (
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-violet-soft" strokeWidth={1.9} />
      ) : (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_SWATCH[tone])} />
      )}
      <span className="max-w-[160px] truncate text-[12px] font-medium text-chalk-100">{label}</span>
      <span className="shrink-0 text-[10.5px] text-chalk-400">{meta}</span>
      {priority ? (
        <span
          className={cn(
            "shrink-0 text-[10px] font-semibold",
            priority === "high"
              ? "text-amber-soft"
              : priority === "medium"
                ? "text-violet-soft"
                : "text-chalk-400",
          )}
        >
          {priority}
        </span>
      ) : null}
    </button>
  );
}
