// One kanban lane: tinted header band + count, plus the card list. Cards are
// TaskCard (plain) or SagaCard (supervised); drag state and drop handling are
// owned by the page and arrive as props.

import type { RoadmapItem, Task } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { SagaCard, TaskCard } from "./TaskCard.js";
import { validDropTargets, type CoarseId } from "./dnd.js";

export type ColumnTone = { dot: string; text: string; band: string };
export type ColumnDef = {
  id: CoarseId;
  label: string;
  tone: ColumnTone;
};

// The board is a *coarse* human kanban - not the orchestrator's fine
// run stages, which live in Mission Control. A card's column is derived from its
// status + the archived / needs-testing overlays (see coarseColumnOf). Each
// column carries a colour identity (tinted header band + count) so the eye lands
// on the right lane fast.
export const COLUMNS: ColumnDef[] = [
  { id: "planned",       label: "Planned",       tone: { dot: "bg-chalk-400",   text: "text-chalk-300",   band: "bg-white/[0.025]" } },
  { id: "in_progress",   label: "In progress",   tone: { dot: "bg-emerald-400", text: "text-emerald-400", band: "bg-emerald-400/[0.08]" } },
  { id: "needs_testing", label: "Needs testing", tone: { dot: "bg-amber-soft",  text: "text-amber-soft",  band: "bg-amber-soft/[0.08]" } },
  { id: "completed",     label: "Completed",      tone: { dot: "bg-sky-glow",    text: "text-sky-glow",    band: "bg-sky-glow/[0.08]" } },
  { id: "archived",      label: "Archived",       tone: { dot: "bg-chalk-400",   text: "text-chalk-400",   band: "bg-white/[0.015]" } },
];

export function BoardColumn({
  column,
  tasks,
  allTasks,
  items,
  onOpenTask,
  onRename,
  onDelete,
  onStart,
  dragTaskId,
  dropHint,
  onDropTask,
  onDragStartTask,
  onDragEndTask,
}: {
  column: ColumnDef;
  tasks: Task[];
  allTasks: Task[];
  items: RoadmapItem[];
  onOpenTask: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
  onStart: (taskId: string) => void;
  dragTaskId: string | null;
  dropHint: "valid" | "dim" | null;
  onDropTask: (taskId: string, columnId: CoarseId) => void;
  onDragStartTask: (taskId: string) => void;
  onDragEndTask: () => void;
}) {
  const urgent = column.id === "needs_testing" && tasks.length > 0;

  return (
    <section
      data-column={column.id}
      onDragOver={(e) => {
        if (dropHint === "valid") e.preventDefault(); // allow drop
      }}
      onDrop={(e) => {
        if (dropHint !== "valid") return;
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDropTask(id, column.id);
      }}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border bg-coal-700 transition",
        urgent ? "border-amber-soft/40" : "border-[color:var(--line)]",
        dropHint === "valid" && "border-violet-soft/60 ring-1 ring-violet-soft/40",
        dropHint === "dim" && "opacity-45",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between border-b border-[color:var(--line-soft)] px-3 py-2.5",
          column.tone.band,
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", column.tone.dot)} />
          <span className="truncate text-[12px] font-semibold text-chalk-100">
            {column.label}
          </span>
        </div>
        <span className={cn("tabular-nums text-[11px] font-semibold", column.tone.text)}>
          {tasks.length}
        </span>
      </header>

      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <li className="select-none py-6 text-center text-[11px] text-chalk-400">
            empty
          </li>
        ) : (
          tasks.map((t) => {
            const openDeps = t.dependencies.filter((depId) => {
              const dep = allTasks.find((tt) => tt.id === depId);
              return !dep || (dep.status !== "done" && dep.status !== "cancelled");
            });
            const unlocks = allTasks.filter((tt) =>
              tt.dependencies.includes(t.id),
            ).length;
            const roadmap = t.roadmapItemId
              ? items.find((rm) => rm.id === t.roadmapItemId) ?? null
              : null;
            const canDrag = validDropTargets(t).size > 0;
            const dragging = dragTaskId === t.id;
            return (
              <li key={t.id}>
                {t.runMode === "supervised" ? (
                  <SagaCard
                    task={t}
                    onOpen={onOpenTask}
                    canDrag={canDrag}
                    dragging={dragging}
                    onDragStartTask={onDragStartTask}
                    onDragEndTask={onDragEndTask}
                  />
                ) : (
                  <TaskCard
                    task={t}
                    roadmap={roadmap}
                    blockedBy={openDeps.length}
                    unlocks={unlocks}
                    onOpen={onOpenTask}
                    onRename={onRename}
                    onDelete={onDelete}
                    onStart={onStart}
                    canDrag={canDrag}
                    dragging={dragging}
                    onDragStartTask={onDragStartTask}
                    onDragEndTask={onDragEndTask}
                  />
                )}
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
