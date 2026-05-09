import { MessageSquare, Workflow, Hourglass } from "lucide-react";
import type { Task } from "../../lib/types.js";

const PRIORITY_PILL: Record<Task["priority"], string> = {
  low: "border-amaco-fg-muted/40 text-amaco-fg-muted",
  medium: "border-amaco-accent/50 text-amaco-accent",
  high: "border-amaco-warn/60 text-amaco-warn",
};

export function TaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(task.id)}
      className="block w-full rounded border border-amaco-border bg-amaco-panel-2 p-2 text-left transition-colors hover:bg-amaco-panel"
    >
      <div className="flex items-center gap-2">
        <span
          className={`amaco-mono rounded border px-1 text-[10.5px] ${PRIORITY_PILL[task.priority]}`}
        >
          {task.priority}
        </span>
        {task.status === "waiting_for_approval" ? (
          <span className="amaco-mono inline-flex items-center gap-1 rounded border border-amaco-accent/50 px-1 text-[10.5px] text-amaco-accent">
            <Hourglass className="h-3 w-3" strokeWidth={1.5} /> approval
          </span>
        ) : null}
        <span className="ml-auto amaco-mono text-[10px] text-amaco-fg-muted">
          {task.runIds.length > 0 ? `${task.runIds.length} run` : "no runs"}
        </span>
      </div>
      <div className="mt-1.5 text-[12.5px] text-amaco-fg">{task.title}</div>
      <div className="mt-1 flex items-center gap-2 text-[10.5px] text-amaco-fg-muted">
        {task.commentsCount > 0 ? (
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" strokeWidth={1.5} />
            {task.commentsCount}
          </span>
        ) : null}
        {task.touchedFiles.length > 0 ? (
          <span className="inline-flex items-center gap-0.5">
            <Workflow className="h-3 w-3" strokeWidth={1.5} />
            {task.touchedFiles.length} file{task.touchedFiles.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {task.requiredSkills.length > 0 ? (
          <span className="amaco-mono">
            skills: {task.requiredSkills.slice(0, 2).join(",")}
            {task.requiredSkills.length > 2 ? "…" : ""}
          </span>
        ) : null}
      </div>
    </button>
  );
}
