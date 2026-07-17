// The board's card cluster: TaskCard (plain run), SagaCard (supervised
// container), and the RoleStack avatar strip. Cards are click-to-open and
// inline-renamable; dragging is owned by the page (handlers arrive as props).

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Bolt,
  Files,
  FlaskConical,
  Hourglass,
  Layers,
  ListChecks,
  Lock,
  MessageSquare,
  Pencil,
  Play,
  Trash2,
  Unlock,
} from "lucide-react";
import type { Priority, RoadmapItem, Task } from "../../lib/types.js";
import { cn } from "../design/cn.js";
import { Chip, toneForId } from "../design/Chip.js";
import type { ChipTone } from "../design/Chip.js";

const PRIORITY_LABEL: Record<Priority, { label: string; cls: string }> = {
  low:    { label: "low",  cls: "text-chalk-400" },
  medium: { label: "med",  cls: "text-violet-soft" },
  high:   { label: "high", cls: "text-amber-soft" },
};

export const TONE_SWATCH: Record<ChipTone, string> = {
  neutral: "bg-chalk-400",
  violet: "bg-violet-soft",
  sky: "bg-sky-glow",
  emerald: "bg-emerald-400",
  amber: "bg-amber-soft",
  rose: "bg-rose-400",
};

// ── Supervised card (compact container) ─────────────────────────────────

export function SagaCard({
  task,
  onOpen,
  canDrag,
  dragging,
  onDragStartTask,
  onDragEndTask,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
  canDrag: boolean;
  dragging: boolean;
  onDragStartTask: (taskId: string) => void;
  onDragEndTask: () => void;
}) {
  const checklist = task.checklist ?? [];
  const total = checklist.length;
  const done = checklist.filter((c) => c.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const draggedRef = useRef(false);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag}
      onDragStart={(e) => {
        draggedRef.current = true;
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartTask(task.id);
      }}
      onDragEnd={() => {
        onDragEndTask();
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 60);
      }}
      onClick={() => {
        if (draggedRef.current) return;
        onOpen(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
      }}
      data-task-id={task.id}
      className={cn(
        "group block w-full rounded-[11px] bg-violet-soft/[0.1] px-2.5 py-2 transition hover:bg-violet-soft/[0.15]",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
        <Chip tone="violet" contained>supervised</Chip>
        <span className="ml-auto font-display text-[12px] font-bold tabular-nums text-chalk-200">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-2 break-words text-[12px] font-semibold leading-snug text-chalk-100">
        {task.title}
      </div>
      <div className="mt-2 flex items-center gap-1" aria-label={`${done} of ${total} steps done`}>
        {total === 0 ? (
          <span className="text-[10px] text-chalk-300">no steps yet</span>
        ) : (
          checklist.map((c) => (
            <span
              key={c.id}
              className={cn(
                "h-1 flex-1 rounded-full",
                c.status === "done"
                  ? "bg-violet-soft"
                  : c.status === "in_progress"
                    ? "bg-violet-soft/50"
                    : "bg-coal-500",
              )}
            />
          ))
        )}
      </div>
      {total > 0 ? (
        <div className="mt-1 tabular-nums text-[10px] text-chalk-400">{pct}%</div>
      ) : null}
    </div>
  );
}

// ── Task card (compact, contained) ──────────────────────────────────────

export function TaskCard({
  task,
  roadmap,
  blockedBy,
  unlocks,
  onOpen,
  onRename,
  onDelete,
  onStart,
  canDrag,
  dragging,
  onDragStartTask,
  onDragEndTask,
}: {
  task: Task;
  roadmap: RoadmapItem | null;
  blockedBy: number;
  unlocks: number;
  onOpen: (taskId: string) => void;
  onRename: (taskId: string, nextTitle: string) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
  onStart: (taskId: string) => void;
  canDrag: boolean;
  dragging: boolean;
  onDragStartTask: (taskId: string) => void;
  onDragEndTask: () => void;
}) {
  const prio = PRIORITY_LABEL[task.priority];
  const isRunning = task.status === "running";
  const isFailed = task.status === "failed";
  const isWaiting = task.status === "waiting_for_approval";
  const isDone = task.status === "done" || task.status === "cancelled";
  // Startable = explicit run is meaningful: not terminal, not already live.
  const startable =
    !isDone && !task.archived && !isRunning && task.currentRunId == null;
  // Suppress the click-to-open that a browser may fire right after a drag.
  const draggedRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [editing, task.title]);

  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft.trim();
    setEditing(false);
    if (next && next !== task.title) {
      await onRename(task.id, next);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      committedRef.current = true;
      setEditing(false);
      setDraft(task.title);
    }
  };

  const rmTone: ChipTone | null = roadmap ? toneForId(roadmap.id) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag && !editing}
      onDragStart={(e) => {
        draggedRef.current = true;
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartTask(task.id);
      }}
      onDragEnd={() => {
        onDragEndTask();
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 60);
      }}
      onClick={(e) => {
        if (editing) return;
        if (draggedRef.current) return; // a drag just happened - don't open
        const target = e.target as HTMLElement;
        if (target.closest("[data-no-open]")) return;
        onOpen(task.id);
      }}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter") onOpen(task.id);
      }}
      data-task-id={task.id}
      className={cn(
        "group relative block w-full overflow-hidden rounded-[11px] px-2.5 py-2 text-left transition",
        canDrag && !editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging && "opacity-40",
        isWaiting
          ? "bg-amber-soft/[0.1] hover:bg-amber-soft/[0.14]"
          : isFailed
            ? "bg-rose-500/[0.1] hover:bg-rose-500/[0.14]"
            : isDone
              ? "bg-coal-600 opacity-70"
              : "bg-coal-600 hover:bg-coal-500",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("text-[10.5px] font-semibold", prio.cls)}>{prio.label}</span>
        {isWaiting ? (
          <Chip tone="amber" contained>
            <Hourglass className="h-2.5 w-2.5" strokeWidth={1.9} /> approval
          </Chip>
        ) : null}
        {isRunning ? <Chip tone="emerald" contained>running</Chip> : null}
        {isFailed ? (
          <Chip tone="rose" contained>
            <Bolt className="h-2.5 w-2.5" strokeWidth={1.9} /> failed
          </Chip>
        ) : null}
        {task.needsTesting ? (
          <Chip tone="amber" contained>
            <FlaskConical className="h-2.5 w-2.5" strokeWidth={1.9} /> testing
          </Chip>
        ) : null}
        <span className="ml-auto shrink-0 font-display text-[10px] font-bold tabular-nums text-chalk-400">
          {task.currentRunId
            ? task.currentRunId.slice(0, 8)
            : task.runIds.length > 0
              ? `${task.runIds.length} run`
              : ""}
        </span>
      </div>

      <div className="mt-1.5 flex items-start gap-1">
        {editing ? (
          <input
            ref={inputRef}
            data-no-open
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKey}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 border-b border-violet-soft/45 bg-transparent px-0.5 text-[12px] font-semibold leading-snug text-chalk-100 outline-none"
          />
        ) : (
          <div
            className={cn(
              "line-clamp-2 flex-1 break-words text-[12px] font-semibold leading-snug",
              isDone ? "text-chalk-400 line-through" : "text-chalk-100",
            )}
          >
            {task.title}
          </div>
        )}
        {startable ? (
          <button
            type="button"
            data-no-open
            onClick={(e) => {
              e.stopPropagation();
              onStart(task.id);
            }}
            className="shrink-0 p-0.5 text-chalk-400 opacity-0 transition-opacity hover:text-violet-soft group-hover:opacity-100"
            title="Start task"
            aria-label="Start task"
          >
            <Play className="h-3 w-3" strokeWidth={1.9} />
          </button>
        ) : null}
        <button
          type="button"
          data-no-open
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="shrink-0 p-0.5 text-chalk-400 opacity-0 transition-opacity hover:text-chalk-100 group-hover:opacity-100"
          title="Rename"
          aria-label="Rename task"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          data-no-open
          onClick={(e) => {
            e.stopPropagation();
            void onDelete(task.id);
          }}
          className="shrink-0 p-0.5 text-chalk-400 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
          title="Remove task"
          aria-label="Remove task"
        >
          <Trash2 className="h-3 w-3" strokeWidth={1.9} />
        </button>
      </div>

      {roadmap && rmTone ? (
        <div className="mt-1.5 flex items-center gap-1.5 truncate text-[10.5px] text-chalk-200">
          <span className={cn("h-1 w-1 shrink-0 rounded-full", TONE_SWATCH[rmTone])} />
          <span className="truncate">{roadmap.title}</span>
        </div>
      ) : null}

      {task.requiredSkills.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {task.requiredSkills.slice(0, 2).map((sid) => (
            <Chip key={sid} tone="sky" contained className="max-w-[92px]">
              <span className="truncate">{sid}</span>
            </Chip>
          ))}
          {task.requiredSkills.length > 2 ? (
            <span className="text-[10px] text-chalk-400">+{task.requiredSkills.length - 2}</span>
          ) : null}
        </div>
      ) : null}

      {task.assignedRoles.length > 0 ||
      task.commentsCount > 0 ||
      task.touchedFiles.length > 0 ||
      (task.checklist?.length ?? 0) > 0 ||
      blockedBy > 0 ||
      unlocks > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[color:var(--line-soft)] pt-1.5">
          {task.assignedRoles.length > 0 ? (
            <RoleStack roleIds={task.assignedRoles} />
          ) : (
            <span className="text-[10px] text-chalk-400">unassigned</span>
          )}
          <div className="flex items-center gap-1.5 tabular-nums text-[10px] text-chalk-300">
            {(task.checklist?.length ?? 0) > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${task.checklist!.filter((c) => c.status === "done").length}/${task.checklist!.length} checklist items done`}
              >
                <ListChecks className="h-2.5 w-2.5" strokeWidth={1.9} />
                {task.checklist!.filter((c) => c.status === "done").length}/
                {task.checklist!.length}
              </span>
            ) : null}
            {task.commentsCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-2.5 w-2.5" strokeWidth={1.9} />
                {task.commentsCount}
              </span>
            ) : null}
            {task.touchedFiles.length > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <Files className="h-2.5 w-2.5" strokeWidth={1.9} />
                {task.touchedFiles.length}
              </span>
            ) : null}
            {blockedBy > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 text-rose-300/90"
                title={`Blocked by ${blockedBy} unfinished dependency`}
              >
                <Lock className="h-2.5 w-2.5" strokeWidth={1.9} />
                {blockedBy}
              </span>
            ) : null}
            {unlocks > 0 ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${unlocks} task(s) depend on this one`}
              >
                <Unlock className="h-2.5 w-2.5" strokeWidth={1.9} />
                {unlocks}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoleStack({ roleIds }: { roleIds: string[] }) {
  const max = 3;
  const shown = roleIds.slice(0, max);
  const extra = roleIds.length - max;
  const solid: Record<ChipTone, string> = {
    neutral: "#6a7186",
    violet: "#6951f0",
    sky: "#5fa6ff",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#e11d48",
  };
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((id) => {
        const tone = toneForId(id);
        const initial =
          id.replace(/[^a-zA-Z]/g, "").charAt(0).toUpperCase() || "?";
        return (
          <span
            key={id}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] leading-none text-white ring-2 ring-coal-600"
            style={{ background: solid[tone] }}
            title={id}
          >
            {initial}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-coal-400 text-[8.5px] tabular-nums text-chalk-300 ring-2 ring-coal-600">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}
