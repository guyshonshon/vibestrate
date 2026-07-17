// The board's filter toolbar: title search, priority segmented filter, and a
// shown/total counter. Filter state is owned by the page.

import { Search, X } from "lucide-react";
import type { Priority } from "../../lib/types.js";
import { cn } from "../design/cn.js";

export function BoardToolbar({
  query,
  onQuery,
  priority,
  onPriority,
  tasksShown,
  totalTasks,
}: {
  query: string;
  onQuery: (v: string) => void;
  priority: "any" | Priority;
  onPriority: (v: "any" | Priority) => void;
  tasksShown: number;
  totalTasks: number;
}) {
  const priorities: Array<{ id: "any" | Priority; label: string; active: string }> = [
    { id: "any", label: "Any", active: "text-chalk-100" },
    { id: "low", label: "Low", active: "text-chalk-300" },
    { id: "medium", label: "Med", active: "text-violet-soft" },
    { id: "high", label: "High", active: "text-amber-soft" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="relative min-w-[200px] max-w-[320px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-chalk-400"
          strokeWidth={1.9}
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter by title…"
          className="w-full rounded-[10px] border border-[color:var(--line-strong)] bg-coal-800 py-1.5 pl-8 pr-3 text-[13px] text-chalk-100 placeholder:text-chalk-400 focus:border-violet-soft/50 focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-chalk-400 hover:text-chalk-100"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.9} />
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-chalk-400">Priority</span>
        <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-coal-800 p-0.5">
          {priorities.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPriority(p.id)}
              className={cn(
                "rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition",
                priority === p.id
                  ? cn("bg-coal-600 shadow-[0_1px_2px_rgba(0,0,0,0.35)]", p.active)
                  : "text-chalk-400 hover:text-chalk-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <span className="ml-auto text-[11.5px] text-chalk-400">
        showing <span className="tabular-nums text-chalk-100">{tasksShown}</span>/{totalTasks}
      </span>
    </div>
  );
}
