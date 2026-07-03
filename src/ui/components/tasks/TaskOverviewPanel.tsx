import { Archive, Ban, Play } from "lucide-react";
import { cn } from "../design/cn.js";
import { Button } from "../design/Button.js";
import { StatTile, type StatTileTone } from "../design/StatTile.js";
import type { Task } from "../../lib/types.js";

// Status → a colour language (same as the Board columns): active/done = emerald,
// fail/blocked = rose, attention = amber, queued = violet, idle = neutral.
function statusTone(s: Task["status"]): StatTileTone {
  switch (s) {
    case "running":
    case "done":
      return "emerald";
    case "failed":
    case "blocked":
      return "rose";
    case "waiting_for_approval":
    case "review":
      return "amber";
    case "queued":
      return "violet";
    default:
      return "default";
  }
}

const TONE_TEXT: Record<StatTileTone, string> = {
  default: "text-chalk-300",
  violet: "text-violet-soft",
  emerald: "text-emerald-400",
  amber: "text-amber-soft",
  rose: "text-rose-300",
};

// The one-line "where does this task stand / what's next" headline.
function headlineFor(
  task: Task,
  stepsTotal: number,
  blockers: number,
): { title: string; sub: string } {
  const supervised = task.runMode === "supervised";
  switch (task.status) {
    case "running":
      return { title: "Running now", sub: "An agent is working the task in its worktree." };
    case "queued":
      return { title: "Queued to start", sub: "Waiting for the scheduler to pick it up." };
    case "done":
      return { title: "Done", sub: "The task finished its run." };
    case "failed":
      return { title: "Last run failed", sub: "Review the run, then start again." };
    case "review":
      return { title: "Awaiting review", sub: "A run is ready for your verdict." };
    case "waiting_for_approval":
      return { title: "Waiting for approval", sub: "An action needs your sign-off." };
    case "blocked":
      return { title: "Blocked", sub: "Resolve what this depends on before it can run." };
    case "cancelled":
      return { title: "Cancelled", sub: "Start again to re-run it." };
    default:
      if (blockers > 0)
        return { title: "Blocked by dependencies", sub: `${blockers} task${blockers === 1 ? "" : "s"} must finish first.` };
      if (stepsTotal === 0)
        return {
          title: "Ready to plan",
          sub: supervised
            ? "Let the supervisor break this into steps, then start."
            : "Start the task, or add a checklist first.",
        };
      return {
        title: "Ready to start",
        sub: supervised
          ? "Start to sequence the steps under one worktree."
          : "Start to run the task.",
      };
  }
}

/**
 * The task's top-level control + overview panel. A task is the parent of its
 * runs, so STARTING it is a high-level control that belongs here - not inside the
 * Runs child-list. Composed from the canvas idiom: a contained header with the
 * primary controls, and a row of `lg` StatTiles for the facts.
 */
export function TaskOverviewPanel({
  task,
  stepsDone,
  stepsTotal,
  runsCount,
  busy,
  queueDisabled,
  onStart,
  onCancel,
  onArchive,
}: {
  task: Task;
  stepsDone: number;
  stepsTotal: number;
  runsCount: number;
  busy: string | null;
  queueDisabled: boolean;
  onStart: () => void;
  onCancel: () => void;
  onArchive: () => void;
}) {
  const blockers = task.dependencies?.length ?? 0;
  const tone = statusTone(task.status);
  const { title, sub } = headlineFor(task, stepsTotal, blockers);
  const startLabel =
    busy === "queue"
      ? "Starting…"
      : task.status === "running"
        ? "Running"
        : task.status === "queued"
          ? "Queued"
          : "Start task";

  return (
    <section className="rounded-[22px] border border-[color:var(--line)] bg-coal-600 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium">
            <span className="text-violet-soft">
              {task.runMode === "supervised" ? "Supervised task" : "Plain task"}
            </span>
            <span className="text-chalk-500">·</span>
            <span className={TONE_TEXT[tone]}>{task.status.replace(/_/g, " ")}</span>
          </div>
          <h2 className="text-[19px] font-bold tracking-[-0.01em] text-chalk-100">
            {title}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-chalk-300">{sub}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={onStart}
            disabled={queueDisabled}
            iconLeft={<Play className="h-3.5 w-3.5" strokeWidth={2} />}
          >
            {startLabel}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={busy !== null || task.status === "cancelled"}
            iconLeft={<Ban className="h-3.5 w-3.5" strokeWidth={1.9} />}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={onArchive}
            disabled={busy !== null}
            iconLeft={<Archive className="h-3.5 w-3.5" strokeWidth={1.9} />}
            title={task.archived ? "Un-archive" : "Archive"}
          >
            {busy === "archive" ? "…" : task.archived ? "Un-archive" : "Archive"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatTile
          size="lg"
          value={task.status.replace(/_/g, " ")}
          label="status"
          tone={tone}
        />
        <StatTile
          size="lg"
          value={stepsTotal > 0 ? `${stepsDone}/${stepsTotal}` : "-"}
          label="steps done"
          tone={stepsTotal > 0 && stepsDone === stepsTotal ? "emerald" : "default"}
        />
        <StatTile size="lg" value={runsCount} label={runsCount === 1 ? "run" : "runs"} />
        <StatTile
          size="lg"
          value={blockers}
          label="blockers"
          tone={blockers > 0 ? "amber" : "default"}
        />
        <StatTile
          size="lg"
          value={task.priority}
          label="priority"
          tone={task.priority === "high" ? "amber" : "default"}
        />
      </div>
    </section>
  );
}
